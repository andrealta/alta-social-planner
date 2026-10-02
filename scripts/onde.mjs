/**
 * Em que banco este computador está mexendo?
 *
 * Existe para ser a primeira coisa que alguém roda quando chega, e a
 * coisa que se roda sempre que bate a dúvida. Não escreve nada, não
 * conecta em lugar nenhum: só lê o `.env.local` e conta o que achou.
 */

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { lerEnvLocal, lerAmbiente, aviso } from './ambiente.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const caminho = join(raiz, '.env.local')

console.log('')
console.log('  --------------------------------------------------------')
console.log('   Onde este computador esta mexendo')
console.log('  --------------------------------------------------------')

if (!existsSync(caminho)) {
  console.log('')
  console.log('  Nao existe .env.local nesta pasta.')
  console.log('')
  console.log('  Nada aqui funciona sem ele. Copie o .env.example com o nome')
  console.log('  .env.local e preencha. O COMECE-AQUI.md explica cada linha.')
  console.log('')
  process.exit(1)
}

const env = lerEnvLocal(caminho)
const a = lerAmbiente(env)

for (const l of aviso(env, null)) console.log(l)

console.log('')
console.log('  O que o .env.local tem preenchido:')
const CHAVES = [
  ['DATABASE_URL', 'conexao direta, usada pelos scripts'],
  ['NEXT_PUBLIC_SUPABASE_URL', 'endereco do banco, usado pelo site'],
  ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'chave publica do site'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'chave de servico (passa por cima das travas)'],
  ['ANTHROPIC_API_KEY', 'chave da IA (gasta dinheiro)'],
  ['OPERAND_TOKEN', 'token do Operand'],
  ['IG_TOKEN', 'token do Instagram'],
  ['META_TOKEN', 'token do Facebook'],
]
for (const [chave, ajuda] of CHAVES) {
  const v = String(env[chave] ?? '')
  // Tamanho e nao conteudo, sempre. Esta tela pode acabar num print
  // mandado no grupo da agencia.
  const estado = v ? `sim (${v.length} caracteres)` : 'nao'
  console.log(`    ${chave.padEnd(38)} ${estado.padEnd(22)} ${ajuda}`)
}

console.log('')
if (a.ehProducao) {
  console.log('  Antes de rodar qualquer coisa que escreve, confira se e isto')
  console.log('  mesmo que voce quer. O 06-carregar.cmd, em producao,')
  console.log('  SUBSTITUI a base de conhecimento das marcas.')
} else {
  console.log('  Banco de desenvolvimento: pode errar a vontade aqui.')
}
console.log('')
