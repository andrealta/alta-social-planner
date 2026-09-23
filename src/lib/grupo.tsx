'use client'

import { useState } from 'react'
import { caixaTexto } from './visual'

/**
 * Um grupo de campos que se LÊ como um texto e se EDITA como campos.
 *
 * O painel da pauta tinha nove caixas de texto empilhadas, cada uma com
 * seu rótulo, e a aba do conteúdo tinha mais sete. Quem chegava para
 * revisar gastava os primeiros segundos remontando na cabeça o que
 * aquilo dizia, porque a informação estava fatiada pela conveniência do
 * banco, não pela ordem em que uma pessoa lê.
 *
 * Então o normal aqui é a leitura: os campos aparecem corridos, como um
 * texto. Editar é um clique, e abre exatamente os campos de antes,
 * porque eles continuam existindo separados: a IA precisa saber o que é
 * título e o que é chamada para ação na hora de escrever, o portal do
 * cliente separa contexto de detalhe, e o PDF monta cada parte no lugar
 * dela.
 *
 * Duas regras evitam perder trabalho: com alteração não salva o bloco
 * não fecha, e um grupo recolhido com alteração não salva abre sozinho.
 * Esconder texto que a pessoa acabou de digitar é o jeito mais rápido
 * de fazê-la perdê-lo.
 */

/**
 * Como cada campo aparece quando o bloco está só sendo lido.
 *
 *   titulo   — a manchete, em destaque
 *   texto    — parágrafo normal
 *   apoio    — parágrafo secundário, em tinta mais clara
 *   rotulado — uma linha curta precedida do nome do campo
 *   etiquetas — palavras soltas, como hashtags, em tinta mais clara
 */
export type LeituraDoCampo = 'titulo' | 'texto' | 'apoio' | 'rotulado' | 'etiquetas'

export type CampoDoGrupo<K extends string = string> = {
  id: K
  rotulo: string
  linhas: number
  leitura: LeituraDoCampo
  /** Uma frase de ajuda, mostrada só no modo de edição. */
  dica?: string
}

export function GrupoDeCampos<K extends string>({
  titulo,
  ajuda,
  lista,
  campos,
  original,
  podeEditar,
  aoMudar,
  recolhivel = false,
  desabilitado = false,
  extra,
}: {
  titulo: string
  ajuda?: string
  lista: CampoDoGrupo<K>[]
  campos: Record<K, string>
  original: Record<K, string>
  podeEditar: boolean
  aoMudar: (id: K, valor: string) => void
  /** Começa fechado, como o bastidor da pauta. */
  recolhivel?: boolean
  /** Enquanto a IA trabalha, ninguém digita por cima do que vem vindo. */
  desabilitado?: boolean
  /** Algo à direita do título, como um botão de copiar. */
  extra?: React.ReactNode
}) {
  const sujo = lista.some((c) => campos[c.id] !== original[c.id])
  const [editando, setEditando] = useState(false)
  const [aberto, setAberto] = useState(!recolhivel)
  const emEdicao = editando || sujo
  const visivel = aberto || sujo
  const temAlgo = lista.some((c) => (campos[c.id] ?? '').trim() !== '')
  // Campo sem rótulo não entra na nota do que falta: "Sem ." não diz nada.
  const vazios = lista.filter((c) => c.rotulo && !(campos[c.id] ?? '').trim())

  return (
    <section
      style={{
        marginBottom: 18,
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 15px',
          background: 'var(--surface-2)',
          borderBottom: visivel ? '1px solid var(--line)' : 'none',
        }}
      >
        {recolhivel ? (
          <button
            onClick={() => setAberto((v) => !v)}
            disabled={sujo}
            style={{
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: '.02em',
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--text)',
              cursor: sujo ? 'default' : 'pointer',
              textAlign: 'left',
            }}
          >
            {visivel ? '▾' : '▸'} {titulo}
          </button>
        ) : (
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.02em' }}>{titulo}</div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {visivel && !emEdicao && extra}
          {visivel && podeEditar && (
            <button
              onClick={() => setEditando((v) => !v)}
              disabled={(sujo && emEdicao) || desabilitado}
              style={{
                fontFamily: 'inherit',
                fontSize: 12.2,
                fontWeight: 600,
                background: 'none',
                border: 'none',
                padding: '2px 0',
                color: sujo && emEdicao ? 'var(--faint)' : 'var(--accent)',
                cursor: sujo && emEdicao ? 'default' : 'pointer',
              }}
            >
              {emEdicao ? (sujo ? 'editando' : 'Pronto') : 'Editar'}
            </button>
          )}
        </div>
      </header>

      {visivel && (
        <div style={{ padding: '14px 15px 4px' }}>
          {ajuda && (
            <p style={{ color: 'var(--faint)', fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
              {ajuda}
            </p>
          )}

          {emEdicao ? (
            lista.map((c) => (
              <div key={c.id} style={{ marginBottom: 14 }}>
                {/* Rótulo vazio quer dizer "este campo É o bloco": repetir o
                    título do bloco logo abaixo dele só ocuparia espaço. */}
                {c.rotulo && (
                  <label
                    htmlFor={`g-${c.id}`}
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
                )}
                <textarea
                  id={`g-${c.id}`}
                  rows={c.linhas}
                  value={campos[c.id]}
                  readOnly={!podeEditar}
                  disabled={desabilitado}
                  onChange={(ev) => aoMudar(c.id, ev.target.value)}
                  style={{
                    ...caixaTexto,
                    border:
                      campos[c.id] !== original[c.id]
                        ? '1px solid var(--accent)'
                        : '1px solid transparent',
                    ...(podeEditar
                      ? null
                      : { background: 'var(--surface-2)', color: 'var(--muted)', cursor: 'default' }),
                  }}
                />
                {c.dica && (
                  <p style={{ color: 'var(--faint)', fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
                    {c.dica}
                  </p>
                )}
              </div>
            ))
          ) : temAlgo ? (
            <div style={{ paddingBottom: 10 }}>
              {lista.map((c) => {
                const v = (campos[c.id] ?? '').trim()
                if (!v) return null
                if (c.leitura === 'titulo') {
                  return (
                    <div
                      key={c.id}
                      style={{
                        fontFamily: 'var(--disp)',
                        fontSize: 17,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        letterSpacing: '-.01em',
                        marginBottom: 9,
                      }}
                    >
                      {v}
                    </div>
                  )
                }
                if (c.leitura === 'texto') {
                  return (
                    <p
                      key={c.id}
                      style={{
                        fontSize: 14.2,
                        lineHeight: 1.68,
                        marginBottom: 9,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {v}
                    </p>
                  )
                }
                if (c.leitura === 'apoio') {
                  return (
                    <p
                      key={c.id}
                      style={{
                        fontSize: 13.7,
                        lineHeight: 1.7,
                        color: 'var(--muted)',
                        marginBottom: 9,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {v}
                    </p>
                  )
                }
                if (c.leitura === 'etiquetas') {
                  return (
                    <p
                      key={c.id}
                      style={{
                        fontSize: 13,
                        lineHeight: 1.7,
                        color: 'var(--faint)',
                        marginBottom: 9,
                        wordBreak: 'break-word',
                      }}
                    >
                      {v}
                    </p>
                  )
                }
                return (
                  <p key={c.id} style={{ fontSize: 13.4, lineHeight: 1.6, marginBottom: 6 }}>
                    <span style={{ color: 'var(--faint)', fontWeight: 600 }}>{c.rotulo}: </span>
                    {v}
                  </p>
                )
              })}
              {/* Campo vazio não vira linha em branco no meio da leitura:
                  vira uma nota no fim, para a equipe ver o que falta. */}
              {vazios.length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>
                  Sem {vazios.map((c) => c.rotulo.toLowerCase()).join(', sem ')}.
                </p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--faint)', paddingBottom: 12, lineHeight: 1.6 }}>
              Nada escrito aqui ainda.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
