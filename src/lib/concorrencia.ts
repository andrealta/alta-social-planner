/**
 * O que os concorrentes estão publicando — e como isso entra no prompt
 * sem estragar o planejamento.
 *
 * O jeito óbvio de usar este material é o errado. Despejar as legendas
 * dos concorrentes como exemplo faz a IA escrever a média do setor,
 * que é exatamente o lugar de onde uma agência tira o cliente. Pior:
 * o crítico que já existe reprovaria essas pautas com razão, porque
 * "funcionaria igual para qualquer concorrente" é a definição dele de
 * pauta fraca.
 *
 * Então o bloco entra invertido, como restrição e não como inspiração:
 *
 *   1. o que já está ocupado — não repita;
 *   2. o vazio — o assunto que ninguém no setor tocou;
 *   3. o que rendeu acima da média DELES, como leitura de formato.
 *
 * A ordem importa: o item 2 é o único que justifica o custo da
 * varredura. Os outros dois evitam prejuízo; esse gera valor.
 *
 * E há uma exigência de transparência no fim do bloco: a IA tem de
 * escrever, na leitura do mês, o que o setor está repetindo e qual
 * brecha ela escolheu. Sem isso, ninguém consegue auditar se a
 * varredura ajudou ou se só encareceu a geração.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type PostRival = {
  handle: string
  autor: string
  texto: string
  quando: string | null
  curtidas: number
  comentarios: number
  peso: number
  tipo: string
}

export type ContaRival = {
  handle: string
  autor: string
  posts: PostRival[]
  /** Metade dos pesos fica abaixo disto. Serve para dizer o que estourou. */
  mediana: number
}

export type Concorrencia = {
  quando: string | null
  contas: ContaRival[]
  /** @ citados na base que a Meta recusou, com o motivo. */
  recusados: { handle: string; motivo: string }[]
}

/** Quantos posts de cada conta entram no prompt, e com que tamanho. */
const POR_CONTA = 5
const POR_CONTA_CURTO = 3
const MAX_CARACTERES = 320

function limitar(texto: string, max = MAX_CARACTERES): string {
  const t = (texto ?? '').trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  const corte = t.slice(0, max)
  const ponto = corte.lastIndexOf('. ')
  return (ponto > max * 0.6 ? corte.slice(0, ponto + 1) : corte) + '…'
}

export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const v = [...valores].sort((a, b) => a - b)
  return v[Math.floor(v.length / 2)]
}

/**
 * Agrupa as linhas cruas de `research_sources` por conta.
 *
 * Fica separado da consulta de propósito: é a parte que erra, e é a
 * única que dá para testar sem banco.
 */
export function agrupar(
  linhas: {
    handle?: string | null
    publisher?: string | null
    excerpt?: string | null
    title?: string | null
    published_at?: string | null
    metrics?: { curtidas?: number; comentarios?: number; peso?: number; tipo?: string } | null
  }[],
): ContaRival[] {
  const porConta = new Map<string, ContaRival>()
  for (const l of linhas) {
    const handle = (l.handle ?? '').trim()
    if (!handle) continue
    const texto = (l.excerpt ?? l.title ?? '').trim()
    if (!texto) continue
    const m = l.metrics ?? {}
    const post: PostRival = {
      handle,
      autor: (l.publisher ?? handle).trim(),
      texto,
      quando: l.published_at ?? null,
      curtidas: Number(m.curtidas ?? 0),
      comentarios: Number(m.comentarios ?? 0),
      peso: Number(m.peso ?? 0),
      tipo: String(m.tipo ?? ''),
    }
    const conta = porConta.get(handle) ?? { handle, autor: post.autor, posts: [], mediana: 0 }
    conta.posts.push(post)
    porConta.set(handle, conta)
  }
  for (const c of porConta.values()) {
    c.mediana = mediana(c.posts.map((p) => p.peso))
    c.posts.sort((a, b) => b.peso - a.peso)
  }
  // Conta com mais publicações primeiro: é a que dá mais sinal.
  return [...porConta.values()].sort((a, b) => b.posts.length - a.posts.length)
}

/**
 * Busca a varredura mais recente da marca. Devolve `null` quando não
 * há nenhuma — e aí o prompt segue sem o bloco, como sempre foi.
 */
export async function coletarConcorrencia(
  supabase: SupabaseClient,
  brandId: string,
): Promise<Concorrencia | null> {
  try {
    const { data: corridas } = await supabase
      .from('research_runs')
      .select('id, started_at, discarded')
      .eq('brand_id', brandId)
      .eq('kind', 'competitors')
      .eq('status', 'done')
      .order('started_at', { ascending: false })
      .limit(1)

    const corrida = (corridas ?? [])[0]
    if (!corrida) return null

    const { data: fontes } = await supabase
      .from('research_sources')
      .select('handle, publisher, title, excerpt, published_at, metrics')
      .eq('research_run_id', corrida.id as string)
      .limit(200)

    const contas = agrupar(fontes ?? [])
    if (contas.length === 0) return null

    const recusados = Array.isArray(corrida.discarded)
      ? (corrida.discarded as { handle?: string; motivo?: string }[]).map((r) => ({
          handle: String(r.handle ?? ''),
          motivo: String(r.motivo ?? ''),
        }))
      : []

    return { quando: (corrida.started_at as string) ?? null, contas, recusados }
  } catch {
    // A varredura é um extra. Se a consulta falhar, o mês continua
    // sendo gerado sem ela — nunca ao contrário.
    return null
  }
}

/** Quantos dias tem a varredura. Varredura velha vale menos e o prompt diz isso. */
export function idadeEmDias(quando: string | null, agora = new Date()): number | null {
  if (!quando) return null
  const d = new Date(quando)
  if (Number.isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86400000))
}

export function blocoDeConcorrencia(
  c: Concorrencia | null,
  curto = false,
  agora = new Date(),
): string {
  if (!c || c.contas.length === 0) return ''
  const porConta = curto ? POR_CONTA_CURTO : POR_CONTA
  const total = c.contas.reduce((s, x) => s + x.posts.length, 0)
  const dias = idadeEmDias(c.quando, agora)

  const cabecalho =
    '## O QUE OS CONCORRENTES DESTA MARCA ANDAM PUBLICANDO\n' +
    `Coletado do Instagram${
      c.quando ? ' em ' + new Date(c.quando).toLocaleDateString('pt-BR') : ''
    }: ${total} publicação(ões) de ${c.contas.length} perfil(is)` +
    (dias !== null && dias > 45 ? ` — atenção: a varredura tem ${dias} dias.` : '.') +
    '\n\n' +
    'ISTO NÃO É EXEMPLO PARA IMITAR. É o contrário: serve para você não ' +
    'escrever o que o setor inteiro já está escrevendo. Use em três passos, nesta ordem:\n\n' +
    '1. NÃO REPITA. Assunto que aparece em mais de um perfil abaixo já está ocupado. ' +
    'Se uma pauta sua poderia ter saído de qualquer um destes perfis, descarte-a e ' +
    'escreva outra, por melhor que a primeira esteja.\n' +
    '2. PROCURE O VAZIO. O que nenhum deles está dizendo, e esta marca tem como provar ' +
    'que sabe, é onde o mês ganha. A oportunidade está no que falta, não no que sobra.\n' +
    '3. LEIA O FORMATO. O que rendeu acima da média DELES diz o que o público do ' +
    'segmento para para ver — isso é leitura de formato, não de assunto.'

  const corpo = c.contas
    .map((conta) => {
      const linhas = conta.posts.slice(0, porConta).map((p) => {
        const estourou = conta.mediana > 0 && p.peso >= conta.mediana * 2
        return (
          `  · ${p.quando ?? 's/ data'} · ${p.tipo.toLowerCase() || 'post'} · ` +
          `${p.curtidas} curtidas, ${p.comentarios} comentários` +
          (estourou ? ' · ACIMA DA MÉDIA DELE' : '') +
          `\n    ${limitar(p.texto)}`
        )
      })
      return (
        `@${conta.handle} — ${conta.autor} (${conta.posts.length} publicações lidas, ` +
        `engajamento mediano ${conta.mediana})\n` +
        linhas.join('\n')
      )
    })
    .join('\n\n')

  const fecho =
    'AO ESCREVER A LEITURA DO MÊS, inclua duas frases explícitas: uma dizendo o que o ' +
    'setor está repetindo agora, e outra dizendo qual brecha você escolheu explorar e ' +
    'por que esta marca pode ocupá-la. Sem isso ninguém consegue julgar se esta ' +
    'pesquisa ajudou.'

  return [cabecalho, corpo, fecho].join('\n\n')
}
