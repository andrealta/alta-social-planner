/**
 * O selo da marca: a cor dela e a primeira letra do nome.
 *
 * POR QUE LETRA, E NÃO ÍCONE
 *
 * Ícone de marca seria um campo novo, um arquivo por conta e
 * alguém para escolher. A letra sobre a cor já identifica: numa
 * lista de oito contas, a bolinha marrom com C é Canto de Minas
 * antes de o olho chegar no nome. E a cor já existe, é a mesma que
 * o cliente vê no portal dele, então o selo não inventa informação
 * nova: mostra a que já estava guardada e não aparecia.
 *
 * Isto morava dentro da tela do painel. Virou arquivo próprio
 * quando a tela de marcas e o topo da marca passaram a precisar da
 * MESMA bolinha: duas cópias da mesma coisa divergem na terceira
 * vez que alguém mexe numa delas.
 */

const TAMANHOS = {
  p: { caixa: 28, letra: 12, raio: 9 },
  m: { caixa: 40, letra: 16, raio: 99 },
  g: { caixa: 52, letra: 21, raio: 14 },
} as const

export type TamanhoDoSelo = keyof typeof TAMANHOS

export function Inicial({
  nome,
  cor,
  tamanho = 'm',
}: {
  nome: string
  cor: string | null
  tamanho?: TamanhoDoSelo
}) {
  const t = TAMANHOS[tamanho]
  return (
    <div
      aria-hidden
      style={{
        width: t.caixa,
        height: t.caixa,
        flexShrink: 0,
        borderRadius: t.raio,
        background: cor ?? 'var(--accent)',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--disp)',
        fontWeight: 600,
        fontSize: t.letra,
        lineHeight: 1,
      }}
    >
      {nome.trim().charAt(0).toUpperCase()}
    </div>
  )
}

/**
 * A mesma cor, em fio.
 *
 * Serve para a lateral de um cartão. É mais discreto que o selo e
 * funciona junto com ele: o fio dá a cor ao cartão inteiro sem
 * repetir a bolinha.
 */
export function FioDaMarca({ cor }: { cor: string | null }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        background: cor ?? 'var(--line-2)',
      }}
    />
  )
}
