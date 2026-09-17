/**
 * Carrega as marcas do MVP no banco novo.
 *
 * Idempotente: pode rodar quantas vezes quiser. Marca existente é
 * atualizada pelo slug, seção existente é substituída, escopo é
 * reconciliado. Rodar duas vezes não duplica nada.
 *
 * Conecta direto pela DATABASE_URL, por cima das políticas — carga
 * inicial é trabalho de administração, igual ao script de usuários.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

function lerEnvLocal() {
  const caminho = join(raiz, '.env.local')
  if (!existsSync(caminho)) return {}
  const out = {}
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue
    const i = linha.indexOf('=')
    if (i < 0) continue
    let v = linha.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[linha.slice(0, i).trim()] = v
  }
  return out
}

const env = { ...lerEnvLocal(), ...process.env }
const url = env.DATABASE_URL
if (!url || url.includes('[YOUR-PASSWORD]')) {
  console.error('ERRO: DATABASE_URL ausente ou incompleta no .env.local.')
  process.exit(1)
}

const carga = JSON.parse(readFileSync(join(raiz, 'scripts', 'carga.json'), 'utf8'))

console.log('============================================')
console.log(' Carga das marcas')
console.log(' ' + new Date().toLocaleString('pt-BR'))
console.log('============================================\n')

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: url.includes('localhost') ? false : 'require',
})

let falhou = false

try {
  // Quem administra fica como responsável pelas marcas, para o painel
  // mostrar o vínculo em vez de um traço.
  const admins = await sql`select id, name, email from profiles where role = 'admin'`
  if (admins.length === 0) {
    console.log('Aviso: nenhum administrador cadastrado ainda.')
    console.log('       As marcas entram mesmo assim, sem vinculo de responsavel.\n')
  }

  for (const m of carga.marcas) {
    await sql.begin(async (tx) => {
      // A cor entra aqui quando o arquivo traz uma. Sem cor no arquivo,
      // a que já estiver no banco é preservada — quem escolheu pela
      // tela não perde a escolha ao rodar a carga de novo.
      const [marca] = await tx`
        insert into brands (name, slug, segment, color)
        values (${m.name}, ${m.slug}, ${m.segment}, ${m.color ?? null})
        on conflict (slug) do update
          set name = excluded.name,
              segment = excluded.segment,
              color = coalesce(excluded.color, brands.color)
        returning id, name
      `

      let secoes = 0
      let campos = 0
      for (const [secao, valores] of Object.entries(m.base)) {
        if (Object.keys(valores).length === 0) continue
        await tx`
          insert into brand_knowledge (brand_id, section, content)
          values (${marca.id}, ${secao}::knowledge_section, ${tx.json(valores)})
          on conflict (brand_id, section) do update
            set content = excluded.content, updated_at = now()
        `
        secoes++
        campos += Object.keys(valores).length
      }

      // Escopo: reconcilia em vez de acumular linha velha.
      const rotulos = m.escopo.map((e) => e.label)
      for (const e of m.escopo) {
        await tx`
          insert into brand_scope (brand_id, label, monthly_quota, position)
          values (${marca.id}, ${e.label}, ${e.quota}, ${e.pos})
          on conflict (brand_id, label) do update
            set monthly_quota = excluded.monthly_quota, position = excluded.position, active = true
        `
      }
      await tx`
        update brand_scope set active = false
        where brand_id = ${marca.id} and label <> all(${rotulos})
      `

      for (const a of admins) {
        await tx`
          insert into brand_members (brand_id, user_id, access)
          values (${marca.id}, ${a.id}, 'owner')
          on conflict do nothing
        `
      }

      const total = m.escopo.reduce((s, e) => s + e.quota, 0)
      console.log(`  ${marca.name}`)
      console.log(`     ${secoes} secoes, ${campos} campos`)
      console.log(`     escopo: ${m.escopo.map((e) => `${e.label} ${e.quota}`).join(', ')}  =  ${total}/mes`)
      console.log('')
    })
  }

  console.log('--------------------------------------------')
  console.log(' Conferencia')
  console.log('--------------------------------------------\n')

  const resumo = await sql`
    select b.name,
           (select count(*) from brand_knowledge k where k.brand_id = b.id) as secoes,
           (select coalesce(sum(s.monthly_quota),0) from brand_scope s
             where s.brand_id = b.id and s.active) as cota,
           (select count(*) from brand_members m where m.brand_id = b.id) as membros
    from brands b order by b.name
  `
  for (const r of resumo) {
    console.log(`  ${r.name}: ${r.secoes} secoes, cota ${r.cota}/mes, ${r.membros} membro(s)`)
  }
  console.log('')
  const ok = resumo.length >= carga.marcas.length && resumo.every((r) => Number(r.secoes) === 9)
  console.log(
    ok
      ? `RESULTADO: as ${resumo.length} marcas estao com as 9 secoes.`
      : 'RESULTADO: algo ficou faltando, me avise.',
  )
  if (!ok) falhou = true
} catch (e) {
  falhou = true
  console.error('\nFALHOU: ' + (e && e.message ? e.message : String(e)))
  if (e && e.detail) console.error('Detalhe: ' + e.detail)
} finally {
  await sql.end({ timeout: 5 })
}

console.log('\n============================================')
console.log(falhou ? ' fim - COM PROBLEMA' : ' fim - tudo certo')
console.log('============================================')
process.exit(falhou ? 1 : 0)
