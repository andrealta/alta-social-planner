/**
 * As contas da tela de Qualidade.
 *
 * Ficam aqui, separadas da tela, por um motivo prático: número errado
 * numa tela de métrica não parece errado. Se a soma estiver torta,
 * ninguém desconfia — a pessoa só toma a decisão errada com cara de
 * decisão informada. Então a soma é uma função pura, e tem teste.
 */

export type PautaMedida = { id: string; plan_id: string; status: string; current_version: number }
export type VersaoMedida = { idea_id: string; trigger: string }
export type DecisaoMedida = {
  idea_id: string
  decision: string
  actor_kind: string
  seconds_to_decide: number | null
}

export type Conta = {
  /** Quantas pautas o mês tem. */
  pautas: number
  /** Nunca editadas: seguem na versão 1, sem nenhuma versão arquivada. */
  intocadas: number
  /** Aprovadas internamente ou além. */
  aprovadas: number
  /** Vezes que alguém da equipe reescreveu uma pauta. */
  correcoesEquipe: number
  /** Vezes que a IA reescreveu, a pedido da equipe. */
  refinosIA: number
  /** Pedidos de alteração vindos do cliente. */
  pedidosCliente: number
  /** Decisões do cliente, aprovando ou pedindo alteração. */
  decisoesCliente: number
  /** Segundos entre a liberação do mês e cada decisão do cliente. */
  segundos: number[]
}

export const contaVazia = (): Conta => ({
  pautas: 0,
  intocadas: 0,
  aprovadas: 0,
  correcoesEquipe: 0,
  refinosIA: 0,
  pedidosCliente: 0,
  decisoesCliente: 0,
  segundos: [],
})

const APROVADAS = new Set(['internally_approved', 'sent_to_client', 'client_approved'])

/**
 * Soma tudo por planejamento.
 *
 * Versão e decisão chegam por pauta, não por mês — então o caminho é
 * pauta → plano. Linha cuja pauta não está na lista é de um mês que
 * esta pessoa não alcança, e sai fora: somar o que não se pode ver
 * daria um total que não bate com a tela.
 */
export function somarPorPlano(dados: {
  pautas: PautaMedida[]
  versoes: VersaoMedida[]
  decisoes: DecisaoMedida[]
}): Map<string, Conta> {
  const planoDaPauta = new Map<string, string>()
  for (const p of dados.pautas) planoDaPauta.set(p.id, p.plan_id)

  const conta = new Map<string, Conta>()
  const pega = (planoId: string) => {
    const c = conta.get(planoId) ?? contaVazia()
    conta.set(planoId, c)
    return c
  }

  for (const p of dados.pautas) {
    const c = pega(p.plan_id)
    c.pautas++
    if (Number(p.current_version ?? 1) === 1) c.intocadas++
    if (APROVADAS.has(p.status)) c.aprovadas++
  }

  for (const v of dados.versoes) {
    const planoId = planoDaPauta.get(v.idea_id)
    if (!planoId) continue
    const c = pega(planoId)
    if (v.trigger === 'internal') c.correcoesEquipe++
    else if (v.trigger === 'ai') c.refinosIA++
  }

  for (const d of dados.decisoes) {
    const planoId = planoDaPauta.get(d.idea_id)
    if (!planoId) continue
    if (d.actor_kind !== 'client') continue
    const c = pega(planoId)
    c.decisoesCliente++
    if (d.decision === 'changes_requested') c.pedidosCliente++
    const s = Number(d.seconds_to_decide ?? 0)
    if (s > 0) c.segundos.push(s)
  }

  return conta
}

/** De cada cem pautas, quantas passaram sem ninguém reescrever. */
export function porcentoIntocadas(contas: Conta[]): { pct: number; intocadas: number; pautas: number } {
  const pautas = contas.reduce((s, c) => s + c.pautas, 0)
  const intocadas = contas.reduce((s, c) => s + c.intocadas, 0)
  return { pct: pautas ? Math.round((intocadas / pautas) * 100) : 0, intocadas, pautas }
}

/** A média de horas que o cliente leva para responder. */
export function horasMedias(c: Conta): number | null {
  if (c.segundos.length === 0) return null
  const media = c.segundos.reduce((s, v) => s + v, 0) / c.segundos.length
  return Math.round(media / 3600)
}
