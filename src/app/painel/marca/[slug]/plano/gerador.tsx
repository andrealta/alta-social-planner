'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MESES } from '@/lib/prompt'
import { lerDinheiro, reais } from '@/lib/midia'

type Achado = { gravidade: 'erro' | 'aviso'; texto: string }

type Estado =
  | { fase: 'parado' }
  | { fase: 'confirmar'; mensagem: string }
  | {
      fase: 'gerando'
      etapa: 'esperando' | 'conectado' | 'pensando' | 'escrevendo'
      chars: number
      segundos: number
    }
  | { fase: 'erro'; mensagem: string }

export function Gerador({
  slug,
  mesInicial,
  anoInicial,
  pecas,
}: {
  slug: string
  mesInicial: number
  anoInicial: number
  pecas: number
}) {
  const router = useRouter()
  const [mes, setMes] = useState(mesInicial)
  const [ano, setAno] = useState(anoInicial)
  const [briefing, setBriefing] = useState('')
  const [verba, setVerba] = useState('')
  const [estado, setEstado] = useState<Estado>({ fase: 'parado' })
  const [achados, setAchados] = useState<Achado[]>([])
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null)

  const gerando = estado.fase === 'gerando'

  function pararRelogio() {
    if (relogio.current) {
      clearInterval(relogio.current)
      relogio.current = null
    }
  }

  async function gerar(substituir = false) {
    setAchados([])
    setEstado({ fase: 'gerando', etapa: 'esperando', chars: 0, segundos: 0 })

    pararRelogio()
    relogio.current = setInterval(() => {
      setEstado((e) => (e.fase === 'gerando' ? { ...e, segundos: e.segundos + 1 } : e))
    }, 1000)

    try {
      const r = await fetch('/api/planejamento', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          mes,
          ano,
          briefing,
          investimento: lerDinheiro(verba),
          substituir,
        }),
      })

      if (!r.ok && r.headers.get('content-type')?.includes('application/json')) {
        const corpo = await r.json()
        pararRelogio()
        if (corpo.tipo === 'confirmar') {
          setEstado({ fase: 'confirmar', mensagem: corpo.mensagem })
        } else {
          setEstado({ fase: 'erro', mensagem: corpo.mensagem ?? 'Não consegui gerar.' })
        }
        return
      }

      if (!r.body) throw new Error('A resposta veio vazia.')

      const leitor = r.body.getReader()
      const dec = new TextDecoder()
      let sobra = ''

      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        sobra += dec.decode(value, { stream: true })
        const linhas = sobra.split('\n')
        sobra = linhas.pop() ?? ''

        for (const l of linhas) {
          if (!l.trim()) continue
          let ev: Record<string, unknown>
          try {
            ev = JSON.parse(l)
          } catch {
            continue
          }

          if (ev.tipo === 'conectado') {
            setEstado((e) => (e.fase === 'gerando' && e.etapa === 'esperando' ? { ...e, etapa: 'conectado' } : e))
          } else if (ev.tipo === 'pulso') {
            // Só confirma que a espera segue viva; o relógio é local.
          } else if (ev.tipo === 'progresso') {
            const chars = Number(ev.chars) || 0
            const etapa = ev.fase === 'escrevendo' ? 'escrevendo' : 'pensando'
            setEstado((e) => (e.fase === 'gerando' ? { ...e, chars, etapa } : e))
          } else if (ev.tipo === 'conferencia') {
            setAchados((ev.achados as Achado[]) ?? [])
          } else if (ev.tipo === 'erro') {
            pararRelogio()
            setEstado({ fase: 'erro', mensagem: String(ev.mensagem) })
            return
          } else if (ev.tipo === 'fim') {
            pararRelogio()
            router.push(`/painel/marca/${slug}/plano/${ano}/${mes}`)
            router.refresh()
            return
          }
        }
      }

      pararRelogio()
      setEstado({ fase: 'erro', mensagem: 'A conexão caiu antes de a geração terminar.' })
    } catch (e) {
      pararRelogio()
      setEstado({
        fase: 'erro',
        mensagem: e instanceof Error ? e.message : 'Algo deu errado.',
      })
    }
  }

  const anos = [anoInicial - 1, anoInicial, anoInicial + 1]

  return (
    <div
      style={{
        marginTop: 0,
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow)',
        padding: 20,
      }}
    >
      <h2 style={{ fontFamily: 'var(--disp)', fontSize: 19, fontWeight: 600 }}>Gerar planejamento</h2>
      <div style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, marginTop: 3, marginBottom: 16 }}>
        <p>
          São {pecas} peças por mês, conforme previsto em contrato. Antes de começar a
          escrever, o modelo pode passar alguns minutos pensando, cruzando informações e
          organizando as ideias. Nessa etapa, é normal o contador parecer parado.
        </p>
        <p style={{ marginTop: 6 }}>
          O processo completo costuma levar de <b>4 a 8 minutos</b>.
        </p>
        <p style={{ marginTop: 6 }}>
          Tempo suficiente para pegar um café, esticar as pernas e voltar com tudo pronto.
          Só não feche a aba enquanto isso. ☕
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          disabled={gerando}
          style={campoSelect}
        >
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          disabled={gerando}
          style={campoSelect}
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <label htmlFor="briefing" style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>
        Obrigatoriedades do mês
      </label>
      <p style={{ color: 'var(--muted)', fontSize: 12.6, margin: '2px 0 7px', lineHeight: 1.5 }}>
        Lançamento, campanha, data que o cliente pediu, promoção combinada. Escreva
        como você falaria com a equipe. Deixe em branco se não houver.
      </p>
      <textarea
        id="briefing"
        value={briefing}
        onChange={(e) => setBriefing(e.target.value)}
        disabled={gerando}
        rows={4}
        placeholder="Ex.: lançamento da linha 100% Fruta na segunda quinzena; o cliente pediu uma peça sobre a fábrica."
        style={{
          width: '100%',
          resize: 'vertical',
          padding: '11px 13px',
          fontFamily: 'inherit',
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--text)',
          background: gerando ? 'var(--surface-2)' : 'var(--surface)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r)',
          outline: 'none',
        }}
      />

      <div style={{ marginTop: 18 }}>
        <label htmlFor="verba" style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>
          Investimento em mídia no mês{' '}
          <span style={{ fontWeight: 500, color: 'var(--muted)' }}>(opcional)</span>
        </label>
        <p style={{ color: 'var(--muted)', fontSize: 12.6, margin: '2px 0 7px', lineHeight: 1.5 }}>
          Quanto o cliente vai investir em tráfego no mês, no total. Com este valor
          preenchido, a IA decide o objetivo de campanha na Meta de cada publicação e
          quanto da verba vai em cada uma, sem nunca passar do total. Se houver
          direcionamento de como distribuir, escreva nas obrigatoriedades acima. Em
          branco, o mês sai sem plano de mídia.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 13,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)',
                fontSize: 14,
                pointerEvents: 'none',
              }}
            >
              R$
            </span>
            <input
              id="verba"
              value={verba}
              onChange={(ev) => setVerba(ev.target.value)}
              disabled={gerando}
              inputMode="decimal"
              placeholder="0,00"
              style={{
                width: 190,
                padding: '11px 13px 11px 40px',
                fontFamily: 'inherit',
                fontSize: 14,
                color: 'var(--text)',
                background: gerando ? 'var(--surface-2)' : 'var(--surface)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r)',
                outline: 'none',
              }}
            />
          </div>
          {lerDinheiro(verba) !== null && (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {reais(lerDinheiro(verba))} para distribuir entre as {pecas} peças do mês.
            </span>
          )}
          {verba.trim() !== '' && lerDinheiro(verba) === null && (
            <span style={{ fontSize: 13, color: 'var(--laranja-tinta)' }}>
              Não entendi este valor. Escreva só o número, como 3.500 ou 3500,00.
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button
          onClick={() => gerar(estado.fase === 'confirmar')}
          disabled={gerando}
          style={{
            fontFamily: 'inherit',
            fontSize: 14.5,
            fontWeight: 700,
            padding: '11px 22px',
            border: 'none',
            borderRadius: 8,
            background: estado.fase === 'confirmar' ? 'var(--accent)' : 'var(--text)',
            color: estado.fase === 'confirmar' ? '#fff' : 'var(--paper)',
            cursor: gerando ? 'progress' : 'pointer',
            opacity: gerando ? 0.6 : 1,
          }}
        >
          {gerando
            ? 'Gerando…'
            : estado.fase === 'confirmar'
              ? 'Substituir mesmo assim'
              : `Gerar ${MESES[mes - 1]}`}
        </button>

        {gerando && (
          <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
            {estado.segundos}s ·{' '}
            {estado.etapa === 'esperando'
              ? 'abrindo a conexão com a Anthropic…'
              : estado.etapa === 'conectado'
                ? 'conectado, esperando a resposta começar…'
                : estado.etapa === 'pensando'
                  ? 'raciocinando… (esta é a parte longa)'
                  : `escrevendo · ${estado.chars.toLocaleString('pt-BR')} caracteres`}
          </span>
        )}
      </div>

      {gerando && (
        <div
          style={{
            marginTop: 12,
            height: 4,
            borderRadius: 99,
            background: 'var(--surface-3)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width:
                estado.etapa === 'escrevendo'
                  ? `${Math.max(32, Math.min(97, (estado.chars / (pecas * 620 + 1200)) * 100))}%`
                  : `${Math.min(30, 4 + estado.segundos * 0.5)}%`,
              background: estado.etapa === 'escrevendo' ? 'var(--ok)' : 'var(--warn)',
              transition: 'width .4s ease',
            }}
          />
        </div>
      )}

      {estado.fase === 'confirmar' && (
        <Caixa cor="warn">{estado.mensagem}</Caixa>
      )}

      {estado.fase === 'erro' && <Caixa cor="accent">{estado.mensagem}</Caixa>}

      {achados.length > 0 && (
        <Caixa cor={achados.some((a) => a.gravidade === 'erro') ? 'accent' : 'warn'}>
          <b style={{ display: 'block', marginBottom: 5 }}>A conferência encontrou:</b>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {achados.map((a, i) => (
              <li key={i}>{a.texto}</li>
            ))}
          </ul>
        </Caixa>
      )}
    </div>
  )
}

const campoSelect: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 14,
  padding: '9px 12px',
  border: '1px solid var(--line-2)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text)',
}

function Caixa({ cor, children }: { cor: 'warn' | 'accent'; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: '13px 16px',
        border: '1px solid var(--line)',
        borderLeft: `3px solid var(--${cor})`,
        borderRadius: `0 var(--r) var(--r) 0`,
        background: `var(--${cor}-wash)`,
        fontSize: 13.5,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  )
}
