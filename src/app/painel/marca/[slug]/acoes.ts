'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/lib/supabase/server'
import { SECOES } from '@/lib/base'

export type Resultado = { ok: boolean; salvas: number; erro?: string }

/**
 * Grava as seções alteradas da base de uma marca.
 *
 * Roda no servidor, mas com a identidade de quem está logado — as
 * políticas do banco valem. Um cliente que forjasse esta chamada não
 * conseguiria gravar: a política `staff_all` exige `is_staff()`.
 *
 * Só chegam aqui as seções que mudaram. Um `upsert` por seção, porque
 * cada uma é uma linha só, com o conteúdo inteiro em JSON.
 */
export async function salvarBase(
  slug: string,
  alteracoes: Record<string, Record<string, string>>,
): Promise<Resultado> {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, salvas: 0, erro: 'Sua sessão expirou. Entre de novo.' }

  // As chaves aceitas são só as que a tela declara. Não confiamos no
  // que chegou do navegador para montar nome de seção ou de campo.
  const permitidas = new Map(SECOES.map((s) => [s.chave, new Set(s.campos.map((c) => c.id))]))

  const { data: marca, error: erroMarca } = await supabase
    .from('brands')
    .select('id')
    .eq('slug', slug)
    .single()

  if (erroMarca || !marca) {
    return { ok: false, salvas: 0, erro: 'Não achei esta marca, ou você não tem acesso a ela.' }
  }

  const linhas: { brand_id: string; section: string; content: Record<string, string>; updated_by: string; updated_at: string }[] = []

  for (const [secao, campos] of Object.entries(alteracoes)) {
    const validos = permitidas.get(secao)
    if (!validos) continue

    const limpo: Record<string, string> = {}
    for (const [id, valor] of Object.entries(campos)) {
      if (!validos.has(id)) continue
      const texto = typeof valor === 'string' ? valor.trim() : ''
      if (texto !== '') limpo[id] = texto
    }

    linhas.push({
      brand_id: marca.id as string,
      section: secao,
      content: limpo,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
  }

  if (linhas.length === 0) return { ok: true, salvas: 0 }

  const { error } = await supabase
    .from('brand_knowledge')
    .upsert(linhas, { onConflict: 'brand_id,section' })

  if (error) {
    return {
      ok: false,
      salvas: 0,
      erro:
        error.message.includes('policy') || error.code === '42501'
          ? 'O banco recusou a gravação: seu usuário não tem permissão de editar esta marca.'
          : error.message,
    }
  }

  revalidatePath(`/painel/marca/${slug}`)
  return { ok: true, salvas: linhas.length }
}
