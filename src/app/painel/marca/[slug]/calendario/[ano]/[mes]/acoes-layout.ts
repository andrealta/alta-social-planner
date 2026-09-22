'use server'

import { clienteServidor } from '@/lib/supabase/server'
import {
  LIMITE_DE_BYTES,
  LIMITE_POR_PUBLICACAO,
  TIPOS_DE_LAYOUT,
  podeMexerNoLayout,
  type Layout,
} from '@/lib/layouts'

/**
 * Anexar, tirar e reordenar o layout de uma publicação.
 *
 * O arquivo não passa por aqui: o navegador manda direto para o
 * Storage (servidor de função tem limite de tamanho de corpo, e imagem
 * de 8 MB não caberia). O caminho é decidido aqui, e o banco confere
 * de novo, pela política do balde e pelo gatilho da tabela.
 *
 * Três passos para anexar:
 *   1. prepararLayout: confere se pode e devolve o caminho do arquivo;
 *   2. o navegador envia o arquivo para esse caminho;
 *   3. registrarLayout: grava a linha. Se a linha for recusada, o
 *      arquivo enviado é apagado, para não sobrar imagem órfã.
 */

type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

const EXTENSAO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

async function contexto(ideaId: string) {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { erro: 'Sua sessão expirou. Entre de novo.' }

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const papel = (perfil?.role as string) ?? 'client'
  if (papel !== 'admin' && papel !== 'staff') return { erro: 'Só a equipe da Alta anexa layout.' }

  const { data: pauta } = await supabase
    .from('content_ideas')
    .select('id, brand_id, status')
    .eq('id', ideaId)
    .maybeSingle()
  if (!pauta) return { erro: 'Não achei esta publicação, ou você não tem acesso a ela.' }

  const [{ data: nivel }, { data: conteudo }] = await Promise.all([
    supabase.rpc('nivel_na_marca', { b: pauta.brand_id }),
    supabase.from('idea_content').select('id').eq('idea_id', ideaId).maybeSingle(),
  ])

  const regra = podeMexerNoLayout({
    status: (pauta.status as string) ?? '',
    temConteudo: !!conteudo,
    podeEditar: nivel === 'owner' || nivel === 'editor',
    admin: papel === 'admin',
  })
  return { supabase, user, pauta, regra }
}

export async function prepararLayout(
  ideaId: string,
  arquivo: { tipo: string; bytes: number },
): Promise<Resposta<{ caminho: string }>> {
  const ctx = await contexto(ideaId)
  if ('erro' in ctx) return { ok: false, erro: ctx.erro as string }
  if (!ctx.regra.pode) {
    return { ok: false, erro: ctx.regra.motivo ?? 'Você tem acesso de leitura nesta marca.' }
  }
  if (!(TIPOS_DE_LAYOUT as readonly string[]).includes(arquivo.tipo)) {
    return { ok: false, erro: 'Use imagem em JPG, PNG ou WEBP.' }
  }
  if (arquivo.bytes > LIMITE_DE_BYTES) {
    return { ok: false, erro: 'A imagem passa de 10 MB. Exporte uma versão mais leve.' }
  }
  const { count } = await ctx.supabase
    .from('pauta_layouts')
    .select('id', { count: 'exact', head: true })
    .eq('idea_id', ideaId)
  if ((count ?? 0) >= LIMITE_POR_PUBLICACAO) {
    return { ok: false, erro: `Cada publicação aceita até ${LIMITE_POR_PUBLICACAO} imagens.` }
  }

  const caminho = `${ctx.pauta.brand_id}/${ideaId}/${crypto.randomUUID()}.${EXTENSAO[arquivo.tipo]}`
  return { ok: true, caminho }
}

export async function registrarLayout(
  ideaId: string,
  d: { caminho: string; tipo: string; bytes: number; largura: number | null; altura: number | null; nome: string },
): Promise<Resposta<{ layout: Layout }>> {
  const ctx = await contexto(ideaId)
  if ('erro' in ctx) return { ok: false, erro: ctx.erro as string }

  const { data: ultimo } = await ctx.supabase
    .from('pauta_layouts')
    .select('posicao')
    .eq('idea_id', ideaId)
    .order('posicao', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: linha, error } = await ctx.supabase
    .from('pauta_layouts')
    .insert({
      idea_id: ideaId,
      brand_id: ctx.pauta.brand_id,
      storage_path: d.caminho,
      mime_type: d.tipo,
      bytes: d.bytes,
      largura: d.largura,
      altura: d.altura,
      nome_original: d.nome.slice(0, 200),
      posicao: ultimo ? Number(ultimo.posicao) + 1 : 0,
      created_by: ctx.user.id,
    })
    .select('id, storage_path, largura, altura, posicao, nome_original')
    .single()

  if (error || !linha) {
    // A linha foi recusada: o arquivo que acabou de subir não tem dono.
    await ctx.supabase.storage.from('layouts').remove([d.caminho])
    return { ok: false, erro: error?.message ?? 'Não consegui registrar o layout.' }
  }

  const { data: assinado } = await ctx.supabase.storage
    .from('layouts')
    .createSignedUrl(linha.storage_path as string, 60 * 60 * 8)

  return {
    ok: true,
    layout: {
      id: linha.id as string,
      url: assinado?.signedUrl ?? null,
      caminho: linha.storage_path as string,
      largura: (linha.largura as number | null) ?? null,
      altura: (linha.altura as number | null) ?? null,
      posicao: Number(linha.posicao ?? 0),
      nome: (linha.nome_original as string | null) ?? null,
    },
  }
}

export async function removerLayout(ideaId: string, layoutId: string): Promise<Resposta> {
  const ctx = await contexto(ideaId)
  if ('erro' in ctx) return { ok: false, erro: ctx.erro as string }
  if (!ctx.regra.pode) return { ok: false, erro: ctx.regra.motivo ?? 'Sem permissão.' }

  const { data: linha, error } = await ctx.supabase
    .from('pauta_layouts')
    .delete()
    .eq('id', layoutId)
    .eq('idea_id', ideaId)
    .select('storage_path')
    .maybeSingle()
  if (error) return { ok: false, erro: error.message }
  if (!linha) return { ok: false, erro: 'Não consegui tirar este layout.' }

  // A linha saiu; agora o arquivo pode sair também (ver a política do balde).
  await ctx.supabase.storage.from('layouts').remove([linha.storage_path as string])
  return { ok: true }
}

/** Grava a ordem nova: `ids` na ordem em que devem aparecer. */
export async function ordenarLayouts(ideaId: string, ids: string[]): Promise<Resposta> {
  const ctx = await contexto(ideaId)
  if ('erro' in ctx) return { ok: false, erro: ctx.erro as string }
  if (!ctx.regra.pode) return { ok: false, erro: ctx.regra.motivo ?? 'Sem permissão.' }

  for (let i = 0; i < ids.length; i++) {
    const { error } = await ctx.supabase
      .from('pauta_layouts')
      .update({ posicao: i })
      .eq('id', ids[i])
      .eq('idea_id', ideaId)
    if (error) return { ok: false, erro: error.message }
  }
  return { ok: true }
}
