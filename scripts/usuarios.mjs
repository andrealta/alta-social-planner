/**
 * Lista as pessoas cadastradas e define o papel de cada uma.
 *
 * Por que isto existe: quando alguém é criada no painel do Supabase, o
 * gatilho do banco cria o perfil com papel `client` — menor privilégio
 * por omissão. Quem é da Alta precisa ser promovida a `staff` ou
 * `admin`, e é isso que este script faz.
 *
 * Conecta direto no banco, com a DATABASE_URL, o que passa por cima das
 * políticas de isolamento. É deliberado: administrar quem pode o quê não
 * pode depender de já poder alguma coisa. Por isso o arquivo roda na sua
 * máquina, nunca no site.
 *
 * Uso:
 *   node scripts/usuarios.mjs                       lista todo mundo
 *   node scripts/usuarios.mjs email@alta.com admin  define o papel
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAPEIS = ['admin', 'staff', 'client']

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
  console.error('ERRO: DATABASE_URL ausente ou ainda com o marcador de senha no .env.local.')
  process.exit(1)
}

const [emailAlvo, papelAlvo] = process.argv.slice(2)

if (emailAlvo && !PAPEIS.includes(papelAlvo)) {
  console.error(`ERRO: papel invalido. Use um destes: ${PAPEIS.join(', ')}`)
  process.exit(1)
}

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: url.includes('localhost') ? false : 'require',
})

let falhou = false

try {
  if (emailAlvo) {
    const alterados = await sql`
      update profiles set role = ${papelAlvo}::user_role
      where lower(email) = lower(${emailAlvo})
      returning name, email, role
    `
    if (alterados.length === 0) {
      falhou = true
      console.log(`\nNao achei ninguem com o e-mail  ${emailAlvo}`)
      console.log('')
      console.log('Confira se a pessoa ja foi criada no painel do Supabase,')
      console.log('em Authentication -> Users. O perfil so nasce depois disso.')
    } else {
      const p = alterados[0]
      console.log(`\nPronto: ${p.name} (${p.email}) agora e  ${p.role}\n`)
    }
  }

  const pessoas = await sql`
    select p.name, p.email, p.role, p.created_at,
           (select count(*) from brand_members m where m.user_id = p.id) as marcas
    from profiles p
    order by p.role, p.name
  `

  console.log('--------------------------------------------------------')
  console.log(' Pessoas cadastradas')
  console.log('--------------------------------------------------------')

  if (pessoas.length === 0) {
    console.log('')
    console.log('  Nenhuma ainda.')
    console.log('')
    console.log('  Crie a primeira no painel do Supabase:')
    console.log('  Authentication -> Users -> Add user -> Create new user')
    console.log('')
  } else {
    console.log('')
    for (const p of pessoas) {
      const papel = String(p.role).padEnd(7)
      console.log(`  [${papel}] ${p.name}`)
      console.log(`            ${p.email}  -  ${p.marcas} marca(s) vinculada(s)`)
    }
    console.log('')
    const semPapel = pessoas.filter((p) => p.role === 'client')
    if (semPapel.length > 0) {
      console.log('  Atencao: quem aparece como "client" nao enxerga o painel')
      console.log('  interno. Se for gente da Alta, promova a staff ou admin.')
      console.log('')
    }
  }
} catch (e) {
  falhou = true
  console.error('\nFALHOU: ' + (e && e.message ? e.message : String(e)))
} finally {
  await sql.end({ timeout: 5 })
}

process.exit(falhou ? 1 : 0)
