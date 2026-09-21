'use client'

import { useState } from 'react'
import { type ConteudoPauta, type Pauta, botao } from './comum'

function Copiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false)
  if (!texto) return null
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1800)
        } catch {
          setCopiado(false)
        }
      }}
      style={{
        fontFamily: 'inherit',
        fontSize: 11.5,
        fontWeight: 600,
        padding: '3px 9px',
        border: '1px solid var(--line-2)',
        borderRadius: 6,
        background: copiado ? 'var(--ok-wash)' : 'var(--surface)',
        color: copiado ? 'var(--ok)' : 'var(--muted)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {copiado ? 'copiado' : rotulo}
    </button>
  )
}

function Bloco({
  titulo,
  copiavel,
  children,
}: {
  titulo: string
  copiavel?: string
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 5,
        }}
      >
        <h4
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
            margin: 0,
          }}
        >
          {titulo}
        </h4>
        <div style={{ marginLeft: 'auto' }}>{copiavel ? <Copiar texto={copiavel} /> : null}</div>
      </div>
      {children}
    </section>
  )
}

/** Uma ideia do que a peça vai parecer. Não é a arte final — é o layout. */
function Mockup({ layout, proporcao }: { layout: Record<string, string>; proporcao: string }) {
  const cor = (v: string | undefined, padrao: string) =>
    v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : padrao

  const c1 = cor(layout.cor1, '#2B2F36')
  const c2 = cor(layout.cor2, '#0E1013')
  const ct = cor(layout.cor_texto, '#FFFFFF')
  const ancora = layout.ancora === 'topo' ? 'flex-start' : layout.ancora === 'centro' ? 'center' : 'flex-end'

  const razao: Record<string, string> = { '1:1': '1 / 1', '4:5': '4 / 5', '9:16': '9 / 16', '16:9': '16 / 9' }

  return (
    <div>
      <div
        style={{
          aspectRatio: razao[proporcao] ?? '4 / 5',
          maxWidth: 300,
          borderRadius: 10,
          overflow: 'hidden',
          background: `linear-gradient(155deg, ${c1}, ${c2})`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: ancora,
          padding: 18,
          color: ct,
          border: '1px solid var(--line-2)',
        }}
      >
        {layout.kicker && (
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              opacity: 0.86,
              marginBottom: 7,
            }}
          >
            {layout.kicker}
          </div>
        )}
        {layout.titulo && (
          <div
            style={{
              fontFamily: 'var(--disp)',
              fontSize: 25,
              fontWeight: 600,
              lineHeight: 1.08,
              textWrap: 'balance',
            }}
          >
            {layout.titulo}
          </div>
        )}
        {layout.apoio && (
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8, lineHeight: 1.45 }}>
            {layout.apoio}
          </div>
        )}
        {layout.selo && (
          <div
            style={{
              alignSelf: 'flex-start',
              marginTop: 12,
              fontSize: 10,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 99,
              border: `1px solid ${ct}`,
              opacity: 0.9,
            }}
          >
            {layout.selo}
          </div>
        )}
      </div>
      <p style={{ color: 'var(--faint)', fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
        Layout, não a arte final. O fundo previsto é <b>{layout.fundo ?? 'cor'}</b>
        {layout.foto_descricao ? `: ${layout.foto_descricao}` : ''}.
      </p>
    </div>
  )
}

export function AbaConteudo({
  pauta,
  conteudo,
  podeEditar,
  aoGerar,
}: {
  pauta: Pauta
  conteudo: ConteudoPauta | null
  /** Falso para quem só lê: o texto aparece, o botão de escrever não. */
  podeEditar: boolean
  aoGerar: (c: ConteudoPauta) => void
}) {
  const [criando, setCriando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [achados, setAchados] = useState<{ gravidade: string; texto: string }[]>([])

  async function criar() {
    if (criando) return
    setCriando(true)
    setErro(null)
    setAchados([])
    setSegundos(0)
    const t = setInterval(() => setSegundos((x) => x + 1), 1000)
    try {
      const r = await fetch('/api/conteudo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ideaId: pauta.id }),
      })
      const corpo = await r.json()
      if (!r.ok || corpo.erro) {
        setErro(corpo.erro ?? 'Não consegui criar o conteúdo.')
        setAchados(corpo.achados ?? [])
        return
      }
      setAchados(corpo.achados ?? [])
      aoGerar(corpo.conteudo as ConteudoPauta)
    } catch {
      setErro('A conexão caiu durante a criação. Tente de novo.')
    } finally {
      clearInterval(t)
      setCriando(false)
    }
  }

  const desatualizado =
    conteudo &&
    conteudo.generated_for_version !== null &&
    conteudo.generated_for_version < pauta.current_version

  const legendaInteira = conteudo
    ? [conteudo.caption, conteudo.cta, (conteudo.hashtags ?? []).join(' ')]
        .filter((x) => x && String(x).trim())
        .join('\n\n')
    : ''

  return (
    <div>
      {pauta.status === 'ai_generated' && !conteudo && (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 15px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--warn)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--warn-wash)',
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          Esta pauta ainda não passou por revisão. Dá para escrever o conteúdo
          assim mesmo, mas costuma ser trabalho jogado fora: se a ideia mudar, o
          texto muda junto.
        </div>
      )}

      {desatualizado && (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 15px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--accent-wash)',
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <b>A pauta mudou depois que este conteúdo foi escrito.</b> O texto abaixo
          foi feito para a versão {conteudo?.generated_for_version}, e a pauta já está
          na {pauta.current_version}. Vale refazer.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        {podeEditar && <button onClick={criar} disabled={criando} style={botao(!conteudo, criando)}>
          {criando
            ? `Escrevendo… ${segundos}s`
            : conteudo
              ? 'Refazer o conteúdo'
              : 'Criar conteúdo'}
        </button>}
        {conteudo && !criando && (
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {conteudo.piece_kind === 'video' ? 'vídeo' : 'imagem'} · {conteudo.aspect_ratio}
          </span>
        )}
        {criando && (
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            legenda, hashtags e direção de arte. Leva de dois a cinco minutos
          </span>
        )}
      </div>

      {erro && (
        <div
          style={{
            marginBottom: 14,
            padding: '11px 14px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--accent-wash)',
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          {erro}
        </div>
      )}

      {achados.length > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: '11px 14px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--warn)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--warn-wash)',
            fontSize: 12.8,
            lineHeight: 1.55,
          }}
        >
          <b style={{ display: 'block', marginBottom: 4 }}>A conferência anotou:</b>
          <ul style={{ margin: 0, paddingLeft: 17 }}>
            {achados.map((a, i) => (
              <li key={i}>{a.texto}</li>
            ))}
          </ul>
        </div>
      )}

      {!conteudo && !criando && podeEditar && (
        <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>
          A IA escreve a legenda pronta para publicar, as hashtags, o texto
          alternativo, a direção de arte e o prompt da imagem em inglês. Se o
          formato for vídeo, escreve também a decupagem em cenas, com uma marcada
          como cena-chave.
        </p>
      )}

      {!conteudo && !podeEditar && (
        <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>
          O conteúdo desta pauta ainda não foi escrito. Escrever é de quem edita a
          marca.
        </p>
      )}

      {conteudo && (
        <>
          <Bloco titulo="Legenda" copiavel={legendaInteira}>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 14,
                lineHeight: 1.65,
                padding: '12px 14px',
                background: 'var(--surface-2)',
                borderRadius: 8,
                border: '1px solid var(--line)',
              }}
            >
              {conteudo.caption}
            </div>
            {conteudo.cta && (
              <p style={{ fontSize: 13.5, marginTop: 8 }}>
                <b>CTA:</b> {conteudo.cta}
              </p>
            )}
          </Bloco>

          {(conteudo.hashtags ?? []).length > 0 && (
            <Bloco titulo="Hashtags" copiavel={(conteudo.hashtags ?? []).join(' ')}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {conteudo.hashtags.map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: 12,
                      padding: '2px 9px',
                      borderRadius: 99,
                      background: 'var(--surface-3)',
                      color: 'var(--muted)',
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
            </Bloco>
          )}

          {(conteudo.caption_variants ?? []).length > 0 && (
            <Bloco titulo="Variações por canal">
              {conteudo.caption_variants.map((v, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <b style={{ fontSize: 12.5 }}>{v.canal}</b>
                    <Copiar texto={v.texto ?? ''} />
                  </div>
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: 13.2,
                      lineHeight: 1.6,
                      color: 'var(--muted)',
                    }}
                  >
                    {v.texto}
                  </div>
                </div>
              ))}
            </Bloco>
          )}

          {(conteudo.scenes ?? []).length > 0 && (
            <Bloco titulo="Decupagem">
              {conteudo.scenes.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '58px 1fr',
                    gap: 10,
                    padding: '9px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: c.chave ? 'var(--accent)' : 'var(--faint)',
                    }}
                  >
                    {c.t}
                    {c.chave && <div style={{ fontSize: 9.5, letterSpacing: '.08em' }}>CHAVE</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 13.2, lineHeight: 1.55 }}>{c.descricao}</div>
                    {c.fala && (
                      <div style={{ fontSize: 12.6, color: 'var(--muted)', marginTop: 3 }}>
                        <i>{c.fala}</i>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </Bloco>
          )}

          {(conteudo.art_concept || conteudo.art_direction) && (
            <Bloco titulo="Direção de arte">
              {conteudo.art_concept && (
                <p style={{ fontSize: 13.8, fontWeight: 600, marginBottom: 5, lineHeight: 1.55 }}>
                  {conteudo.art_concept}
                </p>
              )}
              {conteudo.art_direction && (
                <p style={{ fontSize: 13.2, color: 'var(--muted)', lineHeight: 1.6 }}>
                  {conteudo.art_direction}
                </p>
              )}
            </Bloco>
          )}

          {conteudo.image_prompt && (
            <Bloco titulo="Prompt da imagem" copiavel={conteudo.image_prompt}>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  lineHeight: 1.55,
                  padding: '11px 13px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {conteudo.image_prompt}
              </div>
              <p style={{ color: 'var(--faint)', fontSize: 11.5, marginTop: 5, lineHeight: 1.5 }}>
                Em inglês e sem marca, logotipo ou texto: gerador erra tudo isso, e o
                texto entra na arte depois.
              </p>
            </Bloco>
          )}

          {conteudo.layout && Object.keys(conteudo.layout).length > 0 && (
            <Bloco titulo="A peça">
              <Mockup layout={conteudo.layout} proporcao={conteudo.aspect_ratio} />
            </Bloco>
          )}
        </>
      )}
    </div>
  )
}
