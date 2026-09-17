/**
 * Confere o que vai para o GitHub ANTES de ir.
 *
 * Existe por causa de um acidente que acontece toda semana com gente
 * experiente: subir o arquivo de senhas junto com o código. No GitHub,
 * mesmo num repositório privado, mesmo apagando depois, a chave
 * precisa ser considerada vazada — ela fica no histórico, e o
 * histórico é o ponto do Git.
 *
 * Este arquivo lê a lista do que o Git está prestes a enviar e trava
 * se encontrar segredo ali. Só lê; não envia nada.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

function git(...args) {
  return execFileSync('git', args, { cwd: raiz, encoding: 'utf8' })
}

console.log('============================================')
console.log(' Conferencia do que vai para o GitHub')
console.log('============================================\n')

let arquivos
try {
  arquivos = git('diff', '--cached', '--name-only').split('\n').map((x) => x.trim()).filter(Boolean)
} catch (e) {
  console.error('Nao consegui ler a lista do Git: ' + e.message)
  process.exit(1)
}

if (arquivos.length === 0) {
  console.log('Nada preparado para enviar. Nada a conferir.')
  process.exit(0)
}

console.log(`${arquivos.length} arquivo(s) preparados.\n`)

// ---------- 1. Segredo por NOME de arquivo ----------
const proibidos = arquivos.filter((f) => {
  const nome = f.split('/').pop() ?? f
  if (nome === '.env.example') return false
  return (
    nome.startsWith('.env') ||
    /\.env\b/i.test(nome) ||
    nome.endsWith('.pem') ||
    nome.endsWith('.key') ||
    nome === 'id_rsa'
  )
})

// ---------- 2. Segredo por CONTEUDO ----------
// Um arquivo pode ter nome inocente e a chave dentro.
// Procuramos o VALOR, nunca a palavra. A primeira versao disto
// caçava a expressão "service_role" e travava em todo arquivo que
// só FALAVA dela — inclusive este, e o comentario que explica o
// perigo da chave. Um alarme que dispara sempre é um alarme que a
// pessoa aprende a ignorar, e aí ele não protege mais nada.
const padroes = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'chave da Anthropic'],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'chave secreta do Supabase'],
  [/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/, 'chave JWT do Supabase'],
  [/postgres(ql)?:\/\/[^\s:]+:[^\s@]{6,}@/, 'senha dentro de uma URL de banco'],
  [/AKIA[0-9A-Z]{16}/, 'chave da Amazon'],
]

// Este arquivo carrega os padroes acima; conferir a si mesmo so
// geraria alarme falso.
const EU = 'scripts/git-seguro.mjs'

const comSegredo = []
for (const f of arquivos) {
  if (f === EU) continue
  const caminho = join(raiz, f)
  if (!existsSync(caminho)) continue
  let texto
  try {
    texto = readFileSync(caminho, 'utf8')
  } catch {
    continue
  }
  if (texto.length > 2_000_000) continue
  for (const [re, oque] of padroes) {
    if (re.test(texto)) {
      comSegredo.push([f, oque])
      break
    }
  }
}

if (proibidos.length === 0 && comSegredo.length === 0) {
  console.log('  [ok]  Nenhum segredo na lista.\n')
  console.log('Arquivos (primeiros 30):')
  for (const f of arquivos.slice(0, 30)) console.log('   ' + f)
  if (arquivos.length > 30) console.log(`   ... e mais ${arquivos.length - 30}`)
  console.log('\n--------------------------------------------')
  console.log(' Pode enviar.')
  console.log('--------------------------------------------')
  process.exit(0)
}

console.log('  [PARE]  Tem segredo na lista. NAO envie.\n')
for (const f of proibidos) console.log(`   arquivo proibido: ${f}`)
for (const [f, oque] of comSegredo) console.log(`   ${f}  contem ${oque}`)

console.log('')
console.log('--------------------------------------------')
console.log(' Para tirar da lista, rode na pasta do projeto:')
console.log('')
for (const f of [...new Set([...proibidos, ...comSegredo.map((x) => x[0])])]) {
  console.log(`   git restore --staged "${f}"`)
}
console.log('')
console.log(' Depois confira se o .gitignore cobre esse arquivo, e')
console.log(' rode este teste de novo.')
console.log('--------------------------------------------')
process.exit(1)
