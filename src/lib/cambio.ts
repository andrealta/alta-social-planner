/**
 * De dólar para real.
 *
 * A Anthropic cobra em dólar e a agência paga em real, no cartão. Esta
 * conversão tem três decisões dentro, e todas vão escritas aqui porque
 * número de tela de custo é lido como fato.
 *
 * PRIMEIRA: cada chamada é convertida pela cotação do DIA EM QUE ELA
 * ACONTECEU, não pela de hoje. Converter tudo pelo dólar de hoje faria
 * o passado andar: um mês fechado mostraria um valor diferente a cada
 * semana, sem nada ter acontecido. Mês fechado é mês fechado.
 *
 * SEGUNDA: o que a tela mostra é o que chega na fatura, não a cotação
 * pura. Entre o dólar de mercado e o que o cartão cobra existem o IOF
 * e o spread do banco, e um número 4% abaixo da fatura não serve para
 * decidir nada. A tela mostra as três partes separadas, para o número
 * poder ser conferido contra o extrato.
 *
 * TERCEIRA: quando falta a cotação de um dia, a conta usa a do dia
 * conhecido mais próximo e a tela DIZ que fez isso. Fim de semana,
 * feriado e dia em que ninguém abriu a página não têm cotação própria.
 */

/**
 * IOF sobre compra internacional no cartão de crédito: 3,5%.
 *
 * Conferido na web em outubro de 2026. A alíquota foi fixada em 3,5%
 * por decreto em 2025, e a redução gradual que levaria a zero até 2028
 * ficou suspensa. Se mudar, é este número que muda.
 */
export const IOF_CARTAO = 0.035

/**
 * Spread do banco sobre a cotação comercial: 1%.
 *
 * Este varia de banco para banco, de 1% a 4%. Um por cento é o piso, e
 * foi escolhido para a tela nunca prometer que o gasto foi menor do
 * que foi. Para acertar com a fatura da Alta, é só trocar este número.
 */
export const SPREAD_CARTAO = 0.01

/**
 * O fator que transforma a cotação comercial no que o cartão cobra.
 *
 * Multiplicativo, não somado: o banco aplica o spread sobre a cotação
 * e o IOF incide sobre o valor já convertido em reais. A diferença
 * entre as duas contas é pequena, e a conta certa é a certa.
 */
export function fatorCartao(iof = IOF_CARTAO, spread = SPREAD_CARTAO): number {
  return (1 + spread) * (1 + iof)
}

/** Dólares para reais, por uma cotação. */
export function emReais(usd: number, cotacao: number, comCartao = true): number {
  const u = Number(usd)
  const c = Number(cotacao)
  if (!Number.isFinite(u) || !Number.isFinite(c) || c <= 0) return 0
  return u * c * (comCartao ? fatorCartao() : 1)
}

/**
 * Lê a cotação de uma resposta de API.
 *
 * Aceita os dois formatos que podem aparecer e NÃO confia em nenhum: o
 * nome de um campo muda sem aviso, e um `undefined` virando `NaN` numa
 * tela de custo não quebra nada — só mostra um número errado com cara
 * de certo. Por isso ela devolve nulo em vez de chutar, e quem chama
 * tem de lidar com o nulo.
 *
 * A faixa de plausibilidade existe pela mesma razão: se um dia a API
 * devolver o inverso (dólar por real, 0,18) ou um centavo de dólar, o
 * valor é recusado em vez de entrar na conta.
 */
export function lerCotacao(bruto: unknown): number | null {
  const plausivel = (n: unknown): number | null => {
    const v = typeof n === 'string' ? Number(n.replace(',', '.')) : Number(n)
    if (!Number.isFinite(v) || v < 1 || v > 50) return null
    return v
  }

  if (!bruto || typeof bruto !== 'object') return plausivel(bruto)
  const o = bruto as Record<string, unknown>

  // awesomeapi: { "USDBRL": { "bid": "5.4321", "ask": "5.4330", ... } }
  const par = o.USDBRL ?? o.USDBRL_ ?? null
  if (par && typeof par === 'object') {
    const p = par as Record<string, unknown>
    return plausivel(p.ask) ?? plausivel(p.bid) ?? plausivel(p.high)
  }

  // PTAX do Banco Central: { "value": [ { "cotacaoVenda": 5.4321, ... } ] }
  if (Array.isArray(o.value) && o.value.length > 0) {
    const p = o.value[o.value.length - 1] as Record<string, unknown>
    return plausivel(p?.cotacaoVenda) ?? plausivel(p?.cotacaoCompra)
  }

  // Formatos rasos: { "bid": ... } ou { "rates": { "BRL": ... } }
  const rasos = [o.ask, o.bid, o.valor, o.value, o.rate]
  for (const r of rasos) {
    const v = plausivel(r)
    if (v !== null) return v
  }
  const taxas = o.rates
  if (taxas && typeof taxas === 'object') {
    return plausivel((taxas as Record<string, unknown>).BRL)
  }

  return null
}

export type Cotacao = { dia: string; valor: number }

/**
 * A cotação para usar num dia.
 *
 * Exata quando existe a do próprio dia. Senão, a do dia conhecido mais
 * próximo — e `exata: false`, para a tela poder avisar. Preferência
 * para trás: a cotação de ontem descreve melhor o que aconteceu hoje
 * de manhã do que a de amanhã.
 */
export function cotacaoDoDia(
  cotacoes: Cotacao[],
  dia: string,
): { valor: number; exata: boolean; dia: string } | null {
  if (cotacoes.length === 0) return null
  const exata = cotacoes.find((c) => c.dia === dia)
  if (exata) return { valor: exata.valor, exata: true, dia: exata.dia }

  let melhor: Cotacao | null = null
  let distancia = Infinity
  for (const c of cotacoes) {
    // Empate entre uma anterior e uma posterior: fica a anterior.
    const d = Math.abs(dias(c.dia, dia)) * 2 + (c.dia > dia ? 1 : 0)
    if (d < distancia) {
      distancia = d
      melhor = c
    }
  }
  return melhor ? { valor: melhor.valor, exata: false, dia: melhor.dia } : null
}

function dias(a: string, b: string): number {
  const ms = new Date(a + 'T12:00:00Z').getTime() - new Date(b + 'T12:00:00Z').getTime()
  return Math.round(ms / 86400000)
}

/** O dia de uma data ISO, em São Paulo. É lá que a agência gasta. */
export function diaEmSaoPaulo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
