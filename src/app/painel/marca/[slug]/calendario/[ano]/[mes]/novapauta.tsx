'use client'

/**
 * Acrescentar uma pauta a um mês que já existe.
 *
 * Duas coisas governam esta tela.
 *
 * A primeira: num mês que o cliente já aprovou, acrescentar uma pauta
 * desfaz a aprovação dele. Então o aviso não é um detalhe de rodapé, é
 * a primeira coisa que se lê, e o motivo é obrigatório porque vai para
 * a conversa que o cliente abre. Peça que aparece sem explicação
 * parece erro do sistema.
 *
 * A segunda: o botão de IA preenche, não grava. Quem assina a pauta é
 * quem a leu. Por isso o rascunho cai nos campos do formulário, e o
 * salvar continua sendo um segundo clique.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarPauta } from './acoes'
import { botao, caixaTexto, cartao } from './comum'
import { PLATAFORMAS, NOME_DA_PLATAFORMA, FORMATOS } from '@/lib/canais'

type Campos = {
  title: string
  concept: string
  description: string
  editorial_line: string
  cta: string
  theme: string
  objective: string
  rationale: string
  data: string
  plataforma: string
  formato: string
}

const VAZIO = (ano: number, mes: number, dia: number): Campos => ({
  title: '',
  concept: '',
  description: '',
  editorial_line: '',
  cta: '',
  theme: '',
  objective: '',
  rationale: '',
  data: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
  plataforma: 'instagram',
  formato: 'Feed',
})

const rotulo: React.CSSProperties = {
  display: 'block',
  fontWeight: 700,
  fontSize: 12,
  marginBottom: 4,
  color: 'var(--muted)',
}

export function NovaPauta({
  slug,
  planoId,
  ano,
  mes,
  linhas,
  mesAprovado,
  podeIA,
  primeiroDiaLivre,
  aoFechar,
}: {
  slug: string
  planoId: string
  ano: number
  mes: number
  /** As linhas editoriais que este mês já usa. */
  linhas: string[]
  /** O cliente já aprovou tudo? Então acrescentar desfaz a aprovação. */
  mesAprovado: boolean
  /** Quem pode rodar a IA. O botão custa dinheiro a cada clique. */
  podeIA: boolean
  primeiroDiaLivre: number
  aoFechar: () => void
}) {
  const [c, setC] = useState<Campos>(() => VAZIO(ano, mes, primeiroDiaLivre))
  const [motivo, setMotivo] = useState('')
  const [pedido, setPedido] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [escrevendo, setEscrevendo] = useState(false)
  const [detalhes, setDetalhes] = useState(false)
  const [pendente, comecar] = useTransition()
  const router = useRouter()

  const muda = (k: keyof Campos) => (v: string) => setC((x) => ({ ...x, [k]: v }))
  const formatos = FORMATOS[c.plataforma] ?? ['Feed']

  async function preencherComIA() {
    if (!pedido.trim()) {
      setErro('Escreva em uma linha o que a pauta precisa ser.')
      return
    }
    setEscrevendo(true)
    setErro(null)
    setAvisos([])
    try {
      const r = await fetch('/api/pauta', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planoId, pedido: pedido.trim() }),
      })
      const d = await r.json()
      if (!r.ok || !d.ok) {
        setErro(String(d.erro ?? 'A IA não respondeu.'))
        return
      }
      const x = d.rascunho as {
        title: string
        concept: string
        description: string
        editorial_line: string
        cta: string
        theme: string
        objective: string
        rationale: string
        dia: number
        plataforma: string
        formato: string
      }
      setC({
        title: x.title,
        concept: x.concept,
        description: x.description,
        editorial_line: x.editorial_line,
        cta: x.cta,
        theme: x.theme,
        objective: x.objective,
        rationale: x.rationale,
        data: `${ano}-${String(mes).padStart(2, '0')}-${String(x.dia).padStart(2, '0')}`,
        plataforma: x.plataforma,
        formato: x.formato,
      })
      // Texto que a IA escreveu e a tela esconde é texto que ninguém
      // leu e todo mundo assinou. Abre junto.
      setDetalhes(true)
      setAvisos((d.achados ?? []).map((a: { texto: string }) => a.texto))
    } catch {
      setErro('A IA não respondeu. Tente de novo ou escreva à mão.')
    } finally {
      setEscrevendo(false)
    }
  }

  function salvar() {
    setErro(null)
    comecar(async () => {
      const r = await criarPauta(slug, planoId, c, motivo, ano, mes)
      if (r.precisaConfirmar) {
        setErro('Este mês já foi aprovado pelo cliente. Escreva o motivo antes de salvar.')
        return
      }
      if (!r.ok) {
        setErro(r.erro ?? 'Não consegui criar a pauta.')
        return
      }
      aoFechar()
      router.refresh()
    })
  }

  const faltaMotivo = mesAprovado && !motivo.trim()

  return (
    <div
      role="dialog"
      aria-label="Nova pauta"
      style={{ ...cartao, padding: '18px 20px', marginBottom: 16 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <b style={{ fontSize: 15 }}>Nova pauta</b>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          entra neste mês, em revisão interna
        </span>
      </div>

      {mesAprovado && (
        <div
          style={{
            padding: '13px 15px',
            borderRadius: 'var(--r)',
            background: 'var(--amarelo-wash)',
            borderLeft: '3px solid var(--warn)',
            fontSize: 13.5,
            lineHeight: 1.6,
            marginBottom: 14,
            maxWidth: 760,
          }}
        >
          <b>O cliente já aprovou este mês.</b> Acrescentar uma pauta desfaz essa aprovação:
          o mês volta para a equipe e esta peça vai precisar da resposta dele. As outras
          continuam aprovadas.
          <div style={{ marginTop: 10 }}>
            <label htmlFor="motivo-pauta" style={rotulo}>
              Por que esta pauta está entrando? O cliente vai ler.
            </label>
            <input
              id="motivo-pauta"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="O cliente pediu uma peça sobre a feira, por telefone."
              style={{ ...caixaTexto, background: 'var(--surface)', maxWidth: 620 }}
            />
          </div>
        </div>
      )}

      {podeIA && (
        <div style={{ marginBottom: 16, maxWidth: 760 }}>
          <label htmlFor="pedido-ia" style={rotulo}>
            Quer um rascunho? Diga em uma linha o que a pauta precisa ser.
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              id="pedido-ia"
              value={pedido}
              onChange={(e) => setPedido(e.target.value)}
              placeholder="Uma peça sobre a feira de setembro, com foco em quem já é cliente."
              disabled={escrevendo}
              style={{ ...caixaTexto, flex: 1, minWidth: 260 }}
            />
            <button
              onClick={preencherComIA}
              disabled={escrevendo || pendente}
              title="A IA lê a base da marca e as outras pautas do mês, e preenche o formulário. Nada é salvo."
              style={botao(false, escrevendo || pendente)}
            >
              {escrevendo ? 'Escrevendo…' : 'Preencher com IA'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 5 }}>
            Ela lê a base da marca e as outras pautas do mês para não repetir nenhuma. Preenche
            o formulário e não salva nada: a leitura e o salvar continuam seus.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
        <div>
          <label htmlFor="np-titulo" style={rotulo}>
            Título
          </label>
          <input
            id="np-titulo"
            value={c.title}
            onChange={(e) => muda('title')(e.target.value)}
            style={caixaTexto}
          />
        </div>

        <div>
          <label htmlFor="np-conceito" style={rotulo}>
            Conceito
          </label>
          <textarea
            id="np-conceito"
            value={c.concept}
            onChange={(e) => muda('concept')(e.target.value)}
            rows={2}
            style={{ ...caixaTexto, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor="np-linha" style={rotulo}>
              Linha editorial
            </label>
            <input
              id="np-linha"
              list="np-linhas"
              value={c.editorial_line}
              onChange={(e) => muda('editorial_line')(e.target.value)}
              style={caixaTexto}
            />
            <datalist id="np-linhas">
              {linhas.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <div style={{ flex: '0 0 150px' }}>
            <label htmlFor="np-data" style={rotulo}>
              Data
            </label>
            <input
              id="np-data"
              type="date"
              value={c.data}
              min={`${ano}-${String(mes).padStart(2, '0')}-01`}
              max={`${ano}-${String(mes).padStart(2, '0')}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`}
              onChange={(e) => muda('data')(e.target.value)}
              style={caixaTexto}
            />
          </div>
          <div style={{ flex: '0 0 160px' }}>
            <label htmlFor="np-plataforma" style={rotulo}>
              Canal
            </label>
            <select
              id="np-plataforma"
              value={c.plataforma}
              onChange={(e) => {
                const p = e.target.value
                setC((x) => ({ ...x, plataforma: p, formato: (FORMATOS[p] ?? ['Feed'])[0] }))
              }}
              style={caixaTexto}
            >
              {PLATAFORMAS.map((p) => (
                <option key={p} value={p}>
                  {NOME_DA_PLATAFORMA[p] ?? p}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '0 0 150px' }}>
            <label htmlFor="np-formato" style={rotulo}>
              Formato
            </label>
            <input
              id="np-formato"
              list="np-formatos"
              value={c.formato}
              onChange={(e) => muda('formato')(e.target.value)}
              style={caixaTexto}
            />
            <datalist id="np-formatos">
              {formatos.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <button
            onClick={() => setDetalhes((v) => !v)}
            style={{
              ...botao(false),
              padding: '5px 12px',
              fontSize: 12.5,
            }}
            aria-expanded={detalhes}
          >
            {detalhes ? 'esconder o resto' : 'descrição, tema, objetivo e justificativa'}
          </button>
        </div>

        {detalhes && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label htmlFor="np-descricao" style={rotulo}>
                Descrição
              </label>
              <textarea
                id="np-descricao"
                value={c.description}
                onChange={(e) => muda('description')(e.target.value)}
                rows={5}
                style={{ ...caixaTexto, resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label htmlFor="np-tema" style={rotulo}>
                  Tema
                </label>
                <input
                  id="np-tema"
                  value={c.theme}
                  onChange={(e) => muda('theme')(e.target.value)}
                  style={caixaTexto}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label htmlFor="np-objetivo" style={rotulo}>
                  Objetivo
                </label>
                <input
                  id="np-objetivo"
                  value={c.objective}
                  onChange={(e) => muda('objective')(e.target.value)}
                  style={caixaTexto}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label htmlFor="np-cta" style={rotulo}>
                  Chamada para ação
                </label>
                <input
                  id="np-cta"
                  value={c.cta}
                  onChange={(e) => muda('cta')(e.target.value)}
                  style={caixaTexto}
                />
              </div>
            </div>
            <div>
              <label htmlFor="np-justificativa" style={rotulo}>
                Justificativa
              </label>
              <textarea
                id="np-justificativa"
                value={c.rationale}
                onChange={(e) => muda('rationale')(e.target.value)}
                rows={3}
                style={{ ...caixaTexto, resize: 'vertical' }}
              />
            </div>
          </div>
        )}
      </div>

      {avisos.length > 0 && (
        <ul
          style={{
            margin: '14px 0 0',
            paddingLeft: 20,
            fontSize: 13,
            color: 'var(--muted)',
            maxWidth: 760,
          }}
        >
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {erro && (
        <div
          role="alert"
          style={{
            marginTop: 14,
            padding: '11px 14px',
            borderRadius: 'var(--r)',
            background: 'var(--laranja-wash)',
            fontSize: 13.3,
            maxWidth: 760,
          }}
        >
          {erro}
        </div>
      )}

      <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
        <button
          onClick={salvar}
          disabled={pendente || escrevendo || !c.title.trim() || faltaMotivo}
          style={botao(true, pendente || escrevendo || !c.title.trim() || faltaMotivo)}
        >
          {pendente
            ? 'Criando…'
            : mesAprovado
              ? 'Acrescentar e avisar o cliente'
              : 'Acrescentar ao mês'}
        </button>
        <button onClick={aoFechar} disabled={pendente} style={botao(false, pendente)}>
          cancelar
        </button>
      </div>
    </div>
  )
}
