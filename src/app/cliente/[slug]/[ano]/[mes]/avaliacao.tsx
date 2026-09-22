'use client'

import { useEffect, useState } from 'react'
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
import { duracao } from '@/lib/medidas'

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
  decisoes: {
    id: string
    decisao: string
    autor: string | null
    created_at: string
    /** Foi quem está olhando a tela que decidiu. */
    meu: boolean
    /** Quanto tempo depois do envio a decisão veio. Nulo: não medido. */
    segundos: number | null
  }[]
  /** Quando a publicação chegou ao cliente pela última vez. */
  enviadaEm: string | null
  /** As imagens do layout, em ordem. A primeira é a capa. */
  layouts: { url: string; largura: number | null; altura: number | null }[]
}

const SITUACAO: Record<string, { rotulo: string; curto: string; cor: string; wash: string }> = {
  sent_to_client: {
    rotulo: 'Aguardando você',
    curto: 'aguardando',
    cor: 'var(--st-cliente)',
    wash: 'var(--st-cliente-wash)',
  },
  client_changes_requested: {
    rotulo: 'Alteração pedida',
    curto: 'pediu alteração',
    cor: 'var(--st-ajuste)',
    wash: 'var(--st-ajuste-wash)',
  },
  client_approved: {
    rotulo: 'Aprovada',
    curto: 'aprovada',
    cor: 'var(--st-aprovado)',
    wash: 'var(--st-aprovado-wash)',
  },
}

const situacaoDe = (status: string) => SITUACAO[status] ?? SITUACAO.sent_to_client

/**
 * O mês do cliente.
 *
 * Duas leituras do mesmo mês e um lugar só para o detalhe:
 *
 *   calendário — como o mês se distribui. É a vista que abre, porque
 *                é a pergunta que o cliente faz primeiro ao receber
 *                um planejamento: "o que vem, e quando".
 *   lista      — o índice, para quem prefere descer a página.
 *   gaveta     — a publicação inteira, e é onde se decide. Clicar em
 *                qualquer lugar abre a mesma gaveta; o detalhe não
 *                existe em dois lugares para não divergir.
 */
export function Avaliacao({
  slug,
  ano,
  mes,
  pautas: iniciais,
  cor,
  euNome,
}: {
  slug: string
  ano: number
  mes: number
  pautas: PautaCliente[]
  /** A cor da marca do cliente, para o mês ter a cara dele. */
  cor: string
  /** O nome de quem está avaliando, para a decisão já nascer com dono. */
  euNome: string | null
}) {
  const [pautas, setPautas] = useState(iniciais)
  const [vista, setVista] = useState<'calendario' | 'lista'>('calendario')
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [pedindo, setPedindo] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const aberta = pautas.find((p) => p.id === abertaId) ?? null
  const pendentes = pautas.filter((p) => p.status === 'sent_to_client').length
  const aprovadas = pautas.filter((p) => p.status === 'client_approved').length
  const semData = pautas.filter((p) => !p.data)

  function abrir(id: string) {
    setAbertaId(id)
    setPedindo(false)
    setTexto('')
    setErro(null)
  }

  function fechar() {
    setAbertaId(null)
    setPedindo(false)
    setTexto('')
  }

  // Esc fecha a gaveta. Quem abriu sem querer não precisa procurar o X.
  useEffect(() => {
    if (!abertaId) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [abertaId])

  async function responder(p: PautaCliente, decisao: 'approved' | 'changes_requested') {
    if (enviando) return
    setErro(null)

    if (decisao === 'changes_requested' && texto.trim() === '') {
      setPedindo(true)
      setErro('Escreva o que você gostaria de mudar. É isso que a equipe vai ler.')
      return
    }

    setEnviando(true)
    const comentario = decisao === 'changes_requested' ? texto.trim() : ''
    const r = await decidir(slug, ano, mes, p.id, decisao, comentario)
    setEnviando(false)

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
              // A decisão entra na tela na hora, já com o nome. Antes
              // ela só aparecia depois de recarregar a página — e quem
              // acabou de aprovar via o detalhe sem dizer por quem.
              decisoes: [
                {
                  id: 'nova-' + Date.now(),
                  decisao,
                  autor: euNome,
                  created_at: new Date().toISOString(),
                  meu: true,
                  // O banco mede o mesmo intervalo; aqui é só para a
                  // tela mostrar na hora, sem esperar recarregar.
                  segundos: x.enviadaEm
                    ? Math.max(0, (Date.now() - new Date(x.enviadaEm).getTime()) / 1000)
                    : null,
                },
                ...x.decisoes,
              ],
              recados:
                comentario === ''
                  ? x.recados
                  : [
                      {
                        id: 'novo-' + Date.now(),
                        body: comentario,
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
    setPedindo(false)
    setTexto('')
  }

  return (
    <div>
      {/* ---------------- resumo e alternador ---------------- */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          padding: '16px 20px',
          ...cartao,
          marginBottom: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 14, marginBottom: 7 }}>
            <b>
              {aprovadas} de {pautas.length} aprovadas
            </b>
            {pendentes > 0 && (
              <span style={{ color: 'var(--muted)' }}> · {pendentes} aguardando você</span>
            )}
          </div>
          <div style={{ height: 5, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
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

        <div
          style={{
            display: 'inline-flex',
            gap: 4,
            padding: 4,
            borderRadius: 99,
            background: 'var(--surface-2)',
          }}
        >
          {(['calendario', 'lista'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              style={{
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: vista === v ? 700 : 500,
                padding: '6px 16px',
                border: 'none',
                borderRadius: 99,
                background: vista === v ? 'var(--surface)' : 'transparent',
                boxShadow: vista === v ? '0 1px 2px rgba(29,37,48,.08)' : 'none',
                color: vista === v ? 'var(--text)' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {v === 'calendario' ? 'Calendário' : 'Lista'}
            </button>
          ))}
        </div>
      </div>

      {erro && !abertaId && (
        <div
          role="alert"
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

      {/* ---------------- calendário ---------------- */}
      {vista === 'calendario' && (
        <div style={{ ...cartao, padding: '20px 22px 22px' }}>
          {/* A forma da grade vem da classe, não do style: no celular
              ela vira uma coluna e o dia vazio sai. Ver globals.css. */}
          <div className="grade-mes">
            {DIAS_CURTOS.map((d) => (
              <div
                key={d}
                className="cab-semana"
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--faint)',
                  textAlign: 'center',
                  paddingBottom: 4,
                }}
              >
                {d}
              </div>
            ))}

            {semanasDoMes(ano, mes)
              .flat()
              .map((dia, i) => {
                if (dia === null) return <div key={`v${i}`} className="dia-vazio" />
                const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
                const doDia = pautas.filter((p) => p.data === data)
                return (
                  <div
                    key={data}
                    className={doDia.length ? 'dia-cheio' : 'dia-vazio'}
                    style={{
                      minHeight: 132,
                      padding: 9,
                      borderRadius: 'var(--r)',
                      // Dia sem publicação não ganha caixa: quinze
                      // molduras vazias competindo com cinco cheias é o
                      // que faz um calendário parecer planilha.
                      background: doDia.length ? 'var(--surface-2)' : 'transparent',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--faint)',
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    >
                      <span className="so-celular">{DIAS_CURTOS[i % 7]} · </span>
                      {dia}
                    </div>
                    {doDia.map((p) => (
                      <CartaoDoDia key={p.id} p={p} aoAbrir={() => abrir(p.id)} />
                    ))}
                  </div>
                )
              })}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 18,
              paddingTop: 15,
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
            <span style={{ fontSize: 12.5, color: 'var(--faint)', marginLeft: 'auto' }}>
              Clique numa publicação para ler e responder.
            </span>
          </div>

          {semData.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
                {semData.length} publicação(ões) ainda sem data marcada:
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {semData.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => abrir(p.id)}
                    style={{ ...botao(false), fontSize: 12.5, padding: '8px 14px' }}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- lista ---------------- */}
      {vista === 'lista' && (
        <ol
          style={{
            listStyle: 'none',
            margin: '0 auto',
            padding: 0,
            display: 'grid',
            gap: 10,
            maxWidth: 900,
          }}
        >
          {pautas.map((p) => {
            const s = situacaoDe(p.status)
            const dia = p.data ? Number(p.data.slice(8, 10)) : null
            return (
              <li key={p.id}>
                <button
                  onClick={() => abrir(p.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '15px 18px',
                    ...cartao,
                  }}
                >
                  <div style={{ textAlign: 'center', minWidth: 42 }}>
                    <div
                      style={{
                        fontFamily: 'var(--disp)',
                        fontSize: 24,
                        fontWeight: 600,
                        lineHeight: 1,
                        color: 'var(--text)',
                      }}
                    >
                      {dia ?? '?'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 2 }}>
                      {tipoDaPeca(p.formato).toLowerCase()}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                      {p.title}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginTop: 4,
                        fontSize: 12.3,
                        color: 'var(--muted)',
                      }}
                    >
                      {p.linha && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <i aria-hidden style={ponto(corDaLinha(p.linhaIndice), 7)} />
                          {p.linha}
                        </span>
                      )}
                      {p.plataforma && <span>{p.plataforma}</span>}
                      {p.recados.length > 0 && <span>{p.recados.length} recado(s)</span>}
                    </div>
                  </div>

                  <span style={pilula(s.wash)}>
                    <i aria-hidden style={ponto(s.cor)} />
                    {s.rotulo}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {/* ---------------- a gaveta ---------------- */}
      {aberta && (
        <Gaveta
          p={aberta}
          cor={cor}
          erro={erro}
          pedindo={pedindo}
          texto={texto}
          enviando={enviando}
          aoFechar={fechar}
          aoMudarTexto={setTexto}
          aoAbrirPedido={() => {
            setPedindo(true)
            setTexto('')
            setErro(null)
          }}
          aoCancelarPedido={() => {
            setPedindo(false)
            setTexto('')
            setErro(null)
          }}
          aoResponder={(d) => responder(aberta, d)}
        />
      )}
    </div>
  )
}

/** O cartão de um dia no calendário. Pouca informação, muito clicável. */
function CartaoDoDia({ p, aoAbrir }: { p: PautaCliente; aoAbrir: () => void }) {
  const s = situacaoDe(p.status)
  const tipo = tipoDaPeca(p.formato)
  return (
    <button
      onClick={aoAbrir}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        marginBottom: 6,
        padding: '9px 10px',
        border: 'none',
        borderRadius: 'var(--r-sm)',
        background: 'var(--surface)',
        boxShadow: '0 1px 2px rgba(29,37,48,.07)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 10,
          color: 'var(--muted)',
          marginBottom: 3,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 17,
            height: 17,
            borderRadius: 5,
            background: 'var(--surface-3)',
            display: 'inline-grid',
            placeItems: 'center',
            fontSize: 9,
          }}
        >
          {ICONE_PECA[tipo]}
        </span>
        {tipo}
      </div>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          lineHeight: 1.35,
          color: 'var(--text)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {p.title}
      </div>
      {p.linha && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            marginTop: 5,
            fontSize: 10,
            color: 'var(--muted)',
          }}
        >
          <i aria-hidden style={ponto(corDaLinha(p.linhaIndice), 7)} />
          {p.linha}
        </div>
      )}
      <div style={{ ...pilula(s.wash, true), marginTop: 6 }}>
        <i aria-hidden style={ponto(s.cor)} />
        {s.curto}
      </div>
    </button>
  )
}

/** A publicação inteira, e os dois botões que resolvem o mês. */
function Gaveta({
  p,
  cor,
  erro,
  pedindo,
  texto,
  enviando,
  aoFechar,
  aoMudarTexto,
  aoAbrirPedido,
  aoCancelarPedido,
  aoResponder,
}: {
  p: PautaCliente
  cor: string
  erro: string | null
  pedindo: boolean
  texto: string
  enviando: boolean
  aoFechar: () => void
  aoMudarTexto: (t: string) => void
  aoAbrirPedido: () => void
  aoCancelarPedido: () => void
  aoResponder: (d: 'approved' | 'changes_requested') => void
}) {
  const s = situacaoDe(p.status)
  const pode = p.status === 'sent_to_client' || p.status === 'client_changes_requested'
  const tipo = tipoDaPeca(p.formato)

  return (
    <>
      <div
        onClick={aoFechar}
        style={{ position: 'fixed', inset: 0, background: 'rgba(17,20,26,.38)', zIndex: 30 }}
      />
      <aside
        role="dialog"
        aria-label={p.title}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(680px, 100vw)',
          zIndex: 31,
          background: 'var(--surface)',
          overflowY: 'auto',
          padding: '24px 28px 48px',
          boxShadow: '-10px 0 40px -18px rgba(29,37,48,.4)',
          borderTop: `4px solid ${cor}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={pilula(s.wash)}>
            <i aria-hidden style={ponto(s.cor)} />
            {s.rotulo}
          </span>
          {p.data && (
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {p.data.slice(8, 10)}/{p.data.slice(5, 7)}
            </span>
          )}
          <button
            onClick={aoFechar}
            aria-label="fechar"
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              fontSize: 24,
              lineHeight: 1,
              cursor: 'pointer',
              color: 'var(--muted)',
            }}
          >
            ×
          </button>
        </div>

        <h2
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1.22,
            letterSpacing: '-.02em',
            marginBottom: 10,
          }}
        >
          {p.title}
        </h2>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 20 }}>
          {p.linha && (
            <span style={etiqueta}>
              <i aria-hidden style={ponto(corDaLinha(p.linhaIndice), 7)} />
              {p.linha}
            </span>
          )}
          <span style={etiqueta}>
            <span aria-hidden>{ICONE_PECA[tipo]}</span>
            {tipo}
            {p.formato && tipo.toLowerCase() !== p.formato.toLowerCase() ? ` · ${p.formato}` : ''}
          </span>
          {p.plataforma && <span style={etiqueta}>{p.plataforma}</span>}
          {p.editorial_line && <span style={etiqueta}>{p.editorial_line}</span>}
        </div>

        {p.concept && (
          <p style={{ fontSize: 15, lineHeight: 1.65, marginBottom: 10 }}>{p.concept}</p>
        )}
        {p.description && (
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--muted)', marginBottom: 16 }}>
            {p.description}
          </p>
        )}

        {p.layouts.length > 0 && (
          <Bloco titulo={p.layouts.length === 1 ? 'Layout' : `Layout · ${p.layouts.length} imagens`}>
            <Galeria key={p.id} imagens={p.layouts} titulo={p.title} />
          </Bloco>
        )}

        {p.caption && (
          <Bloco titulo="Legenda">
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 14,
                lineHeight: 1.7,
                padding: '15px 17px',
                background: 'var(--surface-2)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              {p.caption}
            </div>
            {p.hashtags.length > 0 && (
              <div style={{ fontSize: 12.8, color: 'var(--muted)', marginTop: 7 }}>
                {p.hashtags.join(' ')}
              </div>
            )}
          </Bloco>
        )}

        {p.art_concept && (
          <Bloco titulo="Ideia de imagem">
            <p style={{ fontSize: 13.8, lineHeight: 1.65, color: 'var(--muted)' }}>
              {p.art_concept}
            </p>
          </Bloco>
        )}

        {p.cenas.length > 0 && (
          <Bloco titulo="Cenas">
            {p.cenas.map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 12,
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  padding: '4px 0',
                }}
              >
                <span style={{ color: 'var(--faint)', minWidth: 54, fontWeight: 600 }}>{c.t}</span>
                <span>{c.descricao}</span>
              </div>
            ))}
          </Bloco>
        )}

        {p.cta && (
          <Bloco titulo="Chamada para ação">
            <p style={{ fontSize: 13.8 }}>{p.cta}</p>
          </Bloco>
        )}

        {p.decisoes.length > 0 && (
          <Bloco titulo="Decisões">
            {p.decisoes.map((d) => (
              <div key={d.id} style={{ fontSize: 13, color: 'var(--muted)', padding: '2px 0' }}>
                <b
                  style={{
                    color: d.decisao === 'approved' ? 'var(--st-aprovado)' : 'var(--st-ajuste)',
                  }}
                >
                  {d.decisao === 'approved' ? 'aprovada' : 'alteração pedida'}
                </b>{' '}
                por <b style={{ color: 'var(--text)' }}>{d.meu ? 'você' : (d.autor ?? 'alguém da sua equipe')}</b>{' '}
                em{' '}
                {new Date(d.created_at).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {duracao(d.segundos) && ` · respondeu em ${duracao(d.segundos)}`}
              </div>
            ))}
          </Bloco>
        )}

        {p.recados.length > 0 && (
          <Bloco titulo="Conversa">
            <div style={{ padding: '13px 15px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}>
              {p.recados.map((r) => (
                <div key={r.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{r.body}</div>
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
          </Bloco>
        )}

        {erro && (
          <div
            role="alert"
            style={{
              margin: '16px 0',
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

        {pode ? (
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            {pedindo && (
              <div style={{ marginBottom: 14 }}>
                <label
                  htmlFor={`c-${p.id}`}
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: 12.5,
                    color: 'var(--muted)',
                    marginBottom: 5,
                  }}
                >
                  O que você gostaria de mudar?
                </label>
                <textarea
                  id={`c-${p.id}`}
                  rows={4}
                  value={texto}
                  onChange={(e) => aoMudarTexto(e.target.value)}
                  autoFocus
                  placeholder="Quanto mais específico, menos idas e vindas."
                  style={caixaTexto}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              {pedindo ? (
                <>
                  <button
                    onClick={() => aoResponder('changes_requested')}
                    disabled={enviando}
                    style={{ ...botao(true, enviando), fontSize: 14, padding: '11px 22px' }}
                  >
                    {enviando ? 'Enviando…' : 'Enviar o pedido'}
                  </button>
                  <button onClick={aoCancelarPedido} disabled={enviando} style={botao(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => aoResponder('approved')}
                    disabled={enviando}
                    style={{ ...botao(true, enviando), fontSize: 14, padding: '11px 24px' }}
                  >
                    {enviando ? 'Registrando…' : 'Aprovar'}
                  </button>
                  <button onClick={aoAbrirPedido} disabled={enviando} style={botao(false)}>
                    Pedir alteração
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 24,
              padding: '14px 17px',
              borderRadius: 'var(--r)',
              background: 'var(--ok-wash)',
              fontSize: 13.5,
              lineHeight: 1.6,
            }}
          >
            {(() => {
              // A lista vem da mais nova para a mais antiga.
              const a = p.decisoes.find((d) => d.decisao === 'approved')
              const quem = a && !a.meu && a.autor ? a.autor : null
              return (
                <>
                  {quem
                    ? `Esta publicação já foi aprovada por ${quem}.`
                    : 'Você já aprovou esta publicação.'}{' '}
                  Se quiser fazer alguma alteração, é só falar com a equipe da Alta. Como a
                  aprovação já foi registrada, a gente cuida desse ajuste com você.
                  {a && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                      Aprovada por {a.autor ?? (a.meu ? 'você' : 'alguém da sua equipe')} em{' '}
                      {new Date(a.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {duracao(a.segundos) && `, ${duracao(a.segundos)} depois do envio`}.
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </aside>
    </>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--faint)',
          marginBottom: 7,
        }}
      >
        {titulo}
      </div>
      {children}
    </section>
  )
}

const etiqueta: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  fontWeight: 600,
  padding: '4px 11px',
  borderRadius: 99,
  background: 'var(--surface-2)',
  color: 'var(--muted)',
}

/**
 * O layout como o cliente vai ver no feed: uma imagem por vez, com
 * setas e a contagem, como um carrossel. Clicar abre em tamanho real.
 */
function Galeria({
  imagens,
  titulo,
}: {
  imagens: { url: string; largura: number | null; altura: number | null }[]
  titulo: string
}) {
  const [i, setI] = useState(0)
  const atual = imagens[Math.min(i, imagens.length - 1)]
  const razao =
    atual.largura && atual.altura ? `${atual.largura} / ${atual.altura}` : '4 / 5'
  const seta = (lado: 'esq' | 'dir'): React.CSSProperties => ({
    position: 'absolute',
    top: '50%',
    [lado === 'esq' ? 'left' : 'right']: 8,
    transform: 'translateY(-50%)',
    width: 34,
    height: 34,
    borderRadius: 99,
    border: 'none',
    background: 'rgba(255,255,255,.92)',
    boxShadow: '0 2px 8px rgba(0,0,0,.18)',
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
    color: '#1D2530',
  })

  return (
    <div>
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          background: 'var(--surface-3)',
          aspectRatio: razao,
          maxHeight: 560,
          marginInline: 'auto',
        }}
      >
        <a href={atual.url} target="_blank" rel="noopener" title="abrir em tamanho real">
          <img
            src={atual.url}
            alt={`${titulo}, imagem ${i + 1} de ${imagens.length}`}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        </a>
        {imagens.length > 1 && (
          <>
            {i > 0 && (
              <button aria-label="imagem anterior" onClick={() => setI(i - 1)} style={seta('esq')}>
                ‹
              </button>
            )}
            {i < imagens.length - 1 && (
              <button aria-label="próxima imagem" onClick={() => setI(i + 1)} style={seta('dir')}>
                ›
              </button>
            )}
            <span
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                fontSize: 11.5,
                fontWeight: 700,
                padding: '2px 9px',
                borderRadius: 99,
                background: 'rgba(0,0,0,.6)',
                color: '#fff',
              }}
            >
              {i + 1} / {imagens.length}
            </span>
          </>
        )}
      </div>
      {imagens.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {imagens.map((_, k) => (
            <button
              key={k}
              aria-label={`ver imagem ${k + 1}`}
              onClick={() => setI(k)}
              style={{
                width: k === i ? 18 : 7,
                height: 7,
                borderRadius: 99,
                border: 'none',
                padding: 0,
                background: k === i ? 'var(--accent)' : 'var(--line-2)',
                cursor: 'pointer',
                transition: 'width .15s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
