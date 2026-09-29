/**
 * O Operand, do lado do site.
 *
 * O site NÃO fala com o Operand. Quem fala é a rotina de
 * sincronização, que roda fora daqui (`scripts/operand.mjs`) e guarda
 * o resultado em `operand_jobs`. O site só lê essa cópia.
 *
 * A separação é de propósito, e vale as duas frases que custa
 * explicar: o segredo do Operand nunca precisa viajar para a Vercel, e
 * o mês do cliente não depende de um sistema de terceiro estar no ar
 * na hora em que alguém abre o calendário. Quando faltar
 * sincronização, a tela mostra dado de ontem avisando que é de ontem,
 * em vez de mostrar erro.
 *
 * Por isso este arquivo é pequeno: tipos e as duas ou três decisões de
 * como mostrar o que veio.
 */

/** Um job do Operand, como ele está guardado aqui. */
export type JobLocal = {
  jobId: number
  titulo: string
  situacao: string | null
  statusNome: string | null
  statusCor: string | null
  responsavel: string | null
  projetoNome: string | null
  sequencia: number | null
  inicio: string | null
  prazo: string | null
  /** Minutos orçados e minutos apontados, direto do Operand. */
  tempoEstimado: number | null
  tempoTrabalhado: number | null
  tarefasAbertas: number | null
  tarefasFechadas: number | null
  vistoEm: string | null
}

/**
 * Minutos viram "3h20".
 *
 * Ninguém na agência fala em minutos quando o assunto é quanto uma
 * peça custou de trabalho. Meia hora é "30min", três horas e vinte é
 * "3h20", e tempo nenhum é "0h" e não um traço: zero apontado é uma
 * informação, não um campo vazio.
 */
export function emHoras(minutos: number | null | undefined): string {
  const bruto = Number(minutos)
  if (!Number.isFinite(bruto) || bruto <= 0) return '0h'
  // Arredonda antes de dividir: sem isso, 90,4 minutos viram "1h30,4".
  const m = Math.round(bruto)
  const h = Math.floor(m / 60)
  const resto = m % 60
  if (h === 0) return `${resto}min`
  return resto === 0 ? `${h}h` : `${h}h${String(resto).padStart(2, '0')}`
}

/**
 * O trabalho apontado passou do que foi orçado?
 *
 * Devolve a fração gasta sobre a orçada, ou null quando não dá para
 * comparar. Sem orçamento não existe estouro: um job sem estimativa
 * não está "acima do previsto", está sem previsão, e mostrar os dois
 * casos do mesmo jeito faria a equipe desconfiar do número todo.
 */
export function consumoDoOrcamento(
  estimado: number | null | undefined,
  trabalhado: number | null | undefined,
): number | null {
  // Number(null) é 0, e 0 é um apontamento legítimo. Sem esta linha,
  // "ainda não sei quanto foi trabalhado" viraria "zero trabalhado", e
  // a tela mostraria 0% de consumo com cara de certeza.
  if (estimado === null || estimado === undefined) return null
  if (trabalhado === null || trabalhado === undefined) return null
  const e = Number(estimado)
  const t = Number(trabalhado)
  if (!Number.isFinite(e) || e <= 0) return null
  if (!Number.isFinite(t) || t < 0) return null
  return t / e
}

/**
 * Como mostrar quando a cópia foi feita.
 *
 * Nunca diz "agora mesmo" sem ter certeza, e nunca esconde que é uma
 * cópia. Uma tela que mostra dado de três dias atrás como se fosse
 * atual é pior que uma tela vazia: a segunda faz a pessoa ir conferir,
 * a primeira faz ela decidir errado com cara de certeza.
 */
export function quandoFoiVisto(em: string | Date | null | undefined): string {
  if (!em) return 'nunca sincronizado'
  const quando = em instanceof Date ? em : new Date(em)
  if (Number.isNaN(quando.getTime())) return 'nunca sincronizado'

  const minutos = Math.floor((Date.now() - quando.getTime()) / 60000)
  if (minutos < 1) return 'visto agora'
  if (minutos < 60) return `visto há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `visto há ${horas}h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'visto ontem' : `visto há ${dias} dias`
}

/**
 * A cópia está velha a ponto de não valer decisão?
 *
 * Seis horas é um palpite, e assumo: é mais ou menos meio dia de
 * trabalho. Passado isso, a tela para de mostrar o dado como
 * informação e passa a mostrá-lo como lembrete de sincronizar.
 */
export function copiaVelha(em: string | Date | null | undefined, horas = 6): boolean {
  if (!em) return true
  const quando = em instanceof Date ? em : new Date(em)
  if (Number.isNaN(quando.getTime())) return true
  return Date.now() - quando.getTime() > horas * 3600_000
}

/**
 * O prazo do job em relação a hoje.
 *
 * Só três respostas, porque é o que cabe numa etiqueta e é o que a
 * pessoa precisa saber de relance: passou, é hoje, ou ainda há tempo.
 */
export type Prazo = 'atrasado' | 'hoje' | 'emDia' | 'semPrazo'

export function situacaoDoPrazo(prazo: string | null | undefined, hoje = new Date()): Prazo {
  if (!prazo) return 'semPrazo'
  const d = String(prazo).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'semPrazo'
  const h =
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-` +
    `${String(hoje.getDate()).padStart(2, '0')}`
  if (d < h) return 'atrasado'
  if (d === h) return 'hoje'
  return 'emDia'
}

export const CORES_DO_PRAZO: Record<Prazo, { cor: string; wash: string; rotulo: string }> = {
  atrasado: { cor: 'var(--laranja)', wash: 'var(--laranja-wash)', rotulo: 'atrasado' },
  hoje: { cor: 'var(--st-avaliacao)', wash: 'var(--amarelo-wash)', rotulo: 'vence hoje' },
  emDia: { cor: 'var(--st-aprovado)', wash: 'var(--st-aprovado-wash)', rotulo: 'em dia' },
  semPrazo: { cor: 'var(--faint)', wash: 'var(--surface-3)', rotulo: 'sem prazo' },
}
