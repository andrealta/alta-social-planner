/**
 * Cria uma marca nova no planner.
 *
 * POR QUE ISTO EXISTE
 *
 * Até agora marca só entrava pela carga inicial (`scripts/carga.json`,
 * o 06-carregar), que foi feita para migrar o que já existia. Não
 * havia como abrir uma conta nova sem editar um arquivo de dados a
 * mão, e isso só apareceu quando a agência quis colocar a Hero.
 *
 * A tela do painel edita a BASE da marca, que é o texto longo sobre
 * ela. Mas a marca precisa existir antes de ter base, e o escopo
 * (quantas publicações por linha, por mês) também não tem tela. Então
 * este script faz as duas coisas que faltam: cria a linha da marca e
 * monta o escopo contratado.
 *
 * O QUE ELE NÃO FAZ
 *
 * Não preenche a base. Isso é trabalho de quem conhece a conta, e o
 * lugar certo é a tela da marca, onde dá para escrever com calma e
 * revisar. Uma marca criada aqui nasce vazia de propósito: base
 * inventada por script é pior que base em branco, porque parece
 * preenchida.
 *
 * SOBRE RODAR DUAS VEZES
 *
 * É seguro. Marca que já existe não tem nome nem segmento
 * sobrescritos, e o escopo só ganha as linhas que faltam. Ninguém
 * perde o que já escreveu por ter rodado de novo na dúvida.
 *
 * Uso:
 *   node scripts/marca-nova.mjs hero "Hero" "Alimentos" "Feed=8,Story=12"
 *   node scripts/marca-nova.mjs hero "Hero" "Alimentos"
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

function erroFatal(mensagem, ajuda) {
  console.error('\n  ' + mensagem)
  if (ajuda) console.error('  ' + ajuda)
  console.error('')
  process.exit(1)
}

/**
 * O slug é o nome curto que aparece no endereço e nos comandos.
 *
 * Sem acento, sem espaço, minúsculo. Não é preciosismo: ele vira parte
 * de uma URL e de argumento de linha de comando, e os dois quebram
 * feio com acento e espaço.
 *
 * ESTA FUNÇÃO É GÊMEA de `arrumarSlug` em `src/lib/marca.ts`. São duas
 * cópias porque uma é TypeScript do site e a outra é JavaScript de
 * linha de comando, e não há como importar uma da outra sem montar um
 * passo de build só para isso. Existe um teste que importa as duas e
 * compara resultado a resultado, justamente para a divergência
 * aparecer no dia em que acontecer.
 */
export function arrumarSlug(bruto) {
  return String(bruto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Lê o escopo escrito como "Feed=8,Story=12".
 *
 * Formato de uma linha só porque é o que cabe numa pergunta de menu.
 * Linha sem número é erro, e erro aqui é melhor que escopo com zero:
 * escopo é restrição dura na geração do planejamento, e uma linha com
 * cota zero faria a IA fechar um mês vazio sem reclamar.
 */
export function lerEscopo(bruto) {
  const texto = String(bruto ?? '').trim()
  if (!texto) return []
  const linhas = []
  for (const pedaco of texto.split(',')) {
    const t = pedaco.trim()
    if (!t) continue
    const i = t.lastIndexOf('=')
    if (i < 1) throw new Error(`"${t}" não tem o formato Nome=quantidade.`)
    const label = t.slice(0, i).trim()
    const quota = Number(t.slice(i + 1).trim())
    if (!label) throw new Error(`Falta o nome antes do = em "${t}".`)
    if (!Number.isInteger(quota) || quota <= 0) {
      throw new Error(`A quantidade de "${label}" precisa ser um número inteiro maior que zero.`)
    }
    linhas.push({ label, quota })
  }
  return linhas
}

// -------------------------------------------------------------
// Daqui para baixo é o programa. As funções acima são puras e têm
// teste próprio, então ficam importáveis sem que importar o arquivo
// dispare a criação de uma marca.
// -------------------------------------------------------------

async function principal() {
  const env = { ...lerEnvLocal(), ...process.env }
  const url = env.DATABASE_URL
  if (!url || url.includes('[YOUR-PASSWORD]')) {
    erroFatal('Não achei DATABASE_URL no .env.local.', 'Ela é a conexão direta com o Supabase.')
  }

  const [slugBruto, nome, segmento, escopoBruto] = process.argv.slice(2)
  if (!slugBruto || !nome) {
    erroFatal(
      'Uso: node scripts/marca-nova.mjs <slug> "<Nome>" "<segmento>" "Feed=8,Story=12"',
      'O segmento e o escopo são opcionais.',
    )
  }

  const slug = arrumarSlug(slugBruto)
  if (!slug) erroFatal(`"${slugBruto}" não vira um slug utilizável.`)

  let escopo = []
  try {
    escopo = lerEscopo(escopoBruto)
  } catch (e) {
    erroFatal('Escopo mal escrito: ' + e.message, 'Exemplo: Feed=8,Story=12,Reels=4')
  }

  const sql = postgres(url, { prepare: false, idle_timeout: 5 })

  console.log('')
  try {
    const [existente] = await sql`select id, name from public.brands where slug = ${slug}`

    if (existente) {
      console.log(`  A marca "${slug}" já existe: ${existente.name}.`)
      console.log('  Nome e segmento ficam como estão. Só o escopo que faltar é adicionado.')
    } else {
      await sql`
        insert into public.brands (name, slug, segment)
        values (${nome.trim()}, ${slug}, ${segmento?.trim() || null})
      `
      // Marca criada por aqui também entra no registro que a tela de
      // administração mostra. Sem isto haveria um caminho para uma marca
      // aparecer sem ninguém responder por ela, que é a única pergunta
      // que um registro precisa saber responder.
      const [nova] = await sql`select id from public.brands where slug = ${slug}`
      await sql`
        insert into public.registro_admin
          (quem, quem_nome, acao, brand_id, marca_slug, marca_nome, detalhe)
        values (null, 'linha de comando (23-marca.cmd)', 'marca_criada',
                ${nova.id}, ${slug}, ${nome.trim()},
                ${sql.json({ escopo: escopo.map((l) => `${l.label}=${l.quota}`).sort().join(', ') })})
      `
      console.log(`  Marca criada: ${nome.trim()}  (slug: ${slug})`)
      if (segmento?.trim()) console.log(`  Segmento: ${segmento.trim()}`)
    }

    const [marca] = await sql`select id, name from public.brands where slug = ${slug}`

    let novas = 0
    for (const [i, linha] of escopo.entries()) {
      const feito = await sql`
        insert into public.brand_scope (brand_id, label, monthly_quota, position)
        values (${marca.id}, ${linha.label}, ${linha.quota}, ${i})
        on conflict (brand_id, label) do nothing
      `
      if (feito.count > 0) novas++
    }
    if (escopo.length > 0) {
      console.log(
        `  Escopo: ${novas} linha(s) criada(s)` +
          (novas < escopo.length ? `, ${escopo.length - novas} já existia(m)` : ''),
      )
      for (const l of escopo) console.log(`    ${l.label}: ${l.quota} por mês`)
    }

    const [quantas] = await sql`
      select count(*)::int as n from public.brand_scope
      where brand_id = ${marca.id} and active
    `
    console.log('')
    if (quantas.n === 0) {
      console.log('  [atencao]  Esta marca ainda nao tem escopo, e sem escopo o')
      console.log('             planejamento nao tem o que fechar. Rode de novo')
      console.log('             informando as linhas, por exemplo: Feed=8,Story=12')
      console.log('')
    }

    console.log('  Proximos passos:')
    console.log('    1. Abra a marca no painel e preencha a base dela.')
    console.log('    2. Se ela tem conta no Operand, use a opcao 14 do 20-operand.cmd.')
  } catch (e) {
    console.error('\n  Falhou: ' + (e && e.message ? e.message : String(e)))
    console.error('')
    await sql.end({ timeout: 5 })
    process.exit(1)
  }
  console.log('')
  await sql.end({ timeout: 5 })
}

// Só roda quando chamado direto. Importado, entrega as funções puras.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/marca-nova.mjs')) {
  await principal()
}
