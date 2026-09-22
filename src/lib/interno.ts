import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * O material só da Alta sobre cada planejamento: o briefing que a
 * equipe digitou para a IA e a análise (leitura do mês, territórios,
 * crítica de cada pauta, alertas).
 *
 * Mora na tabela `plano_interno`, separada de `plans`, porque o
 * cliente lê `plans` e a política do banco libera a linha inteira,
 * sem escolher coluna. Em `plano_interno` só existe política para a
 * equipe (migração 0022): para o cliente, a tabela é sempre vazia.
 *
 * Planejamento sem linha aqui é normal (mês antigo, ou ainda gerando).
 * Quem lê recebe análise vazia e segue.
 */

export type Interno = {
  briefing: string | null
  analysis: Record<string, unknown>
}

const VAZIO: Interno = { briefing: null, analysis: {} }

/** O material interno de um planejamento. */
export async function lerInterno(supabase: SupabaseClient, planId: string): Promise<Interno> {
  const { data } = await supabase
    .from('plano_interno')
    .select('briefing, analysis')
    .eq('plan_id', planId)
    .maybeSingle()
  if (!data) return VAZIO
  return {
    briefing: (data.briefing as string | null) ?? null,
    analysis: (data.analysis ?? {}) as Record<string, unknown>,
  }
}

/** A análise de vários planejamentos de uma vez, por id do plano. */
export async function lerAnalises(
  supabase: SupabaseClient,
  planIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const mapa = new Map<string, Record<string, unknown>>()
  if (planIds.length === 0) return mapa
  const { data } = await supabase
    .from('plano_interno')
    .select('plan_id, analysis')
    .in('plan_id', planIds)
  for (const l of data ?? []) {
    mapa.set(l.plan_id as string, (l.analysis ?? {}) as Record<string, unknown>)
  }
  return mapa
}

/**
 * Grava o que vier (briefing, análise ou os dois) sem apagar o outro.
 * A marca é preenchida pelo banco a partir do planejamento; o valor
 * mandado aqui é só para satisfazer a coluna.
 */
export async function gravarInterno(
  supabase: SupabaseClient,
  planId: string,
  brandId: string,
  dados: Partial<Interno>,
): Promise<string | null> {
  const { error } = await supabase
    .from('plano_interno')
    .upsert({ plan_id: planId, brand_id: brandId, ...dados }, { onConflict: 'plan_id' })
  return error ? error.message : null
}
