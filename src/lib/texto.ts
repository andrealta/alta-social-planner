/**
 * O texto que vai publicado: um só na tela, cinco colunas no banco.
 *
 * A IA escreve legenda, chamada para ação e hashtags em campos
 * separados, e precisa mesmo: ela tem regras diferentes para cada um, o
 * portal do cliente imprime as hashtags em tinta mais clara, e o export
 * lista as tags. Só que na hora de publicar isso tudo é UM texto, na
 * ordem em que sai no post, e é assim que a equipe lê e escreve.
 *
 * Estas funções são a única tradução entre as duas formas. Ficam aqui,
 * fora da tela, porque são a parte que pode dar errado em silêncio: uma
 * separação mal feita perde hashtag ou come pedaço de legenda, e
 * ninguém percebe até o post ir ao ar.
 */

/**
 * Junta na ordem em que sai no post, com linha em branco entre as
 * partes. É o texto que a pessoa copia e cola no Instagram.
 */
export function juntarTextoDeApoio(
  legenda: string | null | undefined,
  cta: string | null | undefined,
  hashtags: string[] | null | undefined,
): string {
  return [legenda, cta, (hashtags ?? []).join(' ')]
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Separa de volta, na hora de gravar.
 *
 * As hashtags do FIM voltam a ser lista. O resto inteiro vira a
 * legenda, e a chamada para ação deixa de existir como coluna própria:
 * ela já está dentro do texto, e não há como adivinhar onde começa.
 * Quem lê depois, inclusive a IA no refino, recebe o texto como ele vai
 * ser publicado, que é o que importa.
 *
 * Hashtag escrita no meio do texto fica no meio do texto. Só o bloco
 * final é reconhecido como lista, que é onde ele sempre está.
 */
export function separarTextoDeApoio(bruto: string): {
  legenda: string | null
  hashtags: string[]
} {
  const texto = (bruto ?? '').replace(/[ \t]+$/gm, '').trim()
  if (!texto) return { legenda: null, hashtags: [] }

  const fim = texto.match(/(?:^|\s)((?:#[^\s#]+)(?:\s+#[^\s#]+)*)\s*$/)
  if (!fim || fim.index === undefined) return { legenda: texto, hashtags: [] }

  const hashtags = [...new Set(fim[1].split(/\s+/).filter(Boolean))].slice(0, 30)
  const legenda = texto.slice(0, fim.index).replace(/\s+$/, '')
  return { legenda: legenda || null, hashtags }
}

/** A sugestão de layout: conceito e direção, um texto só. */
export function juntarLayout(
  conceito: string | null | undefined,
  direcao: string | null | undefined,
): string {
  return [conceito, direcao]
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
}
