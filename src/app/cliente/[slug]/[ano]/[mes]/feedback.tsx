'use client'

import { useState } from 'react'
import { botao, caixaTexto } from '@/lib/visual'
import { salvarFeedback } from './acoes'

/**
 * O feedback geral do cliente sobre o mês.
 *
 * Dois campos, e não um, porque o que funcionou e o que precisa mudar
 * são usados de jeitos diferentes: um diz o que repetir, o outro vira
 * regra para os próximos meses. Os dois entram no aprendizado da IA.
 *
 * Pode voltar e corrigir quando quiser — é uma ficha, não uma mensagem.
 */
export function FeedbackDoMes({
  slug,
  ano,
  mes,
  inicial,
}: {
  slug: string
  ano: number
  mes: number
  inicial: { destaques: string; atencao: string; em: string | null } | null
}) {
  const [destaques, setDestaques] = useState(inicial?.destaques ?? '')
  const [atencao, setAtencao] = useState(inicial?.atencao ?? '')
  const [salvoEm, setSalvoEm] = useState<string | null>(inicial?.em ?? null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [base, setBase] = useState({ d: inicial?.destaques ?? '', a: inicial?.atencao ?? '' })

  const mudou = destaques.trim() !== base.d.trim() || atencao.trim() !== base.a.trim()
  const vazio = !destaques.trim() && !atencao.trim()

  async function salvar() {
    setSalvando(true)
    setErro(null)
    const r = await salvarFeedback(slug, ano, mes, destaques, atencao)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui salvar.')
      return
    }
    setBase({ d: destaques, a: atencao })
    setSalvoEm(new Date().toISOString())
  }

  const rotulo: React.CSSProperties = { display: 'block', fontWeight: 600, fontSize: 13.5, marginBottom: 5 }

  return (
    <section
      style={{
        marginTop: 34,
        padding: '22px 24px',
        borderRadius: 'var(--r-lg)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <h2 style={{ fontFamily: 'var(--disp)', fontSize: 19, fontWeight: 600, letterSpacing: '-.01em' }}>
        Seu feedback sobre o mês
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: 13.8, lineHeight: 1.6, marginTop: 4, marginBottom: 16 }}>
        Um balanço do mês inteiro, além das publicações: destaques, elogios e o que merece
        atenção nos próximos. A equipe da Alta lê, e isso ajuda os próximos planejamentos a
        ficarem cada vez mais a cara da sua marca.
      </p>

      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          <span style={rotulo}>O que funcionou bem: destaques e elogios</span>
          <textarea
            value={destaques}
            onChange={(e) => setDestaques(e.target.value)}
            rows={3}
            placeholder="Ex.: Gostei muito dos carrosséis de bastidores e do tom mais leve."
            style={{ ...caixaTexto, width: '100%', resize: 'vertical', lineHeight: 1.6 }}
          />
        </label>
        <label>
          <span style={rotulo}>Pontos de atenção para os próximos meses</span>
          <textarea
            value={atencao}
            onChange={(e) => setAtencao(e.target.value)}
            rows={3}
            placeholder="Ex.: Queremos menos vídeos e mais conteúdo sobre os produtos novos."
            style={{ ...caixaTexto, width: '100%', resize: 'vertical', lineHeight: 1.6 }}
          />
        </label>
      </div>

      {erro && (
        <div role="alert" style={{ fontSize: 13, color: 'var(--laranja-tinta)', marginTop: 8 }}>
          {erro}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <button onClick={salvar} disabled={!mudou || vazio || salvando} style={botao(true, !mudou || vazio || salvando)}>
          {salvando ? 'Enviando…' : salvoEm ? 'Atualizar feedback' : 'Enviar feedback'}
        </button>
        {salvoEm && !mudou && (
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Recebido em {new Date(salvoEm).toLocaleDateString('pt-BR')}. Obrigado! Você pode
            voltar e editar quando quiser.
          </span>
        )}
      </div>
    </section>
  )
}
