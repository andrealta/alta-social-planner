/**
 * Devolve ao banco o registro de custo dos planejamentos excluídos
 * antes da migração 0019.
 *
 * POR QUE ISTO EXISTE
 *
 * Até a 0019, excluir um planejamento apagava junto as chamadas de IA
 * que o geraram (`ai_runs`, `on delete cascade`). O dinheiro foi gasto,
 * mas o registro sumiu, e a página de Precisão passou a mostrar um
 * custo menor que o real.
 *
 * Os registros apagados DEPOIS de um backup continuam dentro dele, em
 * `backup/<data>/dados/ai_runs.json`. Este script lê todas as pastas de
 * backup, compara com o banco e devolve só o que está faltando.
 *
 * O QUE ELE NÃO FAZ
 *
 * Não altera nem apaga nada que já esteja no banco — só acrescenta.
 * Pode rodar quantas vezes quiser: na segunda vez não há o que
 * devolver. E o que foi excluído antes do primeiro backup não está em
 * lugar nenhum; esse custo não tem como voltar.
 *
 * Uso: node scripts/restaurar-custos.mjs
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const pastaBackup = join(raiz, 'backup')

function lerEnvLocal() {
  const caminho = join(raiz, '.env.local')
  if (!existsSync(caminho)) return {}
  const out = {}
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue
    const i = linha.indexOf('=')
    if (i < 0) continue
    let v = linha.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[linha.slice(0, i).trim()] = v
  }
  return out
}

function lerJson(caminho) {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'))
  } catch {
    return null
  }
}

const dolar = (v) => 'US$ ' + v.toFixed(v < 1 ? 3 : 2).replace('.', ',')
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro']

const env = { ...lerEnvLocal(), ...process.env }
const banco = env.DATABASE_URL
const linha = '--------------------------------------------------------'

console.log('')
console.log(linha)
console.log(' Devolvendo o custo dos planejamentos excluidos')
console.log(linha)
console.log('')

if (!banco || banco.includes('[YOUR-PASSWORD]')) {
  console.log('PARA AQUI: DATABASE_URL ausente ou incompleta no .env.local.')
  process.exit(1)
}
if (!existsSync(pastaBackup)) {
  console.log('PARA AQUI: nao existe a pasta backup/. Sem backup nao ha o que devolver.')
  process.exit(1)
}

// ---------- 1. o que os backups guardaram ----------
const pastas = readdirSync(pastaBackup)
  .filter((n) => statSync(join(pastaBackup, n)).isDirectory())
  .sort()

const doBackup = new Map() // id -> linha de ai_runs
const planoDoBackup = new Map() // plan_id -> { mes, ano }
for (const p of pastas) {
  const corridas = lerJson(join(pastaBackup, p, 'dados', 'ai_runs.json'))
  const planos = lerJson(join(pastaBackup, p, 'dados', 'plans.json'))
  if (Array.isArray(corridas)) for (const c of corridas) if (c && c.id) doBackup.set(c.id, c)
  if (Array.isArray(planos)) {
    for (const pl of planos) if (pl && pl.id) planoDoBackup.set(pl.id, { mes: pl.month, ano: pl.year })
  }
}

console.log(`  pastas de backup lidas   ${pastas.length}`)
console.log(`  chamadas de IA nelas     ${doBackup.size}`)
console.log('')

if (doBackup.size === 0) {
  console.log('  Nenhuma chamada de IA nos backups. Nada a fazer.')
  process.exit(0)
}

const sql = postgres(banco, { max: 1, prepare: false, ssl: banco.includes('localhost') ? false : 'require' })
let falhou = false

try {
  // ---------- 2. o que o banco tem hoje ----------
  const noBanco = new Set((await sql`select id from ai_runs`).map((r) => r.id))
  const planosVivos = new Set((await sql`select id from plans`).map((r) => r.id))
  const ideiasVivas = new Set((await sql`select id from content_ideas`).map((r) => r.id))
  const marcasVivas = new Set((await sql`select id from brands`).map((r) => r.id))

  const faltando = [...doBackup.values()].filter((c) => !noBanco.has(c.id))
  const semMarca = faltando.filter((c) => !marcasVivas.has(c.brand_id))
  const devolver = faltando.filter((c) => marcasVivas.has(c.brand_id))

  console.log(`  ja estao no banco        ${doBackup.size - faltando.length}`)
  console.log(`  faltando no banco        ${faltando.length}`)
  if (semMarca.length > 0) {
    console.log(`  de marca que nao existe  ${semMarca.length} (ficam de fora)`)
  }
  console.log('')

  if (devolver.length === 0) {
    console.log(linha)
    console.log('  Nada a devolver: o banco ja tem tudo o que os backups guardaram.')
    console.log(linha)
    await sql.end({ timeout: 5 })
    process.exit(0)
  }

  // ---------- 3. devolvendo ----------
  let usd = 0
  const meses = new Map() // "2026-11" -> usd
  for (const c of devolver) {
    const planoExiste = c.plan_id && planosVivos.has(c.plan_id)
    const origem = c.plan_id ? planoDoBackup.get(c.plan_id) : null
    // Chamada cujo mês já não existe volta marcada como "de mês
    // excluído" — é exatamente o que ela é.
    const excluido = c.plan_id && !planoExiste
    await sql`
      insert into ai_runs (
        id, brand_id, plan_id, idea_id, run_id, agent, model, prompt_version,
        input_tokens, cache_write_tokens, cache_read_tokens, output_tokens, web_searches,
        cost_usd, latency_ms, status, error, created_at,
        plano_excluido_em, plano_mes, plano_ano
      ) values (
        ${c.id}, ${c.brand_id}, ${planoExiste ? c.plan_id : null},
        ${c.idea_id && ideiasVivas.has(c.idea_id) ? c.idea_id : null},
        ${c.run_id ?? null}, ${c.agent}, ${c.model ?? ''}, ${c.prompt_version ?? ''},
        ${Number(c.input_tokens ?? 0)}, ${Number(c.cache_write_tokens ?? 0)},
        ${Number(c.cache_read_tokens ?? 0)}, ${Number(c.output_tokens ?? 0)},
        ${Number(c.web_searches ?? 0)}, ${Number(c.cost_usd ?? 0)},
        ${c.latency_ms ?? null}, ${c.status ?? 'ok'}, ${c.error ?? null}, ${c.created_at},
        ${excluido ? new Date().toISOString() : null},
        ${excluido && origem ? Number(origem.mes) : null},
        ${excluido && origem ? Number(origem.ano) : null}
      )
      on conflict (id) do nothing
    `
    const v = Number(c.cost_usd ?? 0)
    usd += v
    const chave = excluido && origem ? `${origem.ano}-${String(origem.mes).padStart(2, '0')}` : 'sem mes'
    meses.set(chave, (meses.get(chave) ?? 0) + v)
  }

  console.log(linha)
  console.log(`  Devolvidas ${devolver.length} chamada(s), somando ${dolar(usd)}.`)
  console.log('')
  for (const [k, v] of [...meses.entries()].sort()) {
    if (k === 'sem mes') {
      console.log(`    sem mes identificado        ${dolar(v)}`)
    } else {
      const [a, m] = k.split('-').map(Number)
      console.log(`    ${(MESES[m - 1] + ' de ' + a).padEnd(28)}${dolar(v)}`)
    }
  }
  console.log('')
  console.log('  A pagina Precisao ja mostra esses valores.')
  console.log(linha)
} catch (e) {
  falhou = true
  console.error('')
  console.error('FALHOU: ' + (e && e.message ? e.message : String(e)))
  console.error('')
  console.error('Se a mensagem fala de "plano_excluido_em", rode o 04-migrar.cmd antes.')
  console.error('Me mande esta tela inteira.')
} finally {
  await sql.end({ timeout: 5 })
}
console.log('')
process.exit(falhou ? 1 : 0)
