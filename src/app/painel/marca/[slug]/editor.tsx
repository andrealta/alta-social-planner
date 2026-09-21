'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SECOES,
  CAMPOS_CRITICOS,
  contar,
  situacao,
  type Situacao,
} from '@/lib/base'
import { salvarBase } from './acoes'

type Valores = Record<string, Record<string, string>>

const COR: Record<Situacao, { fundo: string; texto: string; rotulo: string }> = {
  vazio: { fundo: 'var(--surface-3)', texto: 'var(--faint)', rotulo: 'vazio' },
  pendente: { fundo: 'var(--warn-wash)', texto: 'var(--warn)', rotulo: 'a confirmar' },
  ok: { fundo: 'var(--ok-wash)', texto: 'var(--ok)', rotulo: 'preenchido' },
}

function clonar(v: Valores): Valores {
  const out: Valores = {}
  for (const s of SECOES) out[s.chave] = { ...(v[s.chave] ?? {}) }
  return out
}

/** Auto-ajusta a altura conforme o texto, sem barra de rolagem interna. */
function Campo({
  valor,
  onChange,
  id,
}: {
  valor: string
  onChange: (v: string) => void
  id: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const ajustar = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(64, el.scrollHeight + 2) + 'px'
  }, [])

  useEffect(ajustar, [ajustar, valor])

  return (
    <textarea
      id={id}
      ref={ref}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      spellCheck
      style={{
        width: '100%',
        minHeight: 64,
        resize: 'vertical',
        padding: '11px 13px',
        fontFamily: 'inherit',
        fontSize: 14,
        lineHeight: 1.62,
        color: 'var(--text)',
        background: 'var(--surface)',
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--r)',
        outline: 'none',
        overflow: 'hidden',
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line-2)')}
    />
  )
}

export function Editor({
  slug,
  iniciais,
  podeEditar,
}: {
  slug: string
  iniciais: Valores
  podeEditar: boolean
}) {
  const [valores, setValores] = useState<Valores>(() => clonar(iniciais))
  const [gravados, setGravados] = useState<Valores>(() => clonar(iniciais))
  const [aba, setAba] = useState(SECOES[0].chave)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const sujas = useMemo(() => {
    const set = new Set<string>()
    for (const s of SECOES) {
      for (const c of s.campos) {
        if ((valores[s.chave]?.[c.id] ?? '') !== (gravados[s.chave]?.[c.id] ?? '')) {
          set.add(s.chave)
          break
        }
      }
    }
    return set
  }, [valores, gravados])

  const total = useMemo(() => contar(valores), [valores])

  // Sair da página com alteração não salva é o jeito mais fácil de
  // perder meia hora de trabalho. O navegador pergunta antes.
  useEffect(() => {
    if (sujas.size === 0) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [sujas.size])

  const salvar = useCallback(async () => {
    if (sujas.size === 0 || salvando || !podeEditar) return
    setSalvando(true)
    setAviso(null)

    const pacote: Valores = {}
    for (const chave of sujas) pacote[chave] = valores[chave] ?? {}
    const enviado = clonar(valores)

    try {
      const r = await salvarBase(slug, pacote)
      if (r.ok) {
        setGravados(enviado)
        setAviso({
          tipo: 'ok',
          texto: `Salvo. ${r.salvas} ${r.salvas === 1 ? 'seção atualizada' : 'seções atualizadas'}.`,
        })
      } else {
        setAviso({ tipo: 'erro', texto: r.erro ?? 'Não consegui salvar.' })
      }
    } catch {
      setAviso({ tipo: 'erro', texto: 'A gravação não completou. Confira a conexão e tente de novo.' })
    } finally {
      setSalvando(false)
    }
  }, [sujas, salvando, podeEditar, valores, slug])

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void salvar()
      }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [salvar])

  useEffect(() => {
    if (aviso?.tipo !== 'ok') return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  const secao = SECOES.find((s) => s.chave === aba) ?? SECOES[0]

  function mudar(chaveSecao: string, campo: string, v: string) {
    setValores((antes) => ({
      ...antes,
      [chaveSecao]: { ...(antes[chaveSecao] ?? {}), [campo]: v },
    }))
  }

  return (
    <div style={{ marginTop: 26, paddingBottom: sujas.size > 0 ? 96 : 24 }}>
      {/* barra de completude */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          padding: '14px 18px',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow)',
          marginBottom: 20,
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', background: 'var(--surface-3)' }}>
            <div style={{ width: `${(total.ok / total.total) * 100}%`, background: 'var(--ok)' }} />
            <div style={{ width: `${(total.pendente / total.total) * 100}%`, background: 'var(--warn)' }} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 7 }}>
            {total.ok} resolvidos · {total.pendente} a confirmar · {total.vazio} vazios ·{' '}
            {total.total} campos
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* abas */}
        <nav
          style={{
            flex: '0 0 226px',
            minWidth: 200,
            position: 'sticky',
            top: 16,
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            overflow: 'hidden',
          }}
        >
          {SECOES.map((s, i) => {
            const c = contar(valores, [s])
            const ativa = s.chave === aba
            return (
              <button
                key={s.chave}
                onClick={() => setAba(s.chave)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '11px 14px',
                  border: 'none',
                  borderBottom: i === SECOES.length - 1 ? 'none' : '1px solid var(--line)',
                  borderLeft: `3px solid ${ativa ? 'var(--accent)' : 'transparent'}`,
                  background: ativa ? 'var(--surface-2)' : 'transparent',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  fontSize: 13.5,
                  fontWeight: ativa ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span>
                    {s.titulo}
                    {sujas.has(s.chave) && (
                      <span title="alterações não salvas" style={{ color: 'var(--accent)', marginLeft: 5 }}>
                        •
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {c.ok}/{c.total}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>

        {/* campos */}
        <section style={{ flex: '1 1 380px', minWidth: 300 }}>
          <h2
            style={{
              fontFamily: 'var(--disp)',
              fontSize: 22,
              fontWeight: 600,
              lineHeight: 1.15,
            }}
          >
            {secao.titulo}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 3, marginBottom: 18 }}>
            {secao.resumo}
          </p>

          {secao.campos.map((campo) => {
            const v = valores[secao.chave]?.[campo.id] ?? ''
            const st = situacao(v)
            const critico = CAMPOS_CRITICOS.includes(campo.id)
            return (
              <div key={campo.id} style={{ marginBottom: 22 }}>
                <label
                  htmlFor={`c-${campo.id}`}
                  style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}
                >
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{campo.rotulo}</span>
                  {critico && (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: '.08em',
                        textTransform: 'uppercase',
                        color: 'var(--accent)',
                      }}
                    >
                      essencial
                    </span>
                  )}
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 9px',
                      borderRadius: 99,
                      background: COR[st].fundo,
                      color: COR[st].texto,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {COR[st].rotulo}
                  </span>
                </label>
                <p style={{ color: 'var(--muted)', fontSize: 12.6, marginBottom: 7, lineHeight: 1.5 }}>
                  {campo.ajuda}
                </p>
                {podeEditar ? (
                  <Campo
                    id={`c-${campo.id}`}
                    valor={v}
                    onChange={(novo) => mudar(secao.chave, campo.id, novo)}
                  />
                ) : (
                  <div
                    style={{
                      padding: '11px 13px',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r)',
                      background: 'var(--surface-2)',
                      fontSize: 14,
                      lineHeight: 1.62,
                      whiteSpace: 'pre-wrap',
                      color: v ? 'var(--text)' : 'var(--faint)',
                    }}
                  >
                    {v || 'não preenchido'}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      </div>

      {/* barra de salvar */}
      {podeEditar && (sujas.size > 0 || aviso) && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            borderTop: '1px solid var(--line-2)',
            background: 'var(--surface)',
            boxShadow: '0 -2px 12px rgba(0,0,0,.08)',
          }}
        >
          <div
            style={{
              maxWidth: 980,
              margin: '0 auto',
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 13.5, color: aviso?.tipo === 'erro' ? 'var(--accent)' : 'var(--muted)', flex: 1, minWidth: 180 }}>
              {aviso
                ? aviso.texto
                : `${sujas.size} ${sujas.size === 1 ? 'seção alterada' : 'seções alteradas'} e ainda não salva${sujas.size === 1 ? '' : 's'}.`}
            </span>
            {sujas.size > 0 && (
              <>
                <button
                  onClick={() => {
                    setValores(clonar(gravados))
                    setAviso(null)
                  }}
                  disabled={salvando}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 13.5,
                    fontWeight: 600,
                    padding: '9px 16px',
                    border: '1px solid var(--line-2)',
                    borderRadius: 8,
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    cursor: salvando ? 'not-allowed' : 'pointer',
                  }}
                >
                  Descartar
                </button>
                <button
                  onClick={salvar}
                  disabled={salvando}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 13.5,
                    fontWeight: 700,
                    padding: '9px 20px',
                    border: 'none',
                    borderRadius: 8,
                    background: 'var(--text)',
                    color: 'var(--paper)',
                    cursor: salvando ? 'not-allowed' : 'pointer',
                    opacity: salvando ? 0.6 : 1,
                  }}
                >
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
