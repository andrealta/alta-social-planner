/**
 * O histórico de produção da marca, do lado do site.
 *
 * O retrato é montado fora daqui, pela rotina que conversa com o
 * Operand (`scripts/operand-perfil.mjs`), e fica guardado em
 * `operand_perfil`. Este arquivo só busca o texto pronto e o entrega
 * a quem monta o prompt.
 *
 * POR QUE NÃO CALCULAR AQUI
 *
 * São centenas de jobs por marca e o retrato muda, no máximo, uma vez
 * por dia. Recalcular a cada geração seria pagar várias vezes por dia
 * pelo mesmo resultado, e faria a geração do mês depender de uma
 * consulta pesada. Guardado, ele também pode ser LIDO por uma pessoa
 * antes de influenciar qualquer sugestão, que é o ponto principal.
 *
 * FALTAR É NORMAL
 *
 * Marca sem Operand ligado, ou ligada mas ainda sem sincronização,
 * devolve nulo, e o planejamento acontece exatamente como antes. Isto
 * nunca pode virar pré-requisito para trabalhar: é uma fonte a mais,
 * ao lado da base, do estilo, dos concorrentes e do histórico.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Quando um retrato deixa de ser descrição do presente. */
export const DIAS_ATE_ENVELHECER = 45

function comoDataBR(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  const dd = (n: number) => String(n).padStart(2, '0')
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Quantos dias desde que o retrato foi montado. */
export function idadeEmDias(geradoEm: string | null | undefined, hoje = new Date()): number | null {
  if (!geradoEm) return null
  const d = new Date(geradoEm)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((hoje.getTime() - d.getTime()) / 86_400_000)
}

/**
 * Monta o texto que vai para o prompt, com a data na frente.
 *
 * A data não é enfeite. Um retrato de seis meses atrás descreve uma
 * conta que pode ter mudado de ritmo, e o modelo precisa saber disso
 * para não falar do passado no presente. Quando passa do prazo, o
 * texto diz com todas as letras que está velho, em vez de sumir: dado
 * velho declarado vale mais que nenhum dado.
 */
export function textoDeProducao(
  resumo: string | null | undefined,
  geradoEm: string | null | undefined,
  hoje = new Date(),
): string | null {
  const t = (resumo ?? '').trim()
  if (!t) return null

  const dias = idadeEmDias(geradoEm, hoje)
  const quando = comoDataBR(geradoEm)
  const cabeca =
    dias !== null && dias > DIAS_ATE_ENVELHECER
      ? `Retrato montado em ${quando}, há ${dias} dias. Está desatualizado: trate os ` +
        `números como ordem de grandeza, não como a situação de hoje.`
      : quando
        ? `Retrato montado em ${quando}.`
        : null

  return cabeca ? `${cabeca}\n\n${t}` : t
}

/**
 * Busca o retrato da marca. Nulo quando não há, e isso é normal.
 *
 * Erro de leitura também devolve nulo de propósito: se a tabela do
 * Operand estiver fora do ar ou a política recusar, o mês do cliente
 * não pode parar por causa de uma fonte auxiliar.
 */
export async function coletarProducao(
  supabase: SupabaseClient,
  brandId: string,
  hoje = new Date(),
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('operand_perfil')
      .select('resumo, gerado_em')
      .eq('brand_id', brandId)
      .maybeSingle()

    if (!data) return null
    return textoDeProducao(
      data.resumo as string | null,
      data.gerado_em as string | null,
      hoje,
    )
  } catch {
    return null
  }
}
