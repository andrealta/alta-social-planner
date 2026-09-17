'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/lib/supabase/server'

export type Resultado = { ok: boolean; erro?: string }

/**
 * Registra a decisão do cliente sobre uma pauta.
 *
 * Tudo o que importa acontece dentro da função `decidir_pauta` do
 * banco: comentário, registro da decisão e mudança de estado, numa
 * transação só. Esta camada existe para traduzir o erro em português
 * e recarregar a página — não para decidir nada.
 *
 * Repare no que NÃO é enviado daqui: quem está decidindo, a marca, a
 * versão. Tudo isso o banco lê da sessão e das próprias linhas. Um
 * pedido forjado não consegue mentir sobre essas três coisas.
 */
export async function decidir(
  slug: string,
  ano: number,
  mes: number,
  ideaId: string,
  decisao: 'approved' | 'changes_requested',
  comentario: string,
): Promise<Resultado> {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  if (decisao !== 'approved' && decisao !== 'changes_requested') {
    return { ok: false, erro: 'Decisão inválida.' }
  }

  const texto = (comentario ?? '').trim().slice(0, 4000)

  if (decisao === 'changes_requested' && texto === '') {
    return { ok: false, erro: 'Escreva o que você gostaria de mudar.' }
  }

  const { error } = await supabase.rpc('decidir_pauta', {
    p_idea_id: ideaId,
    p_decisao: decisao,
    p_comentario: texto === '' ? null : texto,
  })

  if (error) {
    const m = error.message
    return {
      ok: false,
      erro: m.includes('não está com você')
        ? 'Esta publicação não está aguardando você. Atualize a página.'
        : m.includes('dizer o que mudar')
          ? 'Escreva o que você gostaria de mudar.'
          : 'Não consegui registrar: ' + m,
    }
  }

  revalidatePath(`/cliente/${slug}/${ano}/${mes}`)
  return { ok: true }
}
