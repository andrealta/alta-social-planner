'use client'

import { useEffect, useState } from 'react'
import { type ConteudoPauta, type Pauta, botao, caixaTexto } from './comum'
import { salvarConteudo } from './acoes'
import { COMANDOS_CONTEUDO } from '@/lib/prompt'
import { Layouts } from './layouts'
import type { Layout } from '@/lib/layouts'
import { GrupoDeCampos, type CampoDoGrupo } from '@/lib/grupo'
import { juntarLayout, juntarTextoDeApoio, separarTextoDeApoio } from '@/lib/texto'

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

/**
 * O conteúdo que a equipe edita à mão, em dois textos.
 *
 * No banco são cinco colunas, e elas continuam cinco: a IA escreve
 * legenda, chamada para ação e hashtags separadas porque precisa saber
 * o que é cada coisa, e o portal do cliente e o PDF montam cada parte
 * no lugar dela. Só que na hora de publicar isso tudo é UM texto, na
 * ordem em que sai no post, e era assim que a equipe precisava ler e
 * escrever. Três caixas rotuladas para uma coisa só é o banco vazando
 * na tela.
 *
 * Então aqui em cima são dois campos: o texto que vai publicado e a
 * sugestão de layout. A junta e a separação estão logo abaixo, e são
 * as duas únicas funções que sabem dessa tradução.
 */
type Campos = {
  texto: string
  layout: string
}

const GRUPO_TEXTO: CampoDoGrupo<keyof Campos>[] = [
  {
    id: 'texto',
    rotulo: '',
    linhas: 14,
    leitura: 'texto',
    dica: 'A primeira linha é o gancho: ela aparece antes do "mais". As hashtags do fim voltam a ser lista quando você grava.',
  },
]

const GRUPO_LAYOUT: CampoDoGrupo<keyof Campos>[] = [
  { id: 'layout', rotulo: '', linhas: 7, leitura: 'texto' },
]

const CAMPOS_CONTEUDO = [...GRUPO_TEXTO, ...GRUPO_LAYOUT]

function paraCampos(c: ConteudoPauta | null): Campos {
  return {
    texto: juntarTextoDeApoio(c?.caption, c?.cta, c?.hashtags),
    layout: juntarLayout(c?.art_concept, c?.art_direction),
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

    // A tradução dos dois textos para as cinco colunas acontece aqui, e
    // só aqui. A ação do servidor recebe as colunas já separadas.
    const t = separarTextoDeApoio(campos.texto)
    const layout = campos.layout.trim()
    const gravar = {
      caption: t.legenda ?? '',
      cta: '',
      hashtags: t.hashtags.join(' '),
      art_concept: layout,
      art_direction: '',
    }

    const r = await salvarConteudo(slug, pauta.id, gravar, ano, mes)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui gravar.')
      return
    }
    aoGerar({
      ...conteudo,
      caption: t.legenda,
      cta: null,
      hashtags: t.hashtags,
      art_concept: layout || null,
      art_direction: null,
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

  // O que o botão copia é exatamente o que está na caixa, inclusive as
  // alterações ainda não gravadas. Copiar uma coisa e ver outra na tela
  // seria pior que não ter botão.
  const legendaInteira = campos.texto.trim()

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
            texto de apoio, hashtags e sugestão de layout. Leva de dois a cinco minutos
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
          A IA escreve o texto pronto para publicar, a chamada para ação, as
          hashtags e a sugestão de layout. Se o formato for vídeo, escreve também
          a decupagem em cenas, com uma marcada como cena-chave.
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
              <GrupoDeCampos
                titulo="Texto de apoio"
                lista={GRUPO_TEXTO}
                campos={campos}
                original={original}
                podeEditar
                desabilitado={criando || salvando}
                aoMudar={(id, valor) => setCampos({ ...campos, [id]: valor })}
                extra={<Copiar texto={legendaInteira} rotulo="Copiar tudo" />}
              />

              <GrupoDeCampos
                titulo="Sugestão de layout"
                lista={GRUPO_LAYOUT}
                campos={campos}
                original={original}
                podeEditar
                desabilitado={criando || salvando}
                aoMudar={(id, valor) => setCampos({ ...campos, [id]: valor })}
              />

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
                  placeholder="Ou explique com suas palavras: encurte o texto, tire a pergunta do começo e troque a chamada para ação por um convite para visitar a loja."
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
              <GrupoDeCampos
                titulo="Texto de apoio"
                lista={GRUPO_TEXTO}
                campos={campos}
                original={campos}
                podeEditar={false}
                aoMudar={() => {}}
                extra={<Copiar texto={legendaInteira} rotulo="Copiar tudo" />}
              />

              <GrupoDeCampos
                titulo="Sugestão de layout"
                lista={GRUPO_LAYOUT}
                campos={campos}
                original={campos}
                podeEditar={false}
                aoMudar={() => {}}
              />
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


          {/* O mockup da peça saiu daqui (rodada 41). Ele desenhava um
              retângulo com as cores e o texto por cima, e a equipe já
              anexa o layout de verdade logo acima: dois desenhos da
              mesma coisa, um deles falso, confundiam mais que ajudavam.
              A coluna `layout` continua gravada. */}
        </>
      )}
    </div>
  )
}
