'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { botao } from '@/lib/visual'
import { apagarPlano } from './acoes'

/**
 * Apagar o planejamento do mês.
 *
 * Em dois passos de propósito, e sem caixa de diálogo do navegador: a
 * confirmação diz o que exatamente vai embora e quantas peças são,
 * porque "tem certeza?" não informa nada. Quem clica sem ler clica em
 * qualquer coisa.
 *
 * Fica no fim da página, discreto. É destrutivo e irreversível — não
 * merece um botão grande no topo, ao lado dos que a pessoa usa todo dia.
 */
export function Apagar({
  slug,
  planoId,
  mes,
  ano,
  pautas,
  comCliente,
}: {
  slug: string
  planoId: string
  mes: string
  ano: number
  pautas: number
  /** O mês já foi liberado ao cliente: vale um aviso mais forte. */
  comCliente: boolean
}) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function apagar() {
    setApagando(true)
    setErro(null)
    const r = await apagarPlano(slug, planoId)
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui apagar.')
      setApagando(false)
      setConfirmando(false)
      return
    }
    router.push(`/painel/marca/${slug}/plano`)
    router.refresh()
  }

  return (
    <section
      style={{
        marginTop: 40,
        paddingTop: 22,
        borderTop: '1px solid var(--line)',
      }}
    >
      {erro && (
        <div
          role="alert"
          style={{
            marginBottom: 14,
            padding: '13px 16px',
            borderRadius: 'var(--r)',
            background: 'var(--laranja-wash)',
            fontSize: 13.3,
            lineHeight: 1.6,
          }}
        >
          {erro}
        </div>
      )}

      {!confirmando ? (
        <button
          onClick={() => {
            setConfirmando(true)
            setErro(null)
          }}
          style={{
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 0',
            border: 'none',
            background: 'none',
            color: 'var(--muted)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            cursor: 'pointer',
          }}
        >
          Apagar o planejamento de {mes} de {ano}
        </button>
      ) : (
        <div
          style={{
            padding: '16px 18px',
            borderRadius: 'var(--r)',
            background: 'var(--laranja-wash)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            Apagar o planejamento de {mes} de {ano}?
          </div>
          <p style={{ fontSize: 13.3, lineHeight: 1.65, marginBottom: 4 }}>
            Isto apaga <b>{pautas} pauta(s)</b>, o conteúdo já escrito para elas e todo o
            histórico de versões. Não tem como desfazer, e a geração de um mês novo custa
            uma chamada de IA.
          </p>
          {comCliente && (
            <p style={{ fontSize: 13.3, lineHeight: 1.65, marginBottom: 4 }}>
              <b>Atenção:</b> este mês já foi enviado ao cliente e deixa de aparecer no portal
              dele. Se ele já aprovou ou pediu alteração em alguma peça, esses registros saem
              junto. Para guardar uma cópia, rode o <b>17-exportar.cmd</b> antes.
            </p>
          )}
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 12 }}>
            <button
              onClick={apagar}
              disabled={apagando}
              style={{
                ...botao(true, apagando),
                background: 'var(--laranja)',
                boxShadow: 'none',
              }}
            >
              {apagando ? 'Apagando…' : 'Apagar de verdade'}
            </button>
            <button onClick={() => setConfirmando(false)} disabled={apagando} style={botao(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
