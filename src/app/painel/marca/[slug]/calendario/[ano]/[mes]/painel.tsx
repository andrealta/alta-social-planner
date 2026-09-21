'use client'

import { useEffect, useState } from 'react'
import { COMANDOS } from '@/lib/prompt'
import { salvarPauta } from './acoes'
import { AbaConteudo } from './conteudo'
import {
  ACOES,
  CAMPOS,
  CAMPOS_EXTRAS,
  ESTADO,
  ICONE_PECA,
  ORIGEM,
  TODOS_CAMPOS,
  botao,
  caixaTexto,
  corDaLinha,
  paraEditaveis,
  pilula,
  ponto,
  tipoDaPeca,
  type ConteudoPauta,
  type Editaveis,
  type JuizoDaPauta,
  type Pauta,
} from './comum'
import { duracao } from '@/lib/medidas'

type Aba = 'ideia' | 'conteudo' | 'versoes'

export function Painel({
  slug,
  ano,
  mes,
  pauta,
  podeEditar,
  juizo,
  aoFechar,
  aoTrocarEstado,
  aoSalvar,
  aoGerarConteudo,
}: {
  slug: string
  ano: number
  mes: number
  pauta: Pauta
  /** Falso para quem só lê: os campos ficam travados e a IA some. */
  podeEditar: boolean
  /** O que o crítico achou desta pauta, se o mês já foi avaliado. */
  juizo: JuizoDaPauta | null
  aoFechar: () => void
  aoTrocarEstado: (para: string) => void
  aoSalvar: (campos: Editaveis, versao: number) => void
  aoGerarConteudo: (c: ConteudoPauta) => void
}) {
  const [aba, setAba] = useState<Aba>('ideia')
  const [campos, setCampos] = useState<Editaveis>(() => paraEditaveis(pauta))
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pedido, setPedido] = useState('')
  const [refinando, setRefinando] = useState<string | null>(null)
  const [segundos, setSegundos] = useState(0)
  const [mudou, setMudou] = useState<string | null>(null)
  const [versaoAtual, setVersaoAtual] = useState(pauta.current_version)
  const [verExtras, setVerExtras] = useState(false)

  const original = paraEditaveis(pauta)
  const sujo = TODOS_CAMPOS.some((c) => campos[c.id] !== original[c.id])
  const e = ESTADO[pauta.status] ?? ESTADO.ai_generated
  const acoes = ACOES[pauta.status] ?? []

  useEffect(() => {
    if (!refinando) return
    setSegundos(0)
    const t = setInterval(() => setSegundos((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [refinando])

  async function gravar() {
    setSalvando(true)
    setErro(null)
    const r = await salvarPauta(slug, pauta.id, campos, motivo, ano, mes)
    setSalvando(false)
    if (r.ok) {
      setVersaoAtual(r.versao ?? versaoAtual)
      aoSalvar(campos, r.versao ?? pauta.current_version)
      setMotivo('')
    } else {
      setErro(r.erro ?? 'Não consegui salvar.')
    }
  }

  async function refinar(comando: string) {
    if (refinando) return
    if (sujo) {
      setErro(
        'Você tem alterações não salvas. Salve ou descarte antes de pedir à IA, senão uma coisa sobrescreve a outra.',
      )
      return
    }
    setRefinando(comando)
    setErro(null)
    setMudou(null)
    try {
      const r = await fetch('/api/refinar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ideaId: pauta.id, comando }),
      })
      const corpo = await r.json()
      if (!r.ok || corpo.erro) {
        setErro(corpo.erro ?? 'A IA não conseguiu refinar.')
        return
      }
      const novos: Editaveis = {
        title: corpo.pauta.title ?? '',
        theme: corpo.pauta.theme ?? '',
        concept: corpo.pauta.concept ?? '',
        description: corpo.pauta.description ?? '',
        editorial_line: corpo.pauta.editorial_line ?? '',
        objective: campos.objective,
        rationale: corpo.pauta.rationale ?? '',
        cta: corpo.pauta.cta ?? '',
      }
      setCampos(novos)
      setVersaoAtual(Number(corpo.versao))
      setMudou(corpo.oQueMudou || 'A IA reescreveu a pauta.')
      setPedido('')
      aoSalvar(novos, Number(corpo.versao))
    } catch {
      setErro('A conexão caiu durante o refino. Tente de novo.')
    } finally {
      setRefinando(null)
    }
  }

  const abas: { id: Aba; rotulo: string; marca?: boolean }[] = [
    { id: 'ideia', rotulo: 'Ideia' },
    { id: 'conteudo', rotulo: 'Conteúdo', marca: !!pauta.conteudo },
    { id: 'versoes', rotulo: `Versões${pauta.historico.length ? ` (${pauta.historico.length})` : ''}` },
  ]

  return (
    <>
      <div
        onClick={aoFechar}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.34)', zIndex: 30 }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(620px, 100vw)',
          zIndex: 31,
          background: 'var(--surface)',
          overflowY: 'auto',
          padding: '24px 26px 44px',
          boxShadow: '-10px 0 40px -18px rgba(29,37,48,.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={pilula(e.wash)}>
            <i aria-hidden style={ponto(e.cor)} />
            {e.rotulo}
          </span>
          <span style={{ fontSize: 12, color: 'var(--faint)' }}>versão {versaoAtual}</span>
          <button
            onClick={aoFechar}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: 'var(--muted)',
            }}
            aria-label="fechar"
          >
            ×
          </button>
        </div>

        <h3 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>
          {campos.title}
        </h3>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          {pauta.linha && (
            <span style={etiqueta}>
              <i aria-hidden style={ponto(corDaLinha(pauta.linhaIndice), 7)} />
              {pauta.linha}
            </span>
          )}
          <span style={etiqueta}>
            <span aria-hidden>{ICONE_PECA[tipoDaPeca(pauta.formato)]}</span>
            {tipoDaPeca(pauta.formato)}
            {pauta.formato && tipoDaPeca(pauta.formato).toLowerCase() !== pauta.formato.toLowerCase()
              ? ` · ${pauta.formato}`
              : ''}
          </span>
          {pauta.plataforma && <span style={etiqueta}>{rede(pauta.plataforma)}</span>}
          {campos.objective && <span style={etiqueta}>{campos.objective}</span>}
          {pauta.data && <span style={etiqueta}>{dataCurta(pauta.data)}</span>}
        </div>

        <div
          style={{
            display: 'inline-flex',
            gap: 4,
            padding: 4,
            borderRadius: 99,
            background: 'var(--surface-2)',
            marginBottom: 20,
          }}
        >
          {abas.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              style={{
                fontFamily: 'inherit',
                fontSize: 13.5,
                fontWeight: aba === a.id ? 700 : 500,
                padding: '6px 14px',
                border: 'none',
                borderRadius: 99,
                background: aba === a.id ? 'var(--surface)' : 'transparent',
                boxShadow: aba === a.id ? '0 1px 2px rgba(29,37,48,.08)' : 'none',
                color: aba === a.id ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {a.rotulo}
              {a.marca && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--ok)',
                    marginLeft: 5,
                    verticalAlign: 'middle',
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {erro && (
          <div
            style={{
              margin: '0 0 14px',
              padding: '12px 15px',
              borderRadius: 'var(--r)',
              background: 'var(--laranja-wash)',
              color: 'var(--text)',
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            {erro}
          </div>
        )}

        {aba === 'ideia' && (
          <>
            {juizo && juizo.veredito !== 'boa' && (
              <section
                style={{
                  marginBottom: 14,
                  padding: '13px 16px',
                  borderRadius: 'var(--r)',
                  background:
                    juizo.veredito === 'fraca' ? 'var(--laranja-wash)' : 'var(--amarelo-wash)',
                  fontSize: 13.3,
                  lineHeight: 1.6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: 5,
                  }}
                >
                  <b>
                    A IA avaliou esta pauta: {juizo.veredito === 'fraca' ? 'fraca' : 'dá para melhorar'}{' '}
                    ({juizo.nota}/10)
                  </b>
                  {juizo.vencida && (
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      — avaliação feita numa versão anterior desta pauta
                    </span>
                  )}
                </div>
                {juizo.porque && <div>{juizo.porque}</div>}
                {juizo.arrume && (
                  <div style={{ marginTop: 6 }}>
                    <b>O que fazer:</b> {juizo.arrume}
                  </div>
                )}
              </section>
            )}

            {juizo && juizo.veredito === 'boa' && (
              <section
                style={{
                  marginBottom: 14,
                  padding: '11px 15px',
                  borderRadius: 'var(--r)',
                  background: 'var(--surface-2)',
                  fontSize: 12.8,
                  color: 'var(--muted)',
                  lineHeight: 1.6,
                }}
              >
                A IA avaliou esta pauta como <b style={{ color: 'var(--text)' }}>boa</b> ({juizo.nota}/10)
                {juizo.porque ? `: ${juizo.porque}` : '.'}
              </section>
            )}

            {pauta.decisoes.length > 0 && (
              <section
                style={{
                  marginBottom: 14,
                  padding: '13px 16px',
                  borderRadius: 'var(--r)',
                  background: 'var(--surface-2)',
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--faint)',
                    marginBottom: 7,
                  }}
                >
                  Quem avaliou
                </div>
                {pauta.decisoes.map((d) => {
                  const aprovou = d.decisao === 'approved'
                  return (
                    <div
                      key={d.id}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 8,
                        flexWrap: 'wrap',
                        fontSize: 13,
                        padding: '3px 0',
                      }}
                    >
                      <span
                        style={{
                          color: aprovou ? 'var(--st-aprovado)' : 'var(--st-ajuste)',
                          fontWeight: 700,
                        }}
                      >
                        {aprovou ? '✓ aprovou' : '! pediu alteração'}
                      </span>
                      <b>{d.autor ?? d.email ?? 'alguém do cliente'}</b>
                      <span style={{ color: 'var(--faint)', fontSize: 11.5 }}>
                        {d.lado === 'client' ? 'cliente' : 'equipe'} · versão {d.version} ·{' '}
                        {new Date(d.created_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {d.lado === 'client' &&
                          duracao(d.segundos) &&
                          ` · respondeu em ${duracao(d.segundos)}`}
                      </span>
                    </div>
                  )
                })}
              </section>
            )}

            {pauta.recados.length > 0 && (
              <section
                style={{
                  marginBottom: 18,
                  padding: '14px 17px',
                  borderRadius: 'var(--r)',
                  background: 'var(--laranja-wash)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 7 }}>
                  O que o cliente escreveu
                </div>
                {pauta.recados.map((r) => (
                  <div key={r.id} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 13.3, lineHeight: 1.6 }}>{r.body}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                      {r.autor ?? 'cliente'} ·{' '}
                      {new Date(r.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                ))}
                {pauta.status === 'client_changes_requested' && (
                  <p style={{ fontSize: 12.3, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                    Ajuste, aprove de novo e use &ldquo;Enviar ao cliente&rdquo; no calendário
                    para devolver.
                  </p>
                )}
              </section>
            )}

            {CAMPOS.map((c) => (
              <div key={c.id} style={{ marginBottom: 14 }}>
                <label
                  htmlFor={`p-${c.id}`}
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: 12.5,
                    color: 'var(--muted)',
                    marginBottom: 5,
                  }}
                >
                  {c.rotulo}
                </label>
                <textarea
                  id={`p-${c.id}`}
                  rows={c.linhas}
                  value={campos[c.id]}
                  readOnly={!podeEditar}
                  onChange={(ev) => setCampos((a) => ({ ...a, [c.id]: ev.target.value }))}
                  style={podeEditar ? caixaTexto : soLeitura}
                />
              </div>
            ))}

            {podeEditar && <section
              style={{
                margin: '20px 0',
                padding: '15px 17px',
                borderRadius: 'var(--r)',
                background: 'var(--surface-2)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>Alterar IA</div>
              <p style={{ color: 'var(--muted)', fontSize: 12.3, marginBottom: 9, lineHeight: 1.5 }}>
                Ela reescreve só o que você pedir e mantém o resto. A versão atual vai para o
                histórico marcada como feita pela IA. Leva de um a três minutos.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {COMANDOS.map((c) => (
                  <button
                    key={c}
                    onClick={() => refinar(c)}
                    disabled={!!refinando || salvando}
                    style={{
                      fontFamily: 'inherit',
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '6px 12px',
                      border: 'none',
                      borderRadius: 99,
                      background: refinando === c ? 'var(--accent)' : 'var(--surface)',
                      color: refinando === c ? '#fff' : 'var(--text)',
                      boxShadow: refinando === c ? 'none' : '0 1px 2px rgba(29,37,48,.07)',
                      cursor: refinando ? 'not-allowed' : 'pointer',
                      opacity: refinando && refinando !== c ? 0.45 : 1,
                    }}
                  >
                    {refinando === c ? `${c} · ${segundos}s` : c}
                  </button>
                ))}
              </div>

              <textarea
                rows={2}
                value={pedido}
                onChange={(ev) => setPedido(ev.target.value)}
                disabled={!!refinando}
                placeholder="Ou explique com suas palavras: mantenha a ideia mas troque o produto e deixe o CTA menos vendedor."
                style={{ ...caixaTexto, fontSize: 13 }}
              />
              <button
                onClick={() => refinar(pedido.trim())}
                disabled={pedido.trim().length < 3 || !!refinando}
                style={{
                  ...botao(false, pedido.trim().length < 3 || !!refinando),
                  marginTop: 8,
                  width: '100%',
                  color: 'var(--accent)',
                }}
              >
                {refinando && !COMANDOS.includes(refinando)
                  ? `Pedindo à IA… ${segundos}s`
                  : 'Enviar à IA'}
              </button>

              {mudou && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '11px 14px',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--ok-wash)',
                    fontSize: 12.8,
                    lineHeight: 1.55,
                  }}
                >
                  <b>O que a IA mudou:</b> {mudou}
                </div>
              )}
            </section>}

            <button
              onClick={() => setVerExtras((v) => !v)}
              style={{
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 600,
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: '4px 0',
                marginBottom: verExtras ? 10 : 0,
              }}
            >
              {verExtras ? '▾' : '▸'} Tema, objetivo e justificativa
            </button>

            {verExtras && (
              <>
                <p style={{ color: 'var(--faint)', fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
                  Ficam recolhidos por serem de bastidor, mas o sistema usa os três: o tema
                  alimenta a regra que impede repetir o mesmo assunto três meses seguidos.
                </p>
                {CAMPOS_EXTRAS.map((c) => (
                  <div key={c.id} style={{ marginBottom: 14 }}>
                    <label
                      htmlFor={`p-${c.id}`}
                      style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 4 }}
                    >
                      {c.rotulo}
                    </label>
                    <textarea
                      id={`p-${c.id}`}
                      rows={c.linhas}
                      value={campos[c.id]}
                      readOnly={!podeEditar}
                      onChange={(ev) => setCampos((a) => ({ ...a, [c.id]: ev.target.value }))}
                      style={podeEditar ? caixaTexto : soLeitura}
                    />
                  </div>
                ))}
              </>
            )}

            {sujo && (
              <div style={{ margin: '14px 0' }}>
                <label
                  htmlFor="motivo"
                  style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 2 }}
                >
                  Por que mudou?
                </label>
                <p style={{ color: 'var(--muted)', fontSize: 12.3, marginBottom: 5, lineHeight: 1.5 }}>
                  Fica guardado junto com a versão anterior. Daqui a três meses, é isto que
                  explica a decisão.
                </p>
                <input
                  id="motivo"
                  value={motivo}
                  onChange={(ev) => setMotivo(ev.target.value)}
                  placeholder="Opcional, mas vale a pena."
                  style={{ ...caixaTexto, resize: 'none' }}
                />
              </div>
            )}

            {podeEditar && <div
              style={{
                display: 'flex',
                gap: 9,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginTop: 18,
                paddingTop: 14,
                borderTop: '1px solid var(--line)',
              }}
            >
              {sujo && (
                <button onClick={gravar} disabled={salvando} style={botao(true, salvando)}>
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
              )}
              {acoes.map((a) => (
                <button
                  key={a.para}
                  onClick={() => {
                    aoTrocarEstado(a.para)
                    aoFechar()
                  }}
                  disabled={sujo}
                  title={sujo ? 'Salve as alterações antes.' : undefined}
                  style={a.forte && !sujo ? botao(true) : botao(false, sujo)}
                >
                  {a.texto}
                </button>
              ))}
              {sujo && (
                <span style={{ fontSize: 12.3, color: 'var(--muted)' }}>
                  Salve antes de aprovar.
                </span>
              )}
            </div>}

            {!podeEditar && (
              <p
                style={{
                  marginTop: 18,
                  paddingTop: 14,
                  borderTop: '1px solid var(--line)',
                  fontSize: 12.8,
                  lineHeight: 1.6,
                  color: 'var(--muted)',
                }}
              >
                Você tem acesso de leitura nesta marca. Os campos acima estão travados, e
                aprovar ou pedir à IA são de quem edita.
              </p>
            )}
          </>
        )}

        {aba === 'conteudo' && (
          <AbaConteudo
            pauta={pauta}
            conteudo={pauta.conteudo}
            podeEditar={podeEditar}
            aoGerar={aoGerarConteudo}
          />
        )}

        {aba === 'versoes' && (
          <div>
            {pauta.historico.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>
                Nenhuma versão anterior. Esta pauta está como a IA escreveu, sem nenhuma
                alteração desde então.
              </p>
            ) : (
              <>
                <p style={{ color: 'var(--muted)', fontSize: 12.8, marginBottom: 14, lineHeight: 1.55 }}>
                  Cada linha é o texto que foi substituído, guardado do jeito que estava. O
                  histórico não pode ser reescrito — nem por mim.
                </p>
                <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {[...pauta.historico]
                    .sort((a, b) => b.version - a.version)
                    .map((v) => (
                      <li
                        key={v.version}
                        style={{
                          padding: '12px 0',
                          borderTop: '1px solid var(--line)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 8,
                            flexWrap: 'wrap',
                            marginBottom: 3,
                          }}
                        >
                          <b style={{ fontSize: 13 }}>versão {v.version}</b>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              letterSpacing: '.08em',
                              textTransform: 'uppercase',
                              color: v.trigger === 'ai' ? 'var(--accent)' : 'var(--muted)',
                            }}
                          >
                            {ORIGEM[v.trigger] ?? v.trigger}
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--faint)', marginLeft: 'auto' }}>
                            {new Date(v.created_at).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {v.titulo && (
                          <div style={{ fontSize: 13.3, lineHeight: 1.5 }}>{v.titulo}</div>
                        )}
                        {v.reason && (
                          <div
                            style={{
                              fontSize: 12.5,
                              color: 'var(--muted)',
                              marginTop: 4,
                              lineHeight: 1.5,
                            }}
                          >
                            {v.reason}
                          </div>
                        )}
                      </li>
                    ))}
                </ol>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  )
}

/** Campo que se lê mas não se muda: sem moldura de edição, sem cursor de texto. */
const soLeitura: React.CSSProperties = {
  ...caixaTexto,
  background: 'var(--surface-2)',
  color: 'var(--muted)',
  cursor: 'default',
}

const etiqueta: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  fontWeight: 600,
  padding: '4px 11px',
  borderRadius: 99,
  border: 'none',
  background: 'var(--surface-2)',
  color: 'var(--muted)',
}

const REDES: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
}

function rede(p: string) {
  return REDES[p] ?? p
}

function dataCurta(d: string) {
  const [ano, mes, dia] = d.split('-')
  return `${dia}/${mes}/${ano}`
}
