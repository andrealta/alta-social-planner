/**
 * Sonda a API da Anthropic direto, sem passar pelo Next.
 *
 * Existe para responder uma pergunta só: a resposta está demorando
 * porque o modelo está PENSANDO, ou porque nada saiu daqui?
 *
 * Não imprime a chave, nem parte dela.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[linha.slice(0, i).trim()] = v
  }
  return out
}

const env = { ...lerEnvLocal(), ...process.env }
const chave = env.ANTHROPIC_API_KEY

console.log('============================================')
console.log(' Sonda da API da Anthropic')
console.log(' ' + new Date().toLocaleString('pt-BR'))
console.log('============================================\n')

if (!chave) {
  console.log('ANTHROPIC_API_KEY nao esta no .env.local. Nada a testar.')
  process.exit(1)
}
console.log(`Chave presente: sim (${chave.length} caracteres, comeca com ${chave.slice(0, 7)})`)
console.log('Node:', process.version)
console.log('')

async function sondar(rotulo, corpoExtra, prompt, maxTokens) {
  console.log('--------------------------------------------')
  console.log(' ' + rotulo)
  console.log('--------------------------------------------')

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
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
        ...corpoExtra,
      }),
    })
  } catch (e) {
    console.log(`REDE FALHOU em ${marcar()}: ${e.message}`)
    if (e.cause) console.log('  causa: ' + (e.cause.code ?? e.cause.message ?? String(e.cause)))
    console.log('')
    return
  }

  console.log(`Cabecalho recebido em ${marcar()}  -  HTTP ${resposta.status}`)

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '')
    console.log('CORPO DO ERRO: ' + corpo.slice(0, 500))
    console.log('')
    return
  }

  const leitor = resposta.body.getReader()
  const dec = new TextDecoder()
  let sobra = ''
  const contagem = {}
  let texto = 0
  let pensamento = 0
  let primeiroTexto = null
  let primeiroPensamento = null
  let primeiroEvento = null
  let paradaPor = null
  const amostra = []

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

      if (primeiroEvento === null) primeiroEvento = marcar()

      const tipo = ev.delta?.type ? `${ev.type}/${ev.delta.type}` : ev.type
      contagem[tipo] = (contagem[tipo] ?? 0) + 1
      if (amostra.length < 8) amostra.push(`${marcar()}  ${tipo}`)

      if (ev.delta?.type === 'text_delta') {
        texto += ev.delta.text.length
        if (primeiroTexto === null) primeiroTexto = marcar()
      }
      if (ev.delta?.type === 'thinking_delta') {
        pensamento += (ev.delta.thinking ?? '').length
        if (primeiroPensamento === null) primeiroPensamento = marcar()
      }
      if (ev.type === 'content_block_start') {
        contagem['  bloco: ' + (ev.content_block?.type ?? '?')] =
          (contagem['  bloco: ' + (ev.content_block?.type ?? '?')] ?? 0) + 1
      }
      if (ev.type === 'message_delta' && ev.delta?.stop_reason) paradaPor = ev.delta.stop_reason
      if (ev.type === 'error') console.log('EVENTO DE ERRO: ' + JSON.stringify(ev.error))
    }
  }

  console.log('')
  console.log('Primeiros eventos:')
  for (const a of amostra) console.log('  ' + a)
  console.log('')
  console.log('Eventos por tipo:')
  for (const [k, v] of Object.entries(contagem)) console.log(`  ${k}: ${v}`)
  console.log('')
  console.log(`  1o evento em ................ ${primeiroEvento ?? 'nenhum'}`)
  console.log(`  1o PENSAMENTO em ............ ${primeiroPensamento ?? 'nao houve'}`)
  console.log(`  1o TEXTO em ................. ${primeiroTexto ?? 'NAO VEIO TEXTO'}`)
  console.log(`  caracteres de pensamento .... ${pensamento}`)
  console.log(`  caracteres de texto ......... ${texto}`)
  console.log(`  parou por ................... ${paradaPor ?? '?'}`)
  console.log(`  total ....................... ${marcar()}`)
  console.log('')
}

await sondar(
  '1. Pedido minusculo, sem parametro de pensamento',
  {},
  'Responda apenas com o JSON {"ok":true} e nada mais.',
  200,
)

await sondar(
  '2. Pedido de verdade, sem parametro de pensamento',
  {},
  'Escreva 3 ideias de post de Instagram para uma marca de geleias premium. ' +
    'Responda SOMENTE com JSON no formato {"pautas":[{"titulo":"","conceito":""}]}.',
  4000,
)

await sondar(
  '3. Mesmo pedido, com pensamento desligado explicitamente',
  { thinking: { type: 'disabled' } },
  'Escreva 3 ideias de post de Instagram para uma marca de geleias premium. ' +
    'Responda SOMENTE com JSON no formato {"pautas":[{"titulo":"","conceito":""}]}.',
  4000,
)

console.log('============================================')
console.log(' fim da sonda')
console.log('============================================')
