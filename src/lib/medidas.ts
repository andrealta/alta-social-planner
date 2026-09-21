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

// =============================================================
// O CUSTO
//
// `ai_runs` grava cada chamada de IA desde o primeiro dia: marca,
// etapa, modelo, tokens e custo em dólar. Nunca ninguém somou.
//
// A conta que interessa não é o total — é o custo por pauta que
// sobreviveu. Mês com trinta refinos e quatro pautas aprovadas custa
// caro por peça mesmo com total baixo, e é isso que indica base ruim.
// =============================================================

export type CorridaMedida = {
  brand_id: string
  agent: string
  cost_usd: number
  status: string
  /**
   * Quando a chamada pertencia a um mês que foi excluído, qual era o
   * mês ("2026-11"). Nulo para tudo o mais. Ver migração 0019.
   */
  planoExcluido?: string | null
}

export type Custo = {
  chamadas: number
  falhas: number
  usd: number
  porEtapa: Record<string, { chamadas: number; usd: number }>
  /**
   * A parte do custo que veio de meses excluídos. Já está DENTRO de
   * `usd` e `chamadas` — isto é só o recorte, para a tela poder dizer.
   */
  excluido: { chamadas: number; usd: number; meses: string[] }
}

export const custoVazio = (): Custo => ({
  chamadas: 0,
  falhas: 0,
  usd: 0,
  porEtapa: {},
  excluido: { chamadas: 0, usd: 0, meses: [] },
})

/** Como cada etapa se chama na tela. O banco fala em inglês. */
export const ETAPA: Record<string, string> = {
  strategy: 'geração do mês',
  research: 'pesquisa',
  content: 'conteúdo',
  refine: 'alterar IA',
  critique: 'avaliação',
  document_card: 'leitura de documento',
  brand_memory: 'memória da marca',
}

/**
 * Soma o custo por marca e por etapa.
 *
 * Chamada que falhou entra na contagem de falhas E no custo: token
 * gasto em erro é token cobrado. Esconder isso faria a tela mentir
 * justamente no caso em que o número importa.
 */
export function somarCusto(corridas: CorridaMedida[]): Map<string, Custo> {
  const porMarca = new Map<string, Custo>()

  for (const c of corridas) {
    const atual = porMarca.get(c.brand_id) ?? custoVazio()
    const usd = Number(c.cost_usd ?? 0)

    atual.chamadas++
    atual.usd += usd
    if (c.status === 'failed') atual.falhas++

    const etapa = atual.porEtapa[c.agent] ?? { chamadas: 0, usd: 0 }
    etapa.chamadas++
    etapa.usd += usd
    atual.porEtapa[c.agent] = etapa

    // Mês excluído continua custando: a geração aconteceu e foi paga.
    if (c.planoExcluido) {
      atual.excluido.chamadas++
      atual.excluido.usd += usd
      if (!atual.excluido.meses.includes(c.planoExcluido)) {
        atual.excluido.meses.push(c.planoExcluido)
      }
    }

    porMarca.set(c.brand_id, atual)
  }

  return porMarca
}

/**
 * Quanto custou cada pauta que a equipe aprovou.
 *
 * Sem pauta aprovada devolve nulo em vez de zero: zero pareceria
 * barato, quando na verdade não se sabe ainda.
 */
export function usdPorPautaAprovada(custo: Custo, aprovadas: number): number | null {
  if (aprovadas <= 0) return null
  return custo.usd / aprovadas
}

/** Soma o custo de todas as marcas numa conta só, para o rodapé da página. */
export function somarTudo(porMarca: Map<string, Custo>): Custo {
  const t = custoVazio()
  for (const c of porMarca.values()) {
    t.chamadas += c.chamadas
    t.falhas += c.falhas
    t.usd += c.usd
    t.excluido.chamadas += c.excluido.chamadas
    t.excluido.usd += c.excluido.usd
    t.excluido.meses.push(...c.excluido.meses)
    for (const [k, e] of Object.entries(c.porEtapa)) {
      const x = t.porEtapa[k] ?? { chamadas: 0, usd: 0 }
      x.chamadas += e.chamadas
      x.usd += e.usd
      t.porEtapa[k] = x
    }
  }
  return t
}

/** Dólar com duas ou três casas, conforme o tamanho — centavo importa aqui. */
export function dolar(v: number): string {
  if (v === 0) return 'US$ 0'
  if (v < 0.01) return 'US$ <0,01'
  return 'US$ ' + v.toFixed(v < 1 ? 3 : 2).replace('.', ',')
}
