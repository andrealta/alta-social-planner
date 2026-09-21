'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { botao } from '@/lib/visual'
import { apagarPlano } from './[ano]/[mes]/acoes'
import type { Exclusao } from './regra'

export type MesPlanejado = {
  id: string
  mes: number
  ano: number
  /** "Novembro de 2026" — com o "de" minúsculo. */
  nome: string
  situacao: { rotulo: string; cor: string }
  pautas: number
  /** Quantas aprovações e pedidos de alteração do cliente o mês tem. */
  decisoesCliente: number
  comCliente: boolean
  /** Se quem está olhando pode excluir este mês — e, se não, por quê. */
  exclusao: Exclusao
}

/**
 * A lista de meses já planejados, com a exclusão ao lado de cada um.
 *
 * A exclusão já existia no fim da página de cada mês; aqui ela fica
 * onde a pessoa procura — na lista. Em dois passos, como lá: o
 * primeiro clique não apaga, só mostra o que vai embora.
 *
 * Quem pode, e quando, vem pronto do servidor (`regra.ts`, espelho da
 * regra do banco na migração 0018): administração sempre; a equipe que
 * edita a marca, só até o envio ao cliente. Depois do envio, para a
 * equipe, o botão aparece apagado e diz o motivo — melhor que sumir e
 * deixar a pessoa procurando.
 */
export function MesesPlanejados({
  slug,
  meses: iniciais,
}: {
  slug: string
  meses: MesPlanejado[]
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

              {(m.exclusao.pode || m.exclusao.motivo) && confirmando !== m.id && (
                <button
                  onClick={() => {
                    setConfirmando(m.id)
                    setErro(null)
                    setFeito(null)
                  }}
                  disabled={!m.exclusao.pode}
                  title={m.exclusao.motivo ?? `Excluir o planejamento de ${m.nome.toLowerCase()}`}
                  aria-label={`Excluir o planejamento de ${m.nome.toLowerCase()}`}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 12.5,
                    padding: '6px 4px',
                    border: 'none',
                    background: 'none',
                    color: m.exclusao.pode ? 'var(--faint)' : 'var(--line-2)',
                    textDecoration: m.exclusao.pode ? 'underline' : 'none',
                    textUnderlineOffset: 3,
                    cursor: m.exclusao.pode ? 'pointer' : 'not-allowed',
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
                {m.decisoesCliente > 0 && (
                  <p style={{ fontSize: 13.3, lineHeight: 1.65, marginTop: 8 }}>
                    <b>
                      O cliente já registrou {m.decisoesCliente} decisão(ões) neste mês.
                    </b>{' '}
                    As aprovações e os pedidos de alteração saem junto — é o registro de que ele viu
                    e respondeu. Se quiser guardar uma cópia, rode o <b>17-exportar.cmd</b> antes.
                  </p>
                )}
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
