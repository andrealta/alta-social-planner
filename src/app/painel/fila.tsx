import Link from 'next/link'
import { mesTitulado } from '@/lib/prompt'
import { Icone } from '@/lib/quadro'
import type { ItemFila } from '@/lib/fila'

/**
 * A fila de trabalho na tela inicial da equipe.
 *
 * Cada item leva direto ao lugar onde a coisa se resolve: o pedido de
 * ajuste abre a própria pauta no calendário; o mês pronto e o mês em
 * revisão abrem o calendário do mês.
 *
 * Os oito primeiros ficam à vista. O resto fica num "ver mais", para a
 * fila não empurrar o resto da tela para longe num mês cheio.
 */

const VISIVEIS = 8

function haQuanto(iso: string | null): string | null {
  if (!iso) return null
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

function destino(i: ItemFila): string {
  const base = `/painel/marca/${i.marca.slug}/calendario/${i.ano}/${i.mes}`
  return i.tipo === 'ajuste' ? `${base}?pauta=${i.pautaId}` : base
}

const TIPO = {
  ajuste: { icone: 'ajuste', selo: 'pediu ajuste', cor: 'var(--laranja-tinta)', fundo: 'var(--laranja-wash)' },
  enviar: { icone: 'cliente', selo: 'pronto para enviar', cor: 'var(--accent)', fundo: 'var(--accent-wash)' },
  revisar: { icone: 'equipe', selo: 'para revisar', cor: 'var(--amarelo-tinta)', fundo: 'var(--amarelo-wash)' },
} as const

function Item({ i, ultimo }: { i: ItemFila; ultimo: boolean }) {
  const t = TIPO[i.tipo]
  const titulo =
    i.tipo === 'ajuste'
      ? i.titulo
      : i.tipo === 'enviar'
        ? 'Mês pronto para enviar ao cliente'
        : i.total === 1
          ? '1 pauta para revisar'
          : `${i.total} pautas para revisar`

  return (
    <li style={{ borderBottom: ultimo ? 'none' : '1px solid var(--line)' }}>
      <Link
        href={destino(i)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 13,
          padding: '14px 18px',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <Icone nome={t.icone} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--muted)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                flexShrink: 0,
                background: i.marca.color ?? 'var(--accent)',
              }}
            />
            {i.marca.name} · {mesTitulado(i.mes)} de {i.ano}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 2, lineHeight: 1.35 }}>{titulo}</div>

          {i.tipo === 'ajuste' && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
              {i.pedido ? (
                <span
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    color: 'var(--text)',
                  }}
                >
                  &ldquo;{i.pedido}&rdquo;
                </span>
              ) : (
                'O cliente pediu alteração sem escrever o motivo.'
              )}
              {haQuanto(i.desde) && (
                <span style={{ fontSize: 12, color: 'var(--faint)' }}>pedido {haQuanto(i.desde)}</span>
              )}
            </div>
          )}

          {i.tipo === 'enviar' && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
              {i.total === 1 ? '1 pauta aprovada' : `${i.total} pautas aprovadas`} pela equipe.
              {i.semEstrategia && (
                <span style={{ color: 'var(--amarelo-tinta)', fontWeight: 600 }}>
                  {' '}Falta escrever a estratégia do mês.
                </span>
              )}
            </div>
          )}

          {i.tipo === 'revisar' && i.emCorrecao > 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
              {i.emCorrecao === 1
                ? '1 delas está marcada para ajuste.'
                : `${i.emCorrecao} delas estão marcadas para ajuste.`}
            </div>
          )}
        </div>
        <span
          style={{
            alignSelf: 'center',
            fontSize: 11.5,
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 99,
            background: t.fundo,
            color: t.cor,
            whiteSpace: 'nowrap',
          }}
        >
          {t.selo}
        </span>
      </Link>
    </li>
  )
}

export function Fila({ itens }: { itens: ItemFila[] }) {
  const visiveis = itens.slice(0, VISIVEIS)
  const resto = itens.slice(VISIVEIS)

  const lista = (xs: ItemFila[]) => (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {xs.map((i, k) => (
        <Item
          key={i.tipo === 'ajuste' ? i.pautaId : `${i.tipo}-${i.marca.id}-${i.ano}-${i.mes}`}
          i={i}
          ultimo={k === xs.length - 1}
        />
      ))}
    </ul>
  )

  return (
    <section style={{ marginTop: 28 }}>
      <h2
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--disp)',
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: 'var(--faint)',
          marginBottom: 14,
        }}
      >
        Sua fila de trabalho
        {itens.length > 0 && (
          <span
            style={{
              fontFamily: 'var(--ui)',
              letterSpacing: 0,
              fontSize: 11.5,
              fontWeight: 700,
              padding: '1px 8px',
              borderRadius: 99,
              background: 'var(--text)',
              color: 'var(--paper)',
            }}
          >
            {itens.length}
          </span>
        )}
      </h2>

      {itens.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 18px',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            fontSize: 14,
            color: 'var(--muted)',
          }}
        >
          <Icone nome="aprovado" />
          Nada esperando pela equipe agora. A fila está limpa.
        </div>
      ) : (
        <div
          style={{
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            overflow: 'hidden',
          }}
        >
          {lista(visiveis)}
          {resto.length > 0 && (
            <details style={{ borderTop: '1px solid var(--line)' }}>
              <summary
                style={{
                  padding: '12px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  cursor: 'pointer',
                }}
              >
                Ver mais {resto.length} {resto.length === 1 ? 'item' : 'itens'}
              </summary>
              <div style={{ borderTop: '1px solid var(--line)' }}>{lista(resto)}</div>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
