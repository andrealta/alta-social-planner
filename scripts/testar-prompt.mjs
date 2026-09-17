/**
 * Repete FORA do Next exatamente a chamada que o sistema fez por dentro.
 *
 * O sistema grava, a cada geração, o pedido inteiro em
 * `ultimo-prompt.json`. Este arquivo pega aquele mesmo pedido — mesmo
 * modelo, mesmo system, mesmo max_tokens, mesmos 25 mil caracteres — e
 * manda direto pela rede.
 *
 * Se aqui funciona e lá não, o problema é o Next, não a API. É a única
 * comparação que separa as duas coisas sem chutar.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

function lerEnvLocal() {
  const caminho = join(raiz, '.env.local')
  if (!existsSync(caminho)) return {}
  const out = {}
  for (const l of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    if (!l.trim() || l.trim().startsWith('#')) continue
    const i = l.indexOf('=')
    if (i < 0) continue
    let v = l.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[l.slice(0, i).trim()] = v
  }
  return out
}

const env = { ...lerEnvLocal(), ...process.env }
const chave = env.ANTHROPIC_API_KEY

console.log('============================================')
console.log(' Repetindo o ultimo pedido, fora do Next')
console.log(' ' + new Date().toLocaleString('pt-BR'))
console.log('============================================\n')

if (!chave) { console.log('ANTHROPIC_API_KEY nao esta no .env.local.'); process.exit(1) }

const caminho = join(raiz, 'ultimo-prompt.json')
if (!existsSync(caminho)) {
  console.log('Nao achei ultimo-prompt.json.')
  console.log('')
  console.log('Ele so aparece depois de voce mandar gerar um mes pelo sistema')
  console.log('ao menos uma vez com a versao nova. Mande gerar e rode isto de novo.')
  process.exit(1)
}

const pedido = JSON.parse(readFileSync(caminho, 'utf8'))
console.log(`modelo ....... ${pedido.modelo}`)
console.log(`max_tokens ... ${pedido.max_tokens}`)
console.log(`system ....... ${pedido.system.length} caracteres`)
console.log(`prompt ....... ${pedido.prompt.length} caracteres`)
console.log('')

const t0 = Date.now()
const marcar = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'

let resposta
try {
  resposta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': chave,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(420000),
    body: JSON.stringify({
      model: pedido.modelo,
      max_tokens: pedido.max_tokens,
      system: pedido.system,
      stream: true,
      messages: [{ role: 'user', content: pedido.prompt }],
    }),
  })
} catch (e) {
  console.log(`REDE FALHOU em ${marcar()}: ${e.name} - ${e.message}`)
  if (e.cause) console.log('  causa: ' + (e.cause.code ?? e.cause.message ?? String(e.cause)))
  process.exit(1)
}

console.log(`Cabecalho em ${marcar()}  -  HTTP ${resposta.status}`)
if (!resposta.ok) {
  console.log('CORPO DO ERRO: ' + (await resposta.text().catch(() => '')).slice(0, 600))
  process.exit(1)
}

const leitor = resposta.body.getReader()
const dec = new TextDecoder()
let sobra = ''
let texto = 0
let pensamento = 0
let primeiroTexto = null
let parada = null
let entrada = 0
let saida = 0
let ultimoRelato = 0

for (;;) {
  const { done, value } = await leitor.read()
  if (done) break
  sobra += dec.decode(value, { stream: true })
  const linhas = sobra.split('\n')
  sobra = linhas.pop() ?? ''
  for (const l of linhas) {
    if (!l.startsWith('data:')) continue
    const cru = l.slice(5).trim()
    if (!cru || cru === '[DONE]') continue
    let ev
    try { ev = JSON.parse(cru) } catch { continue }

    if (ev.type === 'message_start') entrada = ev.message?.usage?.input_tokens ?? 0
    if (ev.delta?.type === 'text_delta') {
      texto += ev.delta.text.length
      if (primeiroTexto === null) { primeiroTexto = marcar(); console.log(`Primeiro texto em ${primeiroTexto}`) }
      if (texto - ultimoRelato >= 2000) { ultimoRelato = texto; console.log(`  ${marcar()}  ${texto} caracteres`) }
    }
    if (ev.delta?.type === 'thinking_delta') pensamento += (ev.delta.thinking ?? '').length
    if (ev.type === 'message_delta') { parada = ev.delta?.stop_reason ?? parada; saida = ev.usage?.output_tokens ?? saida }
    if (ev.type === 'error') console.log('EVENTO DE ERRO: ' + JSON.stringify(ev.error))
  }
}

const custo = (entrada * 5 + saida * 25) / 1e6

console.log('')
console.log('--------------------------------------------')
console.log(`  1o texto em ......... ${primeiroTexto ?? 'NAO VEIO TEXTO'}`)
console.log(`  pensamento .......... ${pensamento} caracteres`)
console.log(`  texto ............... ${texto} caracteres`)
console.log(`  tokens .............. ${entrada} entrada, ${saida} saida`)
console.log(`  custo ............... US$ ${custo.toFixed(4)}`)
console.log(`  parou por ........... ${parada}`)
console.log(`  total ............... ${marcar()}`)
console.log('--------------------------------------------')
console.log('')
console.log(parada === 'end_turn'
  ? 'A MESMA chamada funciona fora do Next. O problema esta no servidor web.'
  : 'A chamada nao completou nem aqui fora. O problema esta no pedido.')
