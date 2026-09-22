'use client'

import { useEffect, useState } from 'react'
import { type ConteudoPauta, type Pauta, botao, caixaTexto } from './comum'
import { salvarConteudo } from './acoes'
import { COMANDOS_CONTEUDO } from '@/lib/prompt'
import { Layouts } from './layouts'
import type { Layout } from '@/lib/layouts'

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

/**
 * Os campos do conteúdo que a equipe edita à mão.
 *
 * Mesma ideia da aba Ideia: o que a IA escreveu é rascunho, e quem
 * responde pela marca precisa poder mexer sem pedir nada a ninguém.
 * Só que aqui não há versão arquivada: conteúdo é o que vai publicado,
 * e guardar rascunho de legenda não ajuda ninguém.
 */
type Campos = {
  caption: string
  cta: string
  hashtags: string
  alt_text: string
  art_concept: string
  art_direction: string
  image_prompt: string
}

const CAMPOS_CONTEUDO: { id: keyof Campos; rotulo: string; linhas: number; dica?: string; mono?: boolean }[] = [
  { id: 'caption', rotulo: 'Legenda', linhas: 9, dica: 'A primeira linha é o gancho: ela aparece antes do "mais".' },
  { id: 'cta', rotulo: 'CTA', linhas: 2 },
  { id: 'hashtags', rotulo: 'Hashtags', linhas: 2, dica: 'Separadas por espaço. O # entra sozinho se faltar.' },
  { id: 'alt_text', rotulo: 'Texto alternativo', linhas: 3, dica: 'Descrição da imagem para quem usa leitor de tela.' },
  { id: 'art_concept', rotulo: 'Conceito de arte', linhas: 3 },
  { id: 'art_direction', rotulo: 'Direção de arte', linhas: 5 },
  { id: 'image_prompt', rotulo: 'Prompt da imagem', linhas: 5, mono: true, dica: 'Em inglês e sem marca, logotipo ou texto: o gerador erra tudo isso.' },
]

function paraCampos(c: ConteudoPauta | null): Campos {
  return {
    caption: c?.caption ?? '',
    cta: c?.cta ?? '',
    hashtags: (c?.hashtags ?? []).join(' '),
    alt_text: c?.alt_text ?? '',
    art_concept: c?.art_concept ?? '',
    art_direction: c?.art_direction ?? '',
    image_prompt: c?.image_prompt ?? '',
  }
}

export function AbaConteudo({
  slug,
  ano,
  mes,
  pauta,
  conteudo,
  podeEditar,
  admin,
  aoGerar,
  aoMudarLayouts,
}: {
  slug: string
  ano: number
  mes: number
  pauta: Pauta
  conteudo: ConteudoPauta | null
  /** Administração troca layout mesmo depois de o cliente aprovar. */
  admin: boolean
  aoMudarLayouts: (layouts: Layout[]) => void
  /** Falso para quem só lê: o texto aparece, o botão de escrever não. */
  podeEditar: boolean
  aoGerar: (c: ConteudoPauta) => void
}) {
  const [criando, setCriando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [achados, setAchados] = useState<{ gravidade: string; texto: string }[]>([])
  const [campos, setCampos] = useState<Campos>(() => paraCampos(conteudo))
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pedido, setPedido] = useState('')
  /** Nulo quando é criação do zero; com texto, é alteração pedida à IA. */
  const [pedindo, setPedindo] = useState<string | null>(null)

  // Conteúdo novo (criado ou alterado pela IA) devolve os campos ao que
  // está gravado: o que a pessoa tinha digitado já não vale.
  useEffect(() => {
    setCampos(paraCampos(conteudo))
  }, [conteudo])

  const original = paraCampos(conteudo)
  const sujo = CAMPOS_CONTEUDO.some((c) => campos[c.id] !== original[c.id])

  async function salvar() {
    if (salvando || !conteudo) return
    setSalvando(true)
    setAviso(null)
    setErro(null)
    const r = await salvarConteudo(slug, pauta.id, campos, ano, mes)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui gravar.')
      return
    }
    const tags = [
      ...new Set(
        campos.hashtags
          .split(/[\s,]+/)
          .map((h) => h.trim())
          .filter(Boolean)
          .map((h) => (h.startsWith('#') ? h : '#' + h)),
      ),
    ].slice(0, 30)
    aoGerar({
      ...conteudo,
      caption: campos.caption.trim() || null,
      cta: campos.cta.trim() || null,
      hashtags: tags,
      alt_text: campos.alt_text.trim() || null,
      art_concept: campos.art_concept.trim() || null,
      art_direction: campos.art_direction.trim() || null,
      image_prompt: campos.image_prompt.trim() || null,
    })
    setAviso('Alterações gravadas.')
    setTimeout(() => setAviso(null), 2500)
  }

  async function criar(pedidoDaVez?: string) {
    if (criando) return
    const alterando = !!pedidoDaVez
    if (!alterando && conteudo && !window.confirm('Refazer joga fora o conteúdo atual, inclusive o que você editou à mão. Continuar?')) {
      return
    }
    setCriando(true)
    setPedindo(pedidoDaVez ?? null)
    setErro(null)
    setAviso(null)
    setAchados([])
    setSegundos(0)
    const t = setInterval(() => setSegundos((x) => x + 1), 1000)
    try {
      const r = await fetch('/api/conteudo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ideaId: pauta.id, pedido: pedidoDaVez ?? '' }),
      })
      const corpo = await r.json()
      if (!r.ok || corpo.erro) {
        setErro(corpo.erro ?? 'Não consegui criar o conteúdo.')
        setAchados(corpo.achados ?? [])
        return
      }
      setAchados(corpo.achados ?? [])
      aoGerar(corpo.conteudo as ConteudoPauta)
      if (alterando) {
        setPedido('')
        setAviso('Conteúdo alterado pela IA.')
        setTimeout(() => setAviso(null), 2500)
      }
    } catch {
      setErro('A conexão caiu no meio do caminho. Tente de novo.')
    } finally {
      clearInterval(t)
      setCriando(false)
      setPedindo(null)
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
        {podeEditar && (
          <button onClick={() => criar()} disabled={criando} style={botao(!conteudo, criando)}>
            {criando && pedindo === null
              ? `Escrevendo… ${segundos}s`
              : conteudo
                ? 'Refazer do zero'
                : 'Criar conteúdo'}
          </button>
        )}
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
        <Layouts
          key={pauta.id}
          ideaId={pauta.id}
          status={pauta.status}
          temConteudo={!!conteudo}
          podeEditar={podeEditar}
          admin={admin}
          proporcao={conteudo.aspect_ratio}
          iniciais={pauta.layouts}
          aoMudar={aoMudarLayouts}
        />
      )}

      {conteudo && (
        <>
          {podeEditar ? (
            <>
              {CAMPOS_CONTEUDO.map((c) => (
                <Bloco
                  key={c.id}
                  titulo={c.rotulo}
                  copiavel={c.id === 'caption' ? legendaInteira : campos[c.id] || undefined}
                >
                  <textarea
                    value={campos[c.id]}
                    onChange={(e) => setCampos({ ...campos, [c.id]: e.target.value })}
                    rows={c.linhas}
                    disabled={criando || salvando}
                    style={{
                      ...caixaTexto,
                      border:
                        campos[c.id] !== original[c.id]
                          ? '1px solid var(--accent)'
                          : '1px solid var(--line)',
                      fontFamily: c.mono ? 'var(--mono)' : 'inherit',
                      fontSize: c.mono ? 12 : 13.8,
                    }}
                  />
                  {c.dica && (
                    <p style={{ color: 'var(--faint)', fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
                      {c.dica}
                    </p>
                  )}
                </Bloco>
              ))}

              {/* Gravar e desfazer, logo abaixo dos campos. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '4px 0 14px',
                  marginBottom: 12,
                }}
              >
                <button onClick={salvar} disabled={!sujo || salvando || criando} style={botao(sujo, !sujo || salvando || criando)}>
                  {salvando ? 'Gravando…' : 'Salvar alterações'}
                </button>
                {sujo && !salvando && (
                  <button onClick={() => setCampos(original)} style={botao(false, criando)}>
                    Desfazer
                  </button>
                )}
                <span style={{ fontSize: 12.5, color: aviso ? 'var(--ok)' : 'var(--muted)' }}>
                  {aviso ?? (sujo ? 'Alterações não gravadas.' : 'Tudo gravado.')}
                </span>
              </div>

              {/* Alterar com a IA: os mesmos atalhos da aba Ideia, no
                  vocabulário de quem mexe em legenda e arte. O texto do
                  botão vai inteiro como pedido. */}
              <section
                style={{
                  margin: '4px 0 20px',
                  padding: '15px 17px',
                  borderRadius: 'var(--r)',
                  background: 'var(--surface-2)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>Alterar IA</div>
                <p style={{ color: 'var(--muted)', fontSize: 12.3, marginBottom: 9, lineHeight: 1.5 }}>
                  Ela reescreve só o que você pedir e mantém o resto. O conteúdo não guarda
                  histórico, então grave o que você editou antes de pedir. Leva de um a três
                  minutos.
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {COMANDOS_CONTEUDO.map((c) => (
                    <button
                      key={c}
                      onClick={() => criar(c)}
                      disabled={criando || salvando}
                      style={{
                        fontFamily: 'inherit',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: 99,
                        background: pedindo === c ? 'var(--accent)' : 'var(--surface)',
                        color: pedindo === c ? '#fff' : 'var(--text)',
                        boxShadow: pedindo === c ? 'none' : '0 1px 2px rgba(29,37,48,.07)',
                        cursor: criando || salvando ? 'not-allowed' : 'pointer',
                        opacity: criando && pedindo !== c ? 0.45 : 1,
                      }}
                    >
                      {pedindo === c ? `${c} · ${segundos}s` : c}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={pedido}
                  onChange={(e) => setPedido(e.target.value)}
                  disabled={criando || salvando}
                  placeholder="Ou explique com suas palavras: encurte a legenda, tire a pergunta do começo e troque o CTA por um convite para visitar a loja."
                  style={{ ...caixaTexto, fontSize: 13 }}
                />
                <button
                  onClick={() => criar(pedido.trim())}
                  disabled={pedido.trim().length < 3 || criando || salvando}
                  style={{
                    ...botao(false, pedido.trim().length < 3 || criando || salvando),
                    marginTop: 8,
                    width: '100%',
                    color: 'var(--accent)',
                  }}
                >
                  {criando && pedindo !== null && !COMANDOS_CONTEUDO.includes(pedindo)
                    ? `Pedindo à IA… ${segundos}s`
                    : 'Enviar à IA'}
                </button>

                {sujo && (
                  <p style={{ fontSize: 12, color: 'var(--laranja-tinta)', margin: '9px 0 0', lineHeight: 1.5 }}>
                    Você tem alterações não gravadas. Grave antes de pedir à IA, senão elas se
                    perdem.
                  </p>
                )}
              </section>
            </>
          ) : (
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
                </Bloco>
              )}
            </>
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
