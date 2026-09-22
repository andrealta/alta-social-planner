import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Os layouts (as artes) de cada publicação.
 *
 * O arquivo mora no balde privado "layouts" do Storage; a tabela
 * `pauta_layouts` guarda a ordem e quem mandou (migração 0023). O
 * navegador nunca recebe o endereço permanente do arquivo: recebe um
 * link assinado, que vale por algumas horas e só é gerado para quem o
 * banco deixa ler aquela linha. Equipe e cliente usam a mesma função.
 */

export type Layout = {
  id: string
  url: string | null
  caminho: string
  largura: number | null
  altura: number | null
  posicao: number
  nome: string | null
}

export const TIPOS_DE_LAYOUT = ['image/jpeg', 'image/png', 'image/webp'] as const
export const LIMITE_DE_BYTES = 10 * 1024 * 1024
export const LIMITE_POR_PUBLICACAO = 10

/** Quanto vale o link assinado: um dia de trabalho, folgado. */
const VALIDADE_SEGUNDOS = 60 * 60 * 8

/** Os layouts de várias publicações, em ordem, com o link para ver. */
export async function carregarLayouts(
  supabase: SupabaseClient,
  ideias: string[],
): Promise<Map<string, Layout[]>> {
  const mapa = new Map<string, Layout[]>()
  if (ideias.length === 0) return mapa

  const { data: linhas } = await supabase
    .from('pauta_layouts')
    .select('id, idea_id, storage_path, largura, altura, posicao, nome_original')
    .in('idea_id', ideias)
    .order('posicao')
  if (!linhas || linhas.length === 0) return mapa

  const caminhos = linhas.map((l) => l.storage_path as string)
  const { data: assinados } = await supabase.storage
    .from('layouts')
    .createSignedUrls(caminhos, VALIDADE_SEGUNDOS)
  const urlDe = new Map<string, string>()
  for (const a of assinados ?? []) {
    if (a.path && a.signedUrl) urlDe.set(a.path, a.signedUrl)
  }

  for (const l of linhas) {
    const ideia = l.idea_id as string
    const lista = mapa.get(ideia) ?? []
    lista.push({
      id: l.id as string,
      url: urlDe.get(l.storage_path as string) ?? null,
      caminho: l.storage_path as string,
      largura: (l.largura as number | null) ?? null,
      altura: (l.altura as number | null) ?? null,
      posicao: Number(l.posicao ?? 0),
      nome: (l.nome_original as string | null) ?? null,
    })
    mapa.set(ideia, lista)
  }
  return mapa
}

/**
 * Pode anexar ou trocar o layout desta publicação agora? Espelha o
 * gatilho do banco, que é quem manda. Serve para a tela explicar antes
 * de a pessoa tentar.
 */
export function podeMexerNoLayout(d: {
  status: string
  temConteudo: boolean
  podeEditar: boolean
  admin: boolean
}): { pode: boolean; motivo: string | null } {
  if (!d.podeEditar) return { pode: false, motivo: null }
  if (!d.temConteudo) {
    return { pode: false, motivo: 'Crie o conteúdo da publicação antes de anexar o layout.' }
  }
  if (['ai_generated', 'internal_review', 'internal_changes'].includes(d.status)) {
    return { pode: false, motivo: 'Aprove a pauta internamente para anexar o layout.' }
  }
  if (d.status === 'sent_to_client' && !d.admin) {
    return {
      pode: false,
      motivo: 'A publicação está com o cliente para avaliação. Só a administração troca o layout agora.',
    }
  }
  if (d.status === 'client_approved' && !d.admin) {
    return {
      pode: false,
      motivo: 'O cliente já aprovou esta publicação. Só a administração troca o layout.',
    }
  }
  return { pode: true, motivo: null }
}
