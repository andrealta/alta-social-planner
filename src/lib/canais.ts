/**
 * As plataformas, em um lugar só.
 *
 * Existia uma lista em `lib/prompt.ts`, usada pela geração e pela
 * conferência, e o banco tem o tipo `platform` com os mesmos seis
 * nomes. A tela de pauta nova precisa da mesma lista, e importar
 * `prompt.ts` num componente de navegador arrastaria quarenta mil
 * caracteres de texto de prompt para dentro do pacote que o usuário
 * baixa. Daí este arquivo: pequeno, sem dependência, e o único lugar
 * onde a lista existe.
 *
 * `prompt.ts` reexporta daqui, para nada que já importava de lá
 * precisar mudar de endereço.
 */

export const PLATAFORMAS = [
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
  'facebook',
  'pinterest',
]

/** Como cada uma se escreve para gente ler. */
export const NOME_DA_PLATAFORMA: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
}

/**
 * Formatos sugeridos por plataforma.
 *
 * Sugestão, não trava: o campo continua sendo texto livre no banco,
 * porque formato novo aparece antes de qualquer lista ser atualizada.
 */
export const FORMATOS: Record<string, string[]> = {
  instagram: ['Feed', 'Carrossel', 'Reels', 'Stories'],
  linkedin: ['Feed', 'Carrossel', 'Artigo', 'Vídeo'],
  tiktok: ['Vídeo'],
  youtube: ['Vídeo', 'Shorts'],
  facebook: ['Feed', 'Carrossel', 'Vídeo'],
  pinterest: ['Pin', 'Carrossel'],
}
