import type { ReactNode } from 'react'

/**
 * O quadro de números com ícone: o "Status geral" do cliente, o da
 * equipe, o de cada marca e o da página Precisão usam o mesmo desenho.
 *
 * O ícone só ajuda o olho a achar cada número; quem diz o que o número
 * é continua sendo o rótulo. As cores repetem as que o portal já usa:
 * verde é aprovado, laranja é ajuste, amarelo é o que ainda está com a
 * equipe, azul é da Alta. Desenho em linha, sem biblioteca, para não
 * pesar a página.
 *
 * Sem 'use client': serve tanto para página do servidor quanto para
 * componente do navegador.
 */

export type NomeIcone =
  | 'calendario'
  | 'conteudo'
  | 'aprovado'
  | 'primeira'
  | 'ajuste'
  | 'tempo'
  | 'marca'
  | 'equipe'
  | 'cliente'
  | 'editado'
  | 'refino'
  | 'custo'
  | 'alvo'

type Tom = { cor: string; fundo: string }
const AZUL: Tom = { cor: 'var(--accent)', fundo: 'var(--accent-wash)' }
const VERDE: Tom = { cor: 'var(--ok)', fundo: 'var(--ok-wash)' }
const AMARELO: Tom = { cor: 'var(--amarelo-tinta)', fundo: 'var(--amarelo-wash)' }
const LARANJA: Tom = { cor: 'var(--laranja)', fundo: 'var(--laranja-wash)' }
const TURQUESA: Tom = {
  cor: 'var(--linha-1)',
  fundo: 'color-mix(in srgb, var(--linha-1) 12%, transparent)',
}
const ROXO: Tom = {
  cor: 'var(--linha-4)',
  fundo: 'color-mix(in srgb, var(--linha-4) 12%, transparent)',
}
const CINZA: Tom = { cor: 'var(--muted)', fundo: 'var(--surface-3)' }

const ICONES: Record<NomeIcone, Tom & { desenho: ReactNode }> = {
  calendario: {
    ...AZUL,
    desenho: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      </>
    ),
  },
  conteudo: {
    ...TURQUESA,
    desenho: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
        <circle cx="9" cy="9" r="1.8" />
        <path d="M20.5 15l-4.5-4.5L6 20.5" />
      </>
    ),
  },
  aprovado: {
    ...VERDE,
    desenho: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.3l2.7 2.7L16.2 9.5" />
      </>
    ),
  },
  primeira: {
    ...AMARELO,
    desenho: <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />,
  },
  ajuste: {
    ...LARANJA,
    desenho: (
      <>
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
      </>
    ),
  },
  tempo: {
    ...AZUL,
    desenho: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.2 2" />
      </>
    ),
  },
  marca: {
    ...ROXO,
    desenho: (
      <>
        <path d="M3 12V4.5A1.5 1.5 0 014.5 3H12l9 9-9 9z" />
        <circle cx="7.8" cy="7.8" r="1.4" />
      </>
    ),
  },
  equipe: {
    ...AMARELO,
    desenho: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
        <path d="M16 4.8a3.2 3.2 0 010 6.4M18 14.8c1.8.7 3 2.5 3 5.2" />
      </>
    ),
  },
  cliente: {
    ...AZUL,
    desenho: (
      <>
        <path d="M21 3L10 14" />
        <path d="M21 3l-6.5 18-4.5-7-7-4.5z" />
      </>
    ),
  },
  editado: {
    ...CINZA,
    desenho: (
      <>
        <path d="M4 20h4L19 9l-4-4L4 16z" />
        <path d="M13.5 6.5l4 4" />
      </>
    ),
  },
  refino: {
    ...ROXO,
    desenho: (
      <>
        <path d="M11 3l1.8 4.7L17.5 9.5l-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z" />
        <path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
      </>
    ),
  },
  custo: {
    ...VERDE,
    desenho: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M14.8 9.2c-.5-1-1.6-1.6-2.8-1.6-1.6 0-2.8.9-2.8 2.1 0 2.9 5.8 1.6 5.8 4.6 0 1.2-1.3 2.1-3 2.1-1.3 0-2.5-.6-3-1.6M12 6v1.6M12 16.4V18" />
      </>
    ),
  },
  alvo: {
    ...AZUL,
    desenho: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.2" />
      </>
    ),
  },
}

export function Icone({ nome, tamanho = 34 }: { nome: NomeIcone; tamanho?: number }) {
  const i = ICONES[nome]
  return (
    <div
      aria-hidden
      style={{
        width: tamanho,
        height: tamanho,
        flexShrink: 0,
        borderRadius: Math.round(tamanho * 0.3),
        background: i.fundo,
        color: i.cor,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <svg
        width={Math.round(tamanho * 0.53)}
        height={Math.round(tamanho * 0.53)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {i.desenho}
      </svg>
    </div>
  )
}

export type Numero = {
  valor: string
  rotulo: string
  nota?: string
  icone: NomeIcone
  /** Número que pede atenção (ajuste por fazer, por exemplo) fica na cor do ícone. */
  destaque?: boolean
}

export function Quadro({
  titulo,
  numeros,
  children,
  minimo = 120,
  marginTop = 22,
}: {
  titulo: string
  numeros: Numero[]
  children?: ReactNode
  /** Largura mínima de cada número. 120px dá duas colunas no celular. */
  minimo?: number
  marginTop?: number
}) {
  return (
    <div
      style={{
        marginTop,
        padding: '20px 22px',
        borderRadius: 'var(--r-lg)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--disp)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: 'var(--faint)',
          marginBottom: 14,
        }}
      >
        {titulo}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${minimo}px, 1fr))`,
          gap: '18px 20px',
        }}
      >
        {numeros.map((n) => (
          <div key={n.rotulo}>
            <div style={{ marginBottom: 10 }}>
              <Icone nome={n.icone} />
            </div>
            <div
              style={{
                fontFamily: 'var(--disp)',
                fontSize: 26,
                fontWeight: 600,
                lineHeight: 1.1,
                letterSpacing: '-.02em',
                color: n.destaque ? ICONES[n.icone].cor : 'var(--text)',
              }}
            >
              {n.valor}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{n.rotulo}</div>
            {n.nota && (
              <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 1 }}>{n.nota}</div>
            )}
          </div>
        ))}
      </div>

      {children}
    </div>
  )
}
