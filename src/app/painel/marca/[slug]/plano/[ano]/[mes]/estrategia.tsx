'use client'

import { useState } from 'react'
import { botao, caixaTexto } from '@/lib/visual'
import { salvarEstrategia } from './acoes'
import { semTravessao } from '@/lib/travessao'

/**
 * A estratégia do mês como o cliente vai ler.
 *
 * Não é a leitura interna. A leitura que a IA escreve cita o que os
 * concorrentes andam repetindo e qual brecha foi escolhida — isso é
 * raciocínio da agência. Aqui a equipe escreve a versão para o
 * cliente. O botão "começar pela leitura" copia o texto interno como
 * ponto de partida, e a equipe corta o que não deve sair daqui.
 *
 * Vazio: o portal do cliente simplesmente não mostra o bloco.
 */
export function Estrategia({
  slug,
  planoId,
  inicial,
  atualizadaEm,
  leitura,
  podeEditar,
  lembrete = false,
}: {
  slug: string
  planoId: string
  inicial: string | null
  atualizadaEm: string | null
  leitura: string | null
  podeEditar: boolean
  /** Destaca o bloco quando ainda está vazio, para ninguém enviar o mês sem ele. */
  lembrete?: boolean
}) {
  const [texto, setTexto] = useState(inicial ?? '')
  const [salvo, setSalvo] = useState(inicial ?? '')
  const [quando, setQuando] = useState(atualizadaEm)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const mudou = texto.trim() !== salvo.trim()

  async function salvar() {
    setSalvando(true)
    setErro(null)
    const r = await salvarEstrategia(slug, planoId, texto)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui salvar.')
      return
    }
    setSalvo(texto.trim())
    setQuando(texto.trim() ? new Date().toISOString() : null)
  }

  return (
    <section
      style={{
        marginTop: 16,
        padding: '18px 22px',
        borderRadius: 'var(--r-lg)',
        background: lembrete && !salvo.trim() && podeEditar ? 'var(--amarelo-wash, var(--warn-wash))' : 'var(--surface)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {lembrete && !salvo.trim() && podeEditar && (
        <p style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
          Falta escrever a estratégia deste mês. Sem ela, o cliente não vê o bloco
          &ldquo;A estratégia deste mês&rdquo; no portal nem no PDF.
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
          }}
        >
          A estratégia deste mês, como o cliente lê
        </div>
        <span style={{ fontSize: 12, color: 'var(--faint)', marginLeft: 'auto' }}>
          {salvo.trim()
            ? `publicada${quando ? ' em ' + new Date(quando).toLocaleDateString('pt-BR') : ''}`
            : 'o cliente não vê este bloco enquanto estiver vazio'}
        </span>
      </div>

      {!podeEditar ? (
        <p style={{ fontSize: 14.5, lineHeight: 1.65, marginTop: 8, whiteSpace: 'pre-wrap' }}>
          {salvo.trim() || (
            <span style={{ color: 'var(--muted)' }}>Ainda não escrita.</span>
          )}
        </p>
      ) : (
        <>
          <p style={{ fontSize: 12.8, color: 'var(--muted)', lineHeight: 1.55, margin: '6px 0 10px' }}>
            Em poucas linhas: o que a marca vai trabalhar neste mês e por quê. Aparece no topo
            do mês, no portal do cliente e no PDF. Não cite concorrentes nem a avaliação
            interna.
          </p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            placeholder="Ex.: Em novembro, a marca mostra os bastidores da produção..."
            style={{ ...caixaTexto, width: '100%', resize: 'vertical', lineHeight: 1.6 }}
          />
          {erro && (
            <div role="alert" style={{ fontSize: 13, color: 'var(--laranja-tinta)', marginTop: 6 }}>
              {erro}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={salvar} disabled={!mudou || salvando} style={botao(true, !mudou || salvando)}>
              {salvando ? 'Salvando…' : texto.trim() ? 'Publicar para o cliente' : 'Salvar vazio'}
            </button>
            {leitura && !texto.trim() && (
              <button onClick={() => setTexto(semTravessao(leitura))} style={botao(false)}>
                Começar pela leitura do mês
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
