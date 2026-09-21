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

/**
 * Publica (ou apaga) a estratégia do mês que o cliente lê.
 *
 * Quem pode é decidido pelo banco: a política de alteração de `plans`
 * só deixa responsável e quem edita a marca. Se ela recusar, o update
 * volta sem linha nenhuma — e a tela diz isso em vez de fingir que
 * salvou.
 */
export async function salvarEstrategia(
  slug: string,
  planoId: string,
  texto: string,
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  const limpo = (texto ?? '').trim().slice(0, 3000)
  const { data, error } = await supabase
    .from('plans')
    .update({
      estrategia_cliente: limpo === '' ? null : limpo,
      estrategia_atualizada_em: limpo === '' ? null : new Date().toISOString(),
    })
    .eq('id', planoId)
    .select('id, month, year')

  if (error) return { ok: false, erro: 'Não consegui salvar: ' + error.message }
  if (!data || data.length === 0) {
    return { ok: false, erro: 'Só quem edita esta marca pode escrever a estratégia do mês.' }
  }

  const p = data[0]
  revalidatePath(`/painel/marca/${slug}/plano/${p.year}/${p.month}`)
  revalidatePath(`/cliente/${slug}/${p.year}/${p.month}`)
  return { ok: true }
}
