'use client'

import { useState, useTransition } from 'react'
import { decidir } from './acoes'

export type PautaCliente = {
  id: string
  title: string
  concept: string | null
  description: string | null
  editorial_line: string | null
  cta: string | null
  status: string
  linha: string | null
  formato: string | null
  plataforma: string | null
  data: string | null
  caption: string | null
  hashtags: string[]
  art_concept: string | null
  cenas: { t?: string; descricao?: string; chave?: boolean }[]
  recados: { id: string; body: string; created_at: string; meu: boolean; autor: string | null }[]
  decisoes: { id: string; decisao: string; autor: string | null; created_at: string }[]
}

const SITUACAO: Record<string, { rotulo: string; cor: string; simbolo: string }> = {
  sent_to_client: { rotulo: 'Aguardando você', cor: 'var(--st-cliente)', simbolo: '○' },
  client_changes_requested: { rotulo: 'Você pediu alteração', cor: 'var(--st-ajuste)', simbolo: '!' },
  client_approved: { rotulo: 'Aprovada por você', cor: 'var(--st-aprovado)', simbolo: '✓' },
}

export function Avaliacao({
  slug,
  ano,
  mes,
  pautas: iniciais,
}: {
  slug: string
  ano: number
  mes: number
  pautas: PautaCliente[]
}) {
  const [pautas, setPautas] = useState(iniciais)
  const [aberta, setAberta] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [, comecar] = useTransition()

  const pendentes = pautas.filter((p) => p.status === 'sent_to_client').length
  const aprovadas = pautas.filter((p) => p.status === 'client_approved').length

  async function responder(p: PautaCliente, decisao: 'approved' | 'changes_requested') {
    if (enviando) return
    setErro(null)

    if (decisao === 'changes_requested' && texto.trim() === '') {
      setAberta(p.id)
      setErro('Escreva o que você gostaria de mudar — é isso que a equipe vai ler.')
      return
    }

    setEnviando(p.id)
    const comentario = aberta === p.id ? texto : ''
    const r = await decidir(slug, ano, mes, p.id, decisao, comentario)
    setEnviando(null)

    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui registrar.')
      return
    }

    setPautas((lista) =>
      lista.map((x) =>
        x.id === p.id
          ? {
              ...x,
              status: decisao === 'approved' ? 'client_approved' : 'client_changes_requested',
              recados:
                comentario.trim() === ''
                  ? x.recados
                  : [
                      {
                        id: 'novo-' + Date.now(),
                        body: comentario.trim(),
                        created_at: new Date().toISOString(),
                        meu: true,
                        autor: null,
                      },
                      ...x.recados,
                    ],
            }
          : x,
      ),
    )
    setAberta(null)
    setTexto('')
    comecar(() => {})
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          padding: '14px 18px',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow)',
          marginBottom: 20,
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            <b>
              {aprovadas} de {pautas.length} aprovadas
            </b>
            {pendentes > 0 && (
              <span style={{ color: 'var(--muted)' }}> · {pendentes} aguardando você</span>
            )}
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${pautas.length ? (aprovadas / pautas.length) * 100 : 0}%`,
                height: '100%',
                background: 'var(--st-aprovado)',
                transition: 'width .25s ease',
              }}
            />
          </div>
        </div>
      </div>

      {erro && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--st-ajuste)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--accent-wash)',
            fontSize: 13.5,
          }}
        >
          {erro}
        </div>
      )}

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
        {pautas.map((p) => {
          const s = SITUACAO[p.status] ?? SITUACAO.sent_to_client
          const dia = p.data ? Number(p.data.slice(8, 10)) : null
          const pode = p.status === 'sent_to_client' || p.status === 'client_changes_requested'
          return (
            <li
              key={p.id}
              style={{
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-lg)',
                background: 'var(--surface)',
                boxShadow: 'var(--shadow)',
                padding: '18px 20px',
              }}
            >
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center', minWidth: 44 }}>
                  <div style={{ fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 600, lineHeight: 1 }}>
                    {dia ?? '—'}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 6 }}>
                    {[p.linha, p.formato, p.plataforma].filter(Boolean).map((t) => (
                      <span
                        key={String(t)}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 9px',
                          borderRadius: 99,
                          background: 'var(--surface-3)',
                          color: 'var(--muted)',
                        }}
                      >
                        {String(t)}
                      </span>
                    ))}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 9px',
                        borderRadius: 99,
                        border: `1px solid ${s.cor}`,
                        background: `color-mix(in srgb, ${s.cor} 14%, transparent)`,
                        color: s.cor,
                        marginLeft: 'auto',
                      }}
                    >
                      <span aria-hidden>{s.simbolo}</span>
                      {s.rotulo}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>{p.title}</h3>

                  {p.concept && (
                    <p style={{ fontSize: 14, marginTop: 5, lineHeight: 1.6 }}>{p.concept}</p>
                  )}
                  {p.description && (
                    <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 7, lineHeight: 1.6 }}>
                      {p.description}
                    </p>
                  )}

                  {p.caption && (
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: '.12em',
                          textTransform: 'uppercase',
                          color: 'var(--faint)',
                          marginBottom: 5,
                        }}
                      >
                        Legenda
                      </div>
                      <div
                        style={{
                          whiteSpace: 'pre-wrap',
                          fontSize: 13.8,
                          lineHeight: 1.65,
                          padding: '12px 14px',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--line)',
                          borderRadius: 8,
                        }}
                      >
                        {p.caption}
                      </div>
                      {p.hashtags.length > 0 && (
                        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>
                          {p.hashtags.join(' ')}
                        </div>
                      )}
                    </div>
                  )}

                  {p.cenas.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: '.12em',
                          textTransform: 'uppercase',
                          color: 'var(--faint)',
                          marginBottom: 5,
                        }}
                      >
                        Cenas
                      </div>
                      {p.cenas.map((c, i) => (
                        <div key={i} style={{ fontSize: 13, lineHeight: 1.6, display: 'flex', gap: 10 }}>
                          <span style={{ color: 'var(--faint)', minWidth: 52, fontWeight: 600 }}>{c.t}</span>
                          <span>{c.descricao}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {p.decisoes.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)' }}>
                      {p.decisoes.map((d) => (
                        <div key={d.id}>
                          <b
                            style={{
                              color:
                                d.decisao === 'approved' ? 'var(--st-aprovado)' : 'var(--st-ajuste)',
                            }}
                          >
                            {d.decisao === 'approved' ? '✓ aprovada' : '! alteração pedida'}
                          </b>{' '}
                          por {d.autor ?? 'alguém da sua equipe'} em{' '}
                          {new Date(d.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      ))}
                    </div>
                  )}

                  {p.recados.length > 0 && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '11px 14px',
                        borderLeft: '3px solid var(--line-2)',
                        background: 'var(--surface-2)',
                        borderRadius: '0 8px 8px 0',
                      }}
                    >
                      {p.recados.map((r) => (
                        <div key={r.id} style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 13, lineHeight: 1.55 }}>{r.body}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 2 }}>
                            {r.meu ? 'você' : (r.autor ?? 'sua equipe')} ·{' '}
                            {new Date(r.created_at).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {pode && (
                    <>
                      {aberta === p.id && (
                        <div style={{ marginTop: 12 }}>
                          <label
                            htmlFor={`c-${p.id}`}
                            style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 4 }}
                          >
                            O que você gostaria de mudar?
                          </label>
                          <textarea
                            id={`c-${p.id}`}
                            rows={3}
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            autoFocus
                            placeholder="Quanto mais específico, menos idas e vindas."
                            style={{
                              width: '100%',
                              resize: 'vertical',
                              padding: '10px 12px',
                              fontFamily: 'inherit',
                              fontSize: 13.5,
                              lineHeight: 1.55,
                              color: 'var(--text)',
                              background: 'var(--surface)',
                              border: '1px solid var(--line-2)',
                              borderRadius: 8,
                              outline: 'none',
                            }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 12 }}>
                        <button
                          onClick={() => responder(p, 'approved')}
                          disabled={enviando === p.id}
                          style={{
                            fontFamily: 'inherit',
                            fontSize: 14,
                            fontWeight: 700,
                            padding: '10px 20px',
                            border: 'none',
                            borderRadius: 8,
                            background: 'var(--st-aprovado)',
                            color: '#fff',
                            cursor: enviando === p.id ? 'progress' : 'pointer',
                            opacity: enviando === p.id ? 0.6 : 1,
                          }}
                        >
                          {enviando === p.id ? 'Registrando…' : 'Aprovar'}
                        </button>

                        {aberta === p.id ? (
                          <>
                            <button
                              onClick={() => responder(p, 'changes_requested')}
                              disabled={enviando === p.id}
                              style={botaoSecundario}
                            >
                              Enviar o pedido
                            </button>
                            <button
                              onClick={() => {
                                setAberta(null)
                                setTexto('')
                                setErro(null)
                              }}
                              style={{ ...botaoSecundario, border: 'none', color: 'var(--muted)' }}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setAberta(p.id)
                              setTexto('')
                              setErro(null)
                            }}
                            style={botaoSecundario}
                          >
                            Pedir alteração
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const botaoSecundario: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  padding: '10px 18px',
  border: '1px solid var(--line-2)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text)',
  cursor: 'pointer',
}
