import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A foto de perfil.
 *
 * O arquivo mora no balde privado "avatares" (migração 0024); a coluna
 * `profiles.avatar_url` guarda o caminho dele. O endereço para ver a
 * imagem é assinado na hora, e só sai para quem o banco deixa ver.
 *
 * Sem foto, a tela mostra as iniciais. Ninguém fica com um quadrado
 * cinza só porque não mandou imagem.
 */

export const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const
export const LIMITE_DA_FOTO = 2 * 1024 * 1024
/** O maior lado da imagem guardada. Foto de perfil não precisa de mais. */
export const LADO_MAXIMO = 512

const VALIDADE_SEGUNDOS = 60 * 60 * 8

export function iniciaisDe(nome: string | null | undefined): string {
  return (nome ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
}

/** O endereço assinado de uma foto. Nulo quando não há foto. */
export async function urlDaFoto(
  supabase: SupabaseClient,
  caminho: string | null | undefined,
): Promise<string | null> {
  if (!caminho) return null
  const { data } = await supabase.storage.from('avatares').createSignedUrl(caminho, VALIDADE_SEGUNDOS)
  return data?.signedUrl ?? null
}

/** As fotos de várias pessoas de uma vez, por caminho. */
export async function urlsDasFotos(
  supabase: SupabaseClient,
  caminhos: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const limpos = [...new Set(caminhos.filter((c): c is string => !!c))]
  if (limpos.length === 0) return mapa
  const { data } = await supabase.storage.from('avatares').createSignedUrls(limpos, VALIDADE_SEGUNDOS)
  for (const a of data ?? []) {
    if (a.path && a.signedUrl) mapa.set(a.path, a.signedUrl)
  }
  return mapa
}

/**
 * A foto redonda ao lado do nome. Serve na barra do topo, na lista de
 * pessoas e em qualquer lugar que mostre gente.
 */
export function Avatar({
  nome,
  url,
  tamanho = 30,
  cor,
}: {
  nome: string | null | undefined
  url?: string | null
  tamanho?: number
  /** Fundo das iniciais. O padrão é o cinza neutro da interface. */
  cor?: string
}) {
  const iniciais = iniciaisDe(nome)
  return (
    <span
      aria-hidden
      title={nome ?? undefined}
      style={{
        width: tamanho,
        height: tamanho,
        flexShrink: 0,
        borderRadius: 99,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        background: cor ?? 'var(--surface-3)',
        color: cor ? '#fff' : 'var(--muted)',
        fontFamily: 'var(--disp)',
        fontSize: Math.max(10, Math.round(tamanho * 0.4)),
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          width={tamanho}
          height={tamanho}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        iniciais || '?'
      )}
    </span>
  )
}
