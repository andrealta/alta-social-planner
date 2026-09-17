'use client'

import { useState, useTransition } from 'react'
import {
  DIAS_CURTOS,
  ICONE_PECA,
  botao,
  caixaTexto,
  cartao,
  corDaLinha,
  pilula,
  ponto,
  semanasDoMes,
  tipoDaPeca,
} from '@/lib/visual'
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
  /** A posição da linha no contrato, que decide a cor dela. */
  linhaIndice: number | null
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

const SITUACAO: Record<string, { rotulo: string; curto: string; cor: string; wash: string }> = {
  sent_to_client: {
    rotulo: 'Aguardando você',
    curto: 'aguardando',
    cor: 'var(--st-cliente)',
    wash: 'var(--st-cliente-wash)',
  },
  client_changes_requested: {
    rotulo: 'Você pediu alteração',
    curto: 'pediu alteração',
    cor: 'var(--st-ajuste)',
    wash: 'var(--st-ajuste-wash)',
  },
  client_approved: {
    rotulo: 'Aprovada por você',
    curto: 'aprovada',
    cor: 'var(--st-aprovado)',
    wash: 'var(--st-aprovado-wash)',
  },
}

export function Avaliacao({
  slug,
  ano,
  mes,
  pautas: iniciais,
  cor,
}: {
  slug: string
  ano: number
  mes: number
  pautas: PautaCliente[]
  /** A cor da marca do cliente, para o mês ter a cara dele. */
  cor: string
}) {
  const [pautas, setPautas] = useState(iniciais)
  const [vista, setVista] = useState<'lista' | 'calendario'>('lista')
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
          padding: '16px 20px',
          ...cartao,
          marginBottom: 18,
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
                background: cor,
                transition: 'width .25s ease',
              }}
            />
          </div>
        </div>

        {/* Duas leituras do mesmo mês: a lista para decidir, o
            calendário para ver a distribuição. Quem avalia catorze
            peças precisa das duas — a lista responde "o que é esta
            peça", o calendário responde "como está o mês". */}
        <div
          style={{
            display: 'inline-flex',
            gap: 4,
            padding: 4,
            borderRadius: 99,
            background: 'var(--surface-2)',
          }}
        >
          {(['lista', 'calendario'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              style={{
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: vista === v ? 700 : 500,
                padding: '6px 15px',
                border: 'none',
                borderRadius: 99,
                background: vista === v ? 'var(--surface)' : 'transparent',
                boxShadow: vista === v ? '0 1px 2px rgba(29,37,48,.08)' : 'none',
                color: vista === v ? 'var(--text)' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {v === 'lista' ? 'Lista' : 'Calendário'}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <div
          style={{
            marginBottom: 16,
            padding: '13px 17px',
            borderRadius: 'var(--r)',
            background: 'var(--laranja-wash)',
            fontSize: 13.5,
          }}
        >
          {erro}
        </div>
      )}

      {vista === 'calendario' && (
        <div style={{ ...cartao, padding: '18px 20px 20px', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {DIAS_CURTOS.map((d) => (
              <div
                key={d}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--faint)',
                  textAlign: 'center',
                  paddingBottom: 2,
                }}
              >
                {d}
              </div>
            ))}

            {semanasDoMes(ano, mes)
              .flat()
              .map((dia, i) => {
                if (dia === null) return <div key={`v${i}`} />
                const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
                const doDia = pautas.filter((p) => p.data === data)
                return (
                  <div
                    key={data}
                    style={{
                      minHeight: 84,
                      padding: 8,
                      borderRadius: 'var(--r)',
                      background: 'var(--surface-2)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 600 }}>{dia}</div>
                    {doDia.map((p) => {
                      const st = SITUACAO[p.status] ?? SITUACAO.sent_to_client
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            // O calendário mostra; quem decide é a lista.
                            // Clicar aqui leva a pessoa até a peça, já aberta.
                            setVista('lista')
                            setTimeout(() => {
                              document
                                .getElementById(`pauta-${p.id}`)
                                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            }, 60)
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            marginTop: 6,
                            padding: '7px 8px',
                            border: 'none',
                            borderRadius: 8,
                            background: 'var(--surface)',
                            boxShadow: '0 1px 2px rgba(29,37,48,.06)',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 9.5,
                              color: 'var(--muted)',
                              marginBottom: 2,
                            }}
                          >
                            <span aria-hidden>{ICONE_PECA[tipoDaPeca(p.formato)]}</span>
                            {tipoDaPeca(p.formato)}
                          </div>
                          <div
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              lineHeight: 1.3,
                              color: 'var(--text)',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {p.title}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              marginTop: 4,
                              fontSize: 9.5,
                              color: 'var(--muted)',
                            }}
                          >
                            <i aria-hidden style={ponto(st.cor, 6)} />
                            {st.curto}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
              marginTop: 16,
              paddingTop: 14,
              borderTop: '1px solid var(--line)',
            }}
          >
            {Object.entries(SITUACAO)
              .filter(([st]) => pautas.some((p) => p.status === st))
              .map(([st, v]) => (
                <span key={st} style={pilula(v.wash)}>
                  <i aria-hidden style={ponto(v.cor)} />
                  {v.rotulo}
                </span>
              ))}
          </div>

          {pautas.some((p) => !p.data) && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12, lineHeight: 1.55 }}>
              {pautas.filter((p) => !p.data).length} publicação(ões) ainda sem data marcada — elas
              aparecem só na lista.
            </p>
          )}
        </div>
      )}

      {vista === 'lista' && (
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
        {pautas.map((p) => {
          const s = SITUACAO[p.status] ?? SITUACAO.sent_to_client
          const dia = p.data ? Number(p.data.slice(8, 10)) : null
          const pode = p.status === 'sent_to_client' || p.status === 'client_changes_requested'
          return (
            <li
              key={p.id}
              id={`pauta-${p.id}`}
              style={{ ...cartao, padding: '20px 22px' }}
            >
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center', minWidth: 44 }}>
                  <div style={{ fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 600, lineHeight: 1 }}>
                    {dia ?? '—'}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 6 }}>
                    {p.linha && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 99,
                          background: 'var(--surface-2)',
                          color: 'var(--muted)',
                        }}
                      >
                        <i aria-hidden style={ponto(corDaLinha(p.linhaIndice), 7)} />
                        {p.linha}
                      </span>
                    )}
                    {[p.formato, p.plataforma].filter(Boolean).map((t) => (
                      <span
                        key={String(t)}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 99,
                          background: 'var(--surface-2)',
                          color: 'var(--muted)',
                        }}
                      >
                        {String(t)}
                      </span>
                    ))}
                    <span style={{ ...pilula(s.wash), marginLeft: 'auto' }}>
                      <i aria-hidden style={ponto(s.cor)} />
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
                          padding: '13px 15px',
                          background: 'var(--surface-2)',
                          borderRadius: 'var(--r-sm)',
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
                        padding: '12px 15px',
                        background: 'var(--surface-2)',
                        borderRadius: 'var(--r-sm)',
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
                            style={caixaTexto}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 12 }}>
                        <button
                          onClick={() => responder(p, 'approved')}
                          disabled={enviando === p.id}
                          style={{
                            ...botao(true, enviando === p.id),
                            fontSize: 14,
                            padding: '11px 22px',
                            cursor: enviando === p.id ? 'progress' : 'pointer',
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
      )}
    </div>
  )
}

const botaoSecundario: React.CSSProperties = {
  ...botao(false),
  fontSize: 14,
  padding: '11px 20px',
}
