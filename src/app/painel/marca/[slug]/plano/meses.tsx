'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { botao } from '@/lib/visual'
import { apagarPlano } from './[ano]/[mes]/acoes'

export type MesPlanejado = {
  id: string
  mes: number
  ano: number
  /** "Novembro de 2026" — com o "de" minúsculo. */
  nome: string
  situacao: { rotulo: string; cor: string }
  pautas: number
  /** O cliente já aprovou ou pediu alteração em alguma peça. */
  clienteDecidiu: boolean
  comCliente: boolean
}

/**
 * A lista de meses já planejados, com a exclusão ao lado de cada um.
 *
 * A exclusão já existia no fim da página de cada mês; aqui ela fica
 * onde a pessoa procura — na lista. Em dois passos, como lá: o
 * primeiro clique não apaga, só mostra o que vai embora.
 *
 * Mês em que o cliente já decidiu alguma coisa aparece sem o botão e
 * com o motivo. O banco recusaria de qualquer jeito (gatilho
 * `plans_apagar_guard`, migração 0014); mostrar o botão para depois
 * dar erro seria convidar a pessoa a tentar.
 */
export function MesesPlanejados({
  slug,
  meses: iniciais,
  podeApagar,
}: {
  slug: string
  meses: MesPlanejado[]
  podeApagar: boolean
}) {
  const router = useRouter()
  const [meses, setMeses] = useState(iniciais)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState<{ id: string; texto: string } | null>(null)
  const [feito, setFeito] = useState<string | null>(null)

  async function apagar(m: MesPlanejado) {
    setApagando(true)
    setErro(null)
    const r = await apagarPlano(slug, m.id)
    setApagando(false)
    if (!r.ok) {
      setErro({ id: m.id, texto: r.erro ?? 'Não consegui apagar.' })
      setConfirmando(null)
      return
    }
    setMeses((lista) => lista.filter((x) => x.id !== m.id))
    setConfirmando(null)
    setFeito(`O planejamento de ${m.nome.toLowerCase()} foi apagado.`)
    router.refresh()
  }

  if (meses.length === 0) {
    return (
      <>
        {feito && <Aviso>{feito}</Aviso>}
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Nenhum ainda.</p>
      </>
    )
  }

  return (
    <>
      {feito && <Aviso>{feito}</Aviso>}
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
        }}
      >
        {meses.map((m, i) => (
          <li
            key={m.id}
            style={{ borderBottom: i === meses.length - 1 ? 'none' : '1px solid var(--line)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 0 0' }}>
              <Link
                href={`/painel/marca/${slug}/calendario/${m.ano}/${m.mes}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 6px 14px 20px',
                  textDecoration: 'none',
                  color: 'inherit',
                  minWidth: 0,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 15 }}>{m.nome}</span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 99,
                    background: 'var(--surface-3)',
                    color: `var(--${m.situacao.cor})`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.situacao.rotulo}
                </span>
              </Link>

              {podeApagar && confirmando !== m.id && (
                <button
                  onClick={() => {
                    setConfirmando(m.id)
                    setErro(null)
                    setFeito(null)
                  }}
                  disabled={m.clienteDecidiu}
                  title={
                    m.clienteDecidiu
                      ? 'O cliente já avaliou peças deste mês — o que ele decidiu é registro, e não pode ser apagado.'
                      : `Excluir o planejamento de ${m.nome.toLowerCase()}`
                  }
                  aria-label={`Excluir o planejamento de ${m.nome.toLowerCase()}`}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 12.5,
                    padding: '6px 4px',
                    border: 'none',
                    background: 'none',
                    color: m.clienteDecidiu ? 'var(--line-2)' : 'var(--faint)',
                    textDecoration: m.clienteDecidiu ? 'none' : 'underline',
                    textUnderlineOffset: 3,
                    cursor: m.clienteDecidiu ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Excluir
                </button>
              )}
            </div>

            {erro?.id === m.id && (
              <div
                role="alert"
                style={{
                  margin: '0 20px 14px',
                  padding: '11px 14px',
                  borderRadius: 'var(--r)',
                  background: 'var(--laranja-wash)',
                  fontSize: 13.3,
                  lineHeight: 1.6,
                }}
              >
                {erro.texto}
              </div>
            )}

            {confirmando === m.id && (
              <div
                style={{
                  margin: '0 20px 16px',
                  padding: '15px 17px',
                  borderRadius: 'var(--r)',
                  background: 'var(--laranja-wash)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                  Excluir o planejamento de {m.nome.toLowerCase()}?
                </div>
                <p style={{ fontSize: 13.3, lineHeight: 1.65 }}>
                  Isto apaga <b>{m.pautas} pauta(s)</b>, o conteúdo já escrito para elas e todo o
                  histórico de versões. <b>Não tem como desfazer.</b>
                  {m.comCliente &&
                    ' Este mês já foi enviado ao cliente: ele deixa de aparecer no portal dele.'}
                </p>
                <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 12 }}>
                  <button
                    onClick={() => apagar(m)}
                    disabled={apagando}
                    style={{
                      ...botao(true, apagando),
                      background: 'var(--laranja)',
                      boxShadow: 'none',
                    }}
                  >
                    {apagando ? 'Excluindo…' : 'Excluir definitivamente'}
                  </button>
                  <button
                    onClick={() => setConfirmando(null)}
                    disabled={apagando}
                    style={botao(false)}
                  >
                    Manter
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      style={{
        marginBottom: 12,
        padding: '11px 15px',
        borderRadius: 'var(--r)',
        background: 'var(--surface-2)',
        fontSize: 13.3,
      }}
    >
      {children}
    </div>
  )
}
