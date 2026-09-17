/**
 * Conversa com a API da Anthropic, sem SDK.
 *
 * Por que sem SDK: uma dependência a menos para versionar, e o que a
 * gente usa da API cabe em um `fetch`. Se um dia precisarmos de
 * ferramentas ou visão, vale reconsiderar.
 *
 * Roda SÓ no servidor. A chave nunca chega ao navegador — não existe
 * `NEXT_PUBLIC_` no nome dela, e é por isso.
 */

const ENDERECO = 'https://api.anthropic.com/v1/messages'
const VERSAO_API = '2023-06-01'

/** O modelo padrão e o preço dele, por milhão de tokens, em dólar. */
export const MODELO_PADRAO = 'claude-opus-5'

const PRECO: Record<string, { entrada: number; saida: number }> = {
  'claude-opus-5': { entrada: 5, saida: 25 },
  'claude-sonnet-5': { entrada: 2, saida: 10 },
  'claude-haiku-4-5-20251001': { entrada: 1, saida: 5 },
}

export type Uso = {
  entrada: number
  saida: number
  escritaCache: number
  leituraCache: number
}

export type Fase = 'esperando' | 'pensando' | 'escrevendo'

export type Resposta = {
  texto: string
  pensamento: number
  modelo: string
  uso: Uso
  custoUsd: number
  latenciaMs: number
  motivoParada: string | null
}

export class ErroClaude extends Error {
  /**
   * Uma falha no meio do caminho já consumiu tokens, e tokens são
   * dinheiro. Sem isto, uma geração que falha custa e não deixa
   * rastro nenhum — foi o que aconteceu duas vezes aqui.
   */
  uso?: Uso
  custoUsd?: number

  constructor(
    message: string,
    readonly status?: number,
    readonly tipo?: string,
  ) {
    super(message)
    this.name = 'ErroClaude'
  }
}

export function chaveConfigurada(): boolean {
  return typeof process.env.ANTHROPIC_API_KEY === 'string' && process.env.ANTHROPIC_API_KEY.length > 20
}

function custo(modelo: string, uso: Uso): number {
  const p = PRECO[modelo] ?? PRECO[MODELO_PADRAO]
  // Cache de escrita custa 2x a entrada; leitura de cache, 0,1x.
  const entrada = uso.entrada + uso.escritaCache * 2 + uso.leituraCache * 0.1
  return (entrada * p.entrada + uso.saida * p.saida) / 1_000_000
}

/**
 * Traduz o erro da API para algo que a pessoa consiga agir.
 * Mensagem de API em inglês, no meio de um painel em português, com um
 * código HTTP cru, não ajuda ninguém às onze da noite.
 */
function explicar(status: number, corpo: string): string {
  let tipo = ''
  try {
    tipo = (JSON.parse(corpo)?.error?.type as string) ?? ''
  } catch {
    /* corpo não era JSON */
  }

  if (status === 401 || tipo === 'authentication_error') {
    return 'A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY no .env.local e reinicie o servidor.'
  }
  if (status === 403) {
    return 'A chave não tem permissão para este modelo. Veja no console.anthropic.com se a conta tem crédito e acesso ao Opus.'
  }
  if (status === 429) {
    return 'A API pediu para esperar (limite de uso). Tente de novo em um minuto.'
  }
  if (tipo === 'invalid_request_error' && corpo.includes('credit balance')) {
    return 'A conta da Anthropic está sem crédito. Adicione saldo em console.anthropic.com → Billing.'
  }
  if (status >= 500) {
    return 'A API da Anthropic teve um erro do lado dela. Tente de novo em instantes.'
  }
  return `A API respondeu ${status}. ${corpo.slice(0, 300)}`
}

export type Opcoes = {
  system?: string
  modelo?: string
  maxTokens?: number
  temperatura?: number
  /**
   * Chamada a cada pedaço recebido, para a tela mostrar progresso.
   *
   * `fase` distingue o modelo PENSANDO do modelo ESCREVENDO. Sem isso,
   * uma geração que passa dois minutos raciocinando parece travada —
   * foi exatamente o que aconteceu no primeiro teste real.
   */
  aoReceber?: (fase: Fase, acumulado: number) => void
  /**
   * Chamada assim que o cabeçalho da resposta chega, antes de qualquer
   * conteúdo. Separa "a conexão não completou" de "conectou mas o
   * corpo não veio" — duas falhas idênticas na tela e opostas na causa.
   */
  aoConectar?: (status: number, ms: number) => void
  /**
   * Raciocínio do modelo. O Opus 5 usa 'adaptive': ele decide quanto
   * pensar. 'disabled' desliga. Omitir deixa o padrão da API valer.
   */
  pensamento?: { type: 'adaptive' } | { type: 'disabled' }
  /** Corta a espera. Sem isto, um pedido pendurado fica pendurado para sempre. */
  sinal?: AbortSignal
  /** Segundos até desistir, quando `sinal` não é informado. Padrão: 480. */
  limiteSegundos?: number
}

export async function chamarClaude(prompt: string, opcoes: Opcoes = {}): Promise<Resposta> {
  const chave = process.env.ANTHROPIC_API_KEY
  if (!chave) {
    throw new ErroClaude(
      'ANTHROPIC_API_KEY não está definida. Acrescente a linha no .env.local e reinicie o servidor.',
    )
  }

  const modelo = opcoes.modelo ?? MODELO_PADRAO
  const inicio = Date.now()

  const limite = (opcoes.limiteSegundos ?? 480) * 1000
  const sinal = opcoes.sinal ?? AbortSignal.timeout(limite)

  let resposta: Response
  try {
    resposta = await fetch(ENDERECO, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': chave,
        'anthropic-version': VERSAO_API,
      },
      signal: sinal,
      // Sem isto, o Next embrulha este fetch na camada de cache dele,
      // que clona a resposta para inspecionar. Clonar um corpo que
      // chega em fluxo faz a leitura empacar. Não queremos nada disso:
      // é uma chamada de escrita, única, que nunca deve ser reusada.
      cache: 'no-store',
      body: JSON.stringify({
        model: modelo,
        max_tokens: opcoes.maxTokens ?? 16000,
        temperature: opcoes.temperatura ?? 1,
        stream: true,
        ...(opcoes.system ? { system: opcoes.system } : {}),
        ...(opcoes.pensamento ? { thinking: opcoes.pensamento } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new ErroClaude(
        `A API não respondeu em ${Math.round(limite / 1000)} segundos e o pedido foi cancelado.`,
      )
    }
    const causa =
      e instanceof Error && e.cause && typeof e.cause === 'object' && 'code' in e.cause
        ? ` (${String((e.cause as { code: unknown }).code)})`
        : ''
    throw new ErroClaude(
      'Não consegui falar com a API da Anthropic' + causa + '. Confira a conexão e tente de novo.',
    )
  }

  opcoes.aoConectar?.(resposta.status, Date.now() - inicio)

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '')
    throw new ErroClaude(explicar(resposta.status, corpo), resposta.status)
  }
  if (!resposta.body) {
    throw new ErroClaude('A API respondeu sem corpo.')
  }

  const uso: Uso = { entrada: 0, saida: 0, escritaCache: 0, leituraCache: 0 }
  let texto = ''
  let pensamento = 0
  let motivoParada: string | null = null

  const leitor = resposta.body.getReader()
  const decodificador = new TextDecoder()
  let sobra = ''

  // A resposta vem como Server-Sent Events: linhas "data: {...}"
  // separadas por linha em branco. Um pedaço da rede pode cortar uma
  // linha ao meio, então guardamos a sobra para o próximo pedaço.
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break

    sobra += decodificador.decode(value, { stream: true })
    const linhas = sobra.split('\n')
    sobra = linhas.pop() ?? ''

    for (const linha of linhas) {
      if (!linha.startsWith('data:')) continue
      const cru = linha.slice(5).trim()
      if (!cru || cru === '[DONE]') continue

      let evento: Record<string, unknown>
      try {
        evento = JSON.parse(cru)
      } catch {
        continue
      }

      const tipo = evento.type as string

      if (tipo === 'message_start') {
        const u = (evento.message as Record<string, unknown> | undefined)?.usage as
          | Record<string, number>
          | undefined
        if (u) {
          uso.entrada = u.input_tokens ?? 0
          uso.escritaCache = u.cache_creation_input_tokens ?? 0
          uso.leituraCache = u.cache_read_input_tokens ?? 0
        }
      } else if (tipo === 'content_block_delta') {
        const d = evento.delta as Record<string, unknown> | undefined

        if (d?.type === 'text_delta' && typeof d.text === 'string') {
          texto += d.text
          opcoes.aoReceber?.('escrevendo', texto.length)
        } else if (d?.type === 'thinking_delta' && typeof d.thinking === 'string') {
          // O raciocínio não entra na resposta — mas precisa contar,
          // senão a tela fica em zero enquanto o modelo trabalha.
          pensamento += d.thinking.length
          opcoes.aoReceber?.('pensando', pensamento)
        }
        // signature_delta e input_json_delta não interessam aqui.
      } else if (tipo === 'message_delta') {
        const u = evento.usage as Record<string, number> | undefined
        if (u?.output_tokens) uso.saida = u.output_tokens
        const d = evento.delta as Record<string, unknown> | undefined
        if (typeof d?.stop_reason === 'string') motivoParada = d.stop_reason
      } else if (tipo === 'error') {
        const e = evento.error as Record<string, string> | undefined
        throw new ErroClaude(e?.message ?? 'A API interrompeu a resposta.', undefined, e?.type)
      }
    }
  }

  if (motivoParada === 'max_tokens') {
    const e = new ErroClaude(
      texto.trim() === ''
        ? `O modelo gastou todo o limite de ${opcoes.maxTokens ?? 16000} tokens raciocinando e parou antes de escrever a resposta. ` +
          'O limite precisa ser maior, ou a tarefa menor.'
        : 'A resposta bateu no limite de tamanho no meio do texto. O planejamento saiu incompleto — aumente o limite ou reduza o número de peças.',
    )
    e.uso = uso
    e.custoUsd = custo(modelo, uso)
    throw e
  }

  if (texto.trim() === '') {
    throw new ErroClaude(
      pensamento > 0
        ? 'O modelo pensou mas não escreveu resposta nenhuma. Tente de novo.'
        : 'A API respondeu sem conteúdo. Tente de novo.',
    )
  }

  return {
    texto,
    pensamento,
    modelo,
    uso,
    custoUsd: custo(modelo, uso),
    latenciaMs: Date.now() - inicio,
    motivoParada,
  }
}

/**
 * Extrai o JSON de uma resposta que deveria ser só JSON.
 *
 * O modelo às vezes embrulha em ```json, ou escreve uma frase antes.
 * Em vez de confiar, procuramos o primeiro objeto de chave a chave —
 * contando as chaves, para não tropeçar em chave dentro de string.
 */
export function extrairJson<T = unknown>(texto: string): T {
  const limpo = texto.trim()

  const tentar = (s: string): T | null => {
    try {
      return JSON.parse(s) as T
    } catch {
      return null
    }
  }

  const direto = tentar(limpo)
  if (direto !== null) return direto

  const semCerca = limpo.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const semCercaOk = tentar(semCerca)
  if (semCercaOk !== null) return semCercaOk

  const inicio = semCerca.indexOf('{')
  if (inicio < 0) throw new ErroClaude('A resposta não trouxe JSON nenhum.')

  let profundidade = 0
  let dentroDeTexto = false
  let escapado = false

  for (let i = inicio; i < semCerca.length; i++) {
    const c = semCerca[i]

    if (escapado) {
      escapado = false
      continue
    }
    if (c === '\\') {
      escapado = true
      continue
    }
    if (c === '"') {
      dentroDeTexto = !dentroDeTexto
      continue
    }
    if (dentroDeTexto) continue

    if (c === '{') profundidade++
    else if (c === '}') {
      profundidade--
      if (profundidade === 0) {
        const recorte = tentar(semCerca.slice(inicio, i + 1))
        if (recorte !== null) return recorte
        break
      }
    }
  }

  throw new ErroClaude('A resposta veio com JSON quebrado. Tente gerar de novo.')
}
