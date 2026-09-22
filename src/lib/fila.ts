/**
 * A fila de trabalho da equipe: o que depende da Alta agora.
 *
 * O Status geral conta; a fila diz o que fazer. São três tipos de
 * item, na ordem em que pesam:
 *
 *   1. ajuste: o cliente pediu alteração numa pauta. Ele está
 *      esperando, então vem primeiro, do pedido mais antigo para o
 *      mais novo, com o texto que ele escreveu.
 *   2. conteudo: um mês com tudo aprovado, mas com pautas sem legenda
 *      escrita. Desde a 0025 o cliente recebe a peça pronta, então
 *      isso é o que falta para o mês sair.
 *   3. enviar: um mês com todas as pautas aprovadas e escritas, ainda
 *      não enviado. Falta um clique, e às vezes a estratégia.
 *   4. revisar: um mês com pautas geradas ou em correção interna.
 *
 * Meses em ordem do mais próximo para o mais distante, como no resto
 * do sistema. Conta pura, sem banco: a página busca, isto organiza.
 */

export type MarcaFila = { id: string; name: string; slug: string; color: string | null }
export type PlanoFila = {
  id: string
  brand_id: string
  month: number
  year: number
  client_released_at: string | null
  estrategia_cliente: string | null
}
export type PautaFila = {
  id: string
  plan_id: string
  title: string
  status: string
  /** Já tem legenda escrita? O cliente recebe a peça pronta (0025). */
  temConteudo: boolean
}
export type DecisaoFila = {
  idea_id: string
  decision: string
  actor_kind: string
  comment_id: string | null
  created_at: string
}
export type ComentarioFila = { id: string; body: string }

type Base = { marca: MarcaFila; mes: number; ano: number }

export type ItemFila =
  | (Base & { tipo: 'ajuste'; pautaId: string; titulo: string; pedido: string | null; desde: string | null })
  | (Base & { tipo: 'conteudo'; total: number })
  | (Base & { tipo: 'enviar'; total: number; semEstrategia: boolean })
  | (Base & { tipo: 'revisar'; total: number; emCorrecao: number })

const EM_REVISAO = new Set(['ai_generated', 'internal_review', 'internal_changes'])

const chaveMes = (ano: number, mes: number) => ano * 12 + mes

export function montarFila(d: {
  marcas: MarcaFila[]
  planos: PlanoFila[]
  pautas: PautaFila[]
  decisoes: DecisaoFila[]
  comentarios: ComentarioFila[]
}): ItemFila[] {
  const marcaPorId = new Map(d.marcas.map((m) => [m.id, m]))
  const planoPorId = new Map(d.planos.map((p) => [p.id, p]))
  const texto = new Map(d.comentarios.map((c) => [c.id, c.body]))

  // O pedido que vale é o último que o cliente fez naquela pauta.
  const ultimoPedido = new Map<string, DecisaoFila>()
  for (const x of d.decisoes) {
    if (x.actor_kind !== 'client' || x.decision !== 'changes_requested') continue
    const atual = ultimoPedido.get(x.idea_id)
    if (!atual || x.created_at > atual.created_at) ultimoPedido.set(x.idea_id, x)
  }

  const ajustes: ItemFila[] = []
  const porPlano = new Map<string, PautaFila[]>()
  for (const p of d.pautas) {
    const plano = planoPorId.get(p.plan_id)
    const marca = plano && marcaPorId.get(plano.brand_id)
    if (!plano || !marca) continue
    const lista = porPlano.get(p.plan_id) ?? []
    lista.push(p)
    porPlano.set(p.plan_id, lista)

    if (p.status === 'client_changes_requested') {
      const pedido = ultimoPedido.get(p.id)
      ajustes.push({
        tipo: 'ajuste',
        marca,
        mes: plano.month,
        ano: plano.year,
        pautaId: p.id,
        titulo: p.title,
        pedido: pedido?.comment_id ? (texto.get(pedido.comment_id)?.trim() || null) : null,
        desde: pedido?.created_at ?? null,
      })
    }
  }

  const enviar: ItemFila[] = []
  const conteudo: ItemFila[] = []
  const revisar: ItemFila[] = []
  for (const [planoId, pautas] of porPlano) {
    const plano = planoPorId.get(planoId) as PlanoFila
    const marca = marcaPorId.get(plano.brand_id) as MarcaFila
    const base = { marca, mes: plano.month, ano: plano.year }

    // O mês só está pronto para enviar quando toda pauta aprovada já
    // tem a legenda escrita: o cliente recebe a peça pronta (0025).
    const aprovadas = pautas.filter((p) => p.status === 'internally_approved')
    const semTexto = aprovadas.filter((p) => !p.temConteudo)
    if (!plano.client_released_at && aprovadas.length === pautas.length && pautas.length > 0) {
      if (semTexto.length > 0) {
        conteudo.push({ ...base, tipo: 'conteudo', total: semTexto.length })
      } else {
        enviar.push({
          ...base,
          tipo: 'enviar',
          total: pautas.length,
          semEstrategia: !(plano.estrategia_cliente ?? '').trim(),
        })
      }
    }

    const emRevisao = pautas.filter((p) => EM_REVISAO.has(p.status))
    if (emRevisao.length > 0) {
      revisar.push({
        ...base,
        tipo: 'revisar',
        total: emRevisao.length,
        emCorrecao: emRevisao.filter((p) => p.status === 'internal_changes').length,
      })
    }
  }

  ajustes.sort((a, b) => {
    const da = a.tipo === 'ajuste' ? (a.desde ?? '') : ''
    const db = b.tipo === 'ajuste' ? (b.desde ?? '') : ''
    return da < db ? -1 : da > db ? 1 : 0
  })
  const porMes = (a: ItemFila, b: ItemFila) =>
    chaveMes(a.ano, a.mes) - chaveMes(b.ano, b.mes) || a.marca.name.localeCompare(b.marca.name)
  conteudo.sort(porMes)
  enviar.sort(porMes)
  revisar.sort(porMes)

  return [...ajustes, ...conteudo, ...enviar, ...revisar]
}
