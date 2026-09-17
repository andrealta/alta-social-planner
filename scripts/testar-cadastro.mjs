/**
 * Por que este arquivo existe.
 *
 * O cadastro de pessoa com senha temporaria falhou na tela, e a tela
 * mostra uma frase amigavel por cima do erro de verdade. Este script
 * refaz exatamente a mesma chamada, fora do site, e imprime o erro
 * bruto: numero da resposta e texto que o Supabase devolveu.
 *
 * Ele tambem responde a pergunta seguinte, que a tela nao responde:
 * o usuario nasceu mas o perfil nao? o perfil nasceu com qual papel?
 *
 * No fim apaga o usuario de teste. Nada fica para tras.
 *
 * Nenhuma chave e impressa. So o formato e o tamanho dela.
 *
 * Uso:  node scripts/testar-cadastro.mjs
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

/** Diz o que a chave parece ser, sem nunca mostrar o valor. */
function formatoDaChave(v) {
  if (!v) return 'ausente'
  if (v.startsWith('sb_secret_')) return 'chave secreta nova (sb_secret_...)  -> serve'
  if (v.startsWith('sb_publishable_')) return 'chave PUBLICA (sb_publishable_...)  -> NAO serve'
  if (v.startsWith('eyJ')) {
    try {
      const corpo = JSON.parse(Buffer.from(v.split('.')[1], 'base64').toString('utf8'))
      return `JWT antigo, papel "${corpo.role}"  -> ${corpo.role === 'service_role' ? 'serve' : 'NAO serve'}`
    } catch {
      return 'JWT ilegivel  -> suspeito'
    }
  }
  return 'formato desconhecido  -> suspeito'
}

const env = { ...lerEnvLocal(), ...process.env }
const url = env.NEXT_PUBLIC_SUPABASE_URL
const chave = env.SUPABASE_SERVICE_ROLE_KEY
const banco = env.DATABASE_URL

const linha = '--------------------------------------------------------'
console.log('')
console.log(linha)
console.log(' 1. O que esta configurado')
console.log(linha)
console.log('')
console.log('  NEXT_PUBLIC_SUPABASE_URL      ' + (url ? url : 'AUSENTE'))
console.log('  SUPABASE_SERVICE_ROLE_KEY     ' + formatoDaChave(chave))
console.log('  tamanho da chave              ' + (chave ? chave.length + ' caracteres' : '-'))
console.log('  DATABASE_URL                  ' + (banco ? 'presente' : 'ausente (a parte 3 sera pulada)'))
console.log('')

if (!url || !chave) {
  console.log('PARA AQUI: sem URL ou sem chave de servico nao da para criar pessoa.')
  console.log('Preencha no .env.local e rode de novo.')
  process.exit(1)
}

const marca = Date.now()
const emailTeste = `teste-cadastro-${marca}@example.com`
const senhaTeste = `alta-teste-${marca}`

console.log(linha)
console.log(' 2. Criando uma pessoa de teste, igual a tela faz')
console.log(linha)
console.log('')
console.log('  e-mail de teste   ' + emailTeste)
console.log('')

let idCriado = null
let falhou = false

try {
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: emailTeste,
      password: senhaTeste,
      email_confirm: true,
      user_metadata: { name: 'Pessoa de Teste', role: 'staff' },
    }),
  })

  const texto = await r.text()
  console.log('  resposta HTTP     ' + r.status + ' ' + r.statusText)
  console.log('')
  console.log('  texto devolvido pelo Supabase:')
  console.log('  ' + texto.slice(0, 1200))
  console.log('')

  if (r.ok) {
    try {
      idCriado = JSON.parse(texto).id
    } catch {}
    console.log('  RESULTADO: a criacao FUNCIONOU fora do site.')
    console.log('')
    console.log('  Ou seja: o banco e a chave estao certos, e o problema esta')
    console.log('  no site — quase sempre a variavel SUPABASE_SERVICE_ROLE_KEY')
    console.log('  faltando ou errada na Vercel, ou o servidor local rodando')
    console.log('  desde antes de voce preencher o .env.local.')
  } else {
    falhou = true
    console.log('  RESULTADO: a criacao FALHOU tambem fora do site.')
    console.log('')
    if (/Database error/i.test(texto)) {
      console.log('  "Database error creating new user" quer dizer que o usuario')
      console.log('  ate nasceu, mas o gatilho que cria o perfil foi barrado, e')
      console.log('  ai o banco desfaz tudo. E problema de politica no banco,')
      console.log('  nao de chave. Me mande esta tela inteira.')
    } else if (r.status === 401 || r.status === 403) {
      console.log('  401/403 quer dizer chave recusada: a que esta no .env.local')
      console.log('  nao e a de servico, ou foi trocada no painel do Supabase.')
      console.log('  Pegue de novo em Settings -> API e cole no .env.local.')
    } else if (/password/i.test(texto)) {
      console.log('  A reclamacao e da senha: a regra de senha do projeto e mais')
      console.log('  exigente do que a senha que o sistema gera.')
    } else {
      console.log('  Me mande esta tela inteira — e o texto acima que diz o motivo.')
    }
  }
} catch (e) {
  falhou = true
  console.log('  Nem consegui falar com o Supabase: ' + (e && e.message ? e.message : String(e)))
}

console.log('')
console.log(linha)
console.log(' 3. O perfil nasceu junto?')
console.log(linha)
console.log('')

if (banco && idCriado) {
  const sql = postgres(banco, {
    max: 1,
    prepare: false,
    ssl: banco.includes('localhost') ? false : 'require',
  })
  try {
    const p = await sql`select name, email, role from profiles where id = ${idCriado}`
    if (p.length === 0) {
      falhou = true
      console.log('  NAO. O usuario existe no login, mas nao tem perfil.')
      console.log('  Quem entrar com ele nao vai enxergar nada.')
    } else {
      console.log(`  Sim: ${p[0].name} / ${p[0].email} / papel "${p[0].role}"`)
      if (p[0].role !== 'staff') {
        console.log('  Atencao: o papel deveria ter vindo "staff" do metadado.')
      }
    }
  } catch (e) {
    console.log('  Nao consegui conferir: ' + (e && e.message ? e.message : String(e)))
  } finally {
    await sql.end({ timeout: 5 })
  }
} else if (!idCriado) {
  console.log('  Pulado: nao houve usuario criado.')
} else {
  console.log('  Pulado: sem DATABASE_URL no .env.local.')
}

console.log('')
console.log(linha)
console.log(' 4. Limpando')
console.log(linha)
console.log('')

if (idCriado) {
  const r = await fetch(`${url}/auth/v1/admin/users/${idCriado}`, {
    method: 'DELETE',
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
  })
  console.log(
    r.ok
      ? '  Usuario de teste apagado. Nada ficou para tras.'
      : `  NAO consegui apagar (HTTP ${r.status}). Apague na mao em Authentication -> Users: ${emailTeste}`,
  )
} else {
  console.log('  Nada a limpar.')
}

console.log('')
process.exit(falhou ? 1 : 0)
