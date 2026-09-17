/**
 * Aplicador de migrações do Alta Social Planner.
 *
 * Lê a DATABASE_URL do .env.local, aplica em ordem toda migração ainda
 * não aplicada e registra o que foi feito.
 *
 * Duas regras que este arquivo segue à risca:
 *
 * 1. A senha NUNCA é impressa. Só o endereço do servidor aparece no log,
 *    para você conferir que apontou para o projeto certo.
 *
 * 2. O controle de migrações mora no schema `migracoes`, não no `public`.
 *    A migração 0002 tem uma verificação que varre todo o schema public e
 *    falha se achar tabela sem proteção — uma tabela de controle ali
 *    derrubaria a própria migração que a criou.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
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
    const igual = linha.indexOf('=')
    if (igual < 0) continue
    const chave = linha.slice(0, igual).trim()
    let valor = linha.slice(igual + 1).trim()
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }
    out[chave] = valor
  }
  return out
}

function servidorDe(url) {
  try {
    const u = new URL(url)
    return `${u.hostname}:${u.port || 5432}${u.pathname}`
  } catch {
    return '(não consegui interpretar o endereço)'
  }
}

const env = { ...lerEnvLocal(), ...process.env }
const url = env.DATABASE_URL

console.log('============================================')
console.log(' Alta Social Planner - migracoes do banco')
console.log(' ' + new Date().toLocaleString('pt-BR'))
console.log('============================================\n')

if (!url) {
  console.error('ERRO: DATABASE_URL nao encontrada.')
  console.error('')
  console.error('Confira se o arquivo .env.local existe na pasta do projeto')
  console.error('e se a linha DATABASE_URL= esta preenchida.')
  process.exit(1)
}

if (url.includes('[YOUR-PASSWORD]') || url.includes('SUA-SENHA')) {
  console.error('ERRO: a DATABASE_URL ainda tem o marcador de senha.')
  console.error('')
  console.error('Substitua o trecho [YOUR-PASSWORD] pela senha real do banco.')
  process.exit(1)
}

console.log('Servidor: ' + servidorDe(url))
console.log('')

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: url.includes('localhost') ? false : 'require',
  onnotice: (n) => {
    if (n.message) console.log('   aviso do banco: ' + n.message)
  },
})

let falhou = false

/**
 * Executa um texto com VARIAS instrucoes SQL.
 *
 * O driver usa, por padrao, o protocolo estendido do Postgres, que aceita
 * uma instrucao por vez. Arquivo de migracao tem dezenas. O `.simple()`
 * troca para o protocolo simples, que aceita o arquivo inteiro de uma vez.
 * Como o nome desse metodo ja mudou entre versoes do driver, confiro se
 * existe antes de chamar em vez de assumir.
 */
async function executarSql(conexao, texto) {
  const consulta = conexao.unsafe(texto)
  if (consulta && typeof consulta.simple === 'function') {
    return await consulta.simple()
  }
  return await consulta
}

try {
  await executarSql(
    sql,
    `create schema if not exists migracoes;
     create table if not exists migracoes.aplicadas (
       arquivo     text primary key,
       aplicada_em timestamptz not null default now()
     );`,
  )

  const pasta = join(raiz, 'supabase', 'migrations')
  const arquivos = readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort()

  const jaAplicadas = new Set(
    (await sql`select arquivo from migracoes.aplicadas`).map((r) => r.arquivo),
  )

  console.log(`Encontrei ${arquivos.length} migracao(oes).\n`)

  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) {
      console.log(`  =  ${arquivo}  (ja estava aplicada, pulando)`)
      continue
    }
    console.log(`  >  ${arquivo}  aplicando...`)
    const conteudo = readFileSync(join(pasta, arquivo), 'utf8')
    await sql.begin(async (tx) => {
      await executarSql(tx, conteudo)
      await tx`insert into migracoes.aplicadas (arquivo) values (${arquivo})`
    })
    console.log(`     ok`)
  }

  // ---------- conferencia ----------
  console.log('\n--------------------------------------------')
  console.log(' Conferencia')
  console.log('--------------------------------------------')

  const tabelas = await sql`
    select c.relname as nome, c.relrowsecurity as protegida,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `

  console.log(`\nTabelas criadas no schema public: ${tabelas.length}\n`)
  for (const t of tabelas) {
    const marca = t.protegida && Number(t.politicas) > 0 ? '[ok]  ' : '[ATENCAO] '
    console.log(
      `  ${marca}${t.nome}  -  protecao: ${t.protegida ? 'ligada' : 'DESLIGADA'}, politicas: ${t.politicas}`,
    )
  }

  const desprotegidas = tabelas.filter(
    (t) => !t.protegida || Number(t.politicas) === 0,
  )

  console.log('')
  if (desprotegidas.length === 0) {
    console.log('RESULTADO: todas as tabelas estao protegidas e com politica.')
  } else {
    falhou = true
    console.log(
      'RESULTADO: ATENCAO - ' +
        desprotegidas.length +
        ' tabela(s) sem protecao. Nao siga adiante, me avise.',
    )
  }

  const secoes = await sql`select unnest(enum_range(null::knowledge_section))::text as v`
  console.log(`\nSecoes da base de marca: ${secoes.length} (esperado: 11, sendo 9 em uso)`)
} catch (e) {
  falhou = true
  console.error('\n############################################')
  console.error(' FALHOU')
  console.error('############################################')
  console.error('')
  console.error('Mensagem: ' + (e && e.message ? e.message : String(e)))
  if (e && e.detail) console.error('Detalhe: ' + e.detail)
  if (e && e.hint) console.error('Dica: ' + e.hint)
  if (e && e.where) console.error('Onde: ' + e.where)
  console.error('')
  console.error('Nada foi aplicado pela metade: cada migracao roda dentro de')
  console.error('uma transacao, entao ou entra inteira ou nao entra.')
} finally {
  await sql.end({ timeout: 5 })
}

console.log('\n============================================')
console.log(falhou ? ' fim - COM PROBLEMA' : ' fim - tudo certo')
console.log('============================================')

process.exit(falhou ? 1 : 0)
