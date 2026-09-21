'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/lib/supabase/server'

export type ResultadoApagar = { ok: boolean; erro?: string; pautas?: number }

/**
 * Apaga um planejamento inteiro.
 *
 * Toda a decisão de quem pode mora no banco, na função `apagar_plano`
 * e no gatilho `plans_apagar_guard` (regra da 0018): a administração
 * exclui sempre; a equipe que edita a marca, só até o envio ao
 * cliente. As recusas do banco já saem em português; aqui só
 * repassamos.
 *
 * Não existe desfazer. As pautas, o conteúdo escrito e o histórico de
 * versões saem junto, por cascata — e é assim que tem de ser: pauta
 * sem planejamento é entulho que aparece em consulta seis meses
 * depois e ninguém sabe de onde veio.
 */
export async function apagarPlano(
  slug: string,
  planoId: string,
): Promise<ResultadoApagar> {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  const { data, error } = await supabase.rpc('apagar_plano', { p_plan_id: planoId })

  if (error) {
    const nossa =
      error.message.startsWith('Este mês') ||
      error.message.startsWith('Você não tem') ||
      error.message.startsWith('Planejamento não encontrado')
    return {
      ok: false,
      erro: nossa ? error.message : 'Não consegui apagar: ' + error.message,
    }
  }

  revalidatePath(`/painel/marca/${slug}/plano`)
  revalidatePath('/painel')
  return { ok: true, pautas: Number(data ?? 0) }
}
