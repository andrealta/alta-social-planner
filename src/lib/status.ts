/**
 * O "Status geral" que o cliente vê na tela inicial: o que a parceria
 * já produziu e como ele tem respondido.
 *
 * Tudo aqui é conta sobre dados que o banco já guarda — nenhuma
 * chamada de IA, nenhum custo, e o número é sempre o do momento.
 *
 * Um aviso sobre as palavras: o sistema não tem "reprovar". O cliente
 * aprova ou pede alteração. O que a tela chama de "devolvidas para
 * ajuste" são as vezes em que ele pediu alteração — é o equivalente
 * honesto de "reprovada", sem dar a entender que a pauta foi jogada fora.
 */

export type PlanoStatus = { id: string; liberado: boolean }
export type PautaStatus = { id: string; plan_id: string; status: string }
export type DecisaoStatus = {
  idea_id: string
  decision: string
  actor_kind: string
  seconds_to_decide: number | null
  comment_id: string | null
}
export type ComentarioStatus = { id: string; body: string }

export type Tema = { tema: string; vezes: number }

export type StatusGeral = {
  meses: number
  conteudos: number
  aprovadas: number
  aprovadasDePrimeira: number
  devolvidas: number
  segundosMedios: number | null
  temas: Tema[]
}

/**
 * Os temas dos pedidos de alteração, por palavra-chave.
 *
 * É um classificador simples de propósito: transparente (dá para ler
 * por que um pedido caiu em "Imagem"), grátis e instantâneo. Um pedido
 * pode cair em mais de um tema — "troque a foto e encurte a legenda"
 * é imagem E texto. O que não se encaixa em nada vira "Outros".
 */
const TEMAS: { tema: string; padrao: RegExp }[] = [
  { tema: 'Texto e legenda', padrao: /\b(legenda|texto|frase|escrit|palavra|copy|titulo|redac|ortograf|portugues|curt|long|resum)/ },
  { tema: 'Imagem e visual', padrao: /\b(imagem|foto|visual|arte|cor(es)?\b|design|layout|fonte|logo|ilustra|paleta)/ },
  { tema: 'Tom de voz', padrao: /\b(tom\b|linguagem|formal|informal|descontra|serio|seria|voz\b|jeito de falar|girias?)/ },
  { tema: 'Vídeo e formato', padrao: /\b(video|reels?|carross|stories|story|formato|animac)/ },
  { tema: 'Data e agenda', padrao: /\b(data|dia\b|agenda|antecip|adiar|adia|calendario|prazo|semana)/ },
  { tema: 'Chamada para ação', padrao: /\b(cta|chamada|link|call to action|botao|direcion)/ },
  { tema: 'Hashtags', padrao: /(hashtag|#\w)/ },
  { tema: 'Informação e produto', padrao: /\b(produto|preco|valor|informac|dado|endereco|horario|errad|incorret|nome)/ },
]

export function normalizar(texto: string): string {
  return (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function temasDoPedido(texto: string): string[] {
  const t = normalizar(texto)
  const achados = TEMAS.filter((x) => x.padrao.test(t)).map((x) => x.tema)
  return achados.length > 0 ? achados : ['Outros']
}

export function calcularStatus(dados: {
  planos: PlanoStatus[]
  pautas: PautaStatus[]
  decisoes: DecisaoStatus[]
  comentarios: ComentarioStatus[]
  maxTemas?: number
}): StatusGeral {
  // Só conta o que o cliente recebeu: mês ainda em revisão interna
  // não é trabalho entregue.
  const liberados = new Set(dados.planos.filter((p) => p.liberado).map((p) => p.id))
  const pautas = dados.pautas.filter((p) => liberados.has(p.plan_id))
  const ids = new Set(pautas.map((p) => p.id))
  const doCliente = dados.decisoes.filter((d) => d.actor_kind === 'client' && ids.has(d.idea_id))

  const comPedido = new Set(
    doCliente.filter((d) => d.decision === 'changes_requested').map((d) => d.idea_id),
  )
  const aprovadas = pautas.filter((p) => p.status === 'client_approved')

  const tempos = doCliente
    .map((d) => d.seconds_to_decide)
    .filter((s): s is number => typeof s === 'number' && s >= 0)

  // Os temas saem do texto que o cliente escreveu ao pedir alteração.
  const texto = new Map(dados.comentarios.map((c) => [c.id, c.body]))
  const contagem = new Map<string, number>()
  for (const d of doCliente) {
    if (d.decision !== 'changes_requested' || !d.comment_id) continue
    const corpo = texto.get(d.comment_id)
    if (!corpo) continue
    for (const t of temasDoPedido(corpo)) contagem.set(t, (contagem.get(t) ?? 0) + 1)
  }
  const temas = [...contagem.entries()]
    .map(([tema, vezes]) => ({ tema, vezes }))
    // "Outros" nunca lidera a lista: não diz nada a ninguém.
    .sort((a, b) => (a.tema === 'Outros' ? 1 : 0) - (b.tema === 'Outros' ? 1 : 0) || b.vezes - a.vezes)
    .slice(0, dados.maxTemas ?? 3)

  return {
    meses: liberados.size,
    conteudos: pautas.length,
    aprovadas: aprovadas.length,
    aprovadasDePrimeira: aprovadas.filter((p) => !comPedido.has(p.id)).length,
    devolvidas: doCliente.filter((d) => d.decision === 'changes_requested').length,
    segundosMedios: tempos.length ? tempos.reduce((s, v) => s + v, 0) / tempos.length : null,
    temas,
  }
}
