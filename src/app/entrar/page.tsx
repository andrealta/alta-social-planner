'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { clienteNavegador } from '@/lib/supabase/client'

export default function Entrar() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const supabase = clienteNavegador()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      })
      if (error) {
        // As mensagens do Supabase vêm em inglês e técnicas demais.
        setErro(
          error.message.includes('Invalid login credentials')
            ? 'E-mail ou senha não conferem.'
            : error.message.includes('Email not confirmed')
              ? 'Esta conta ainda não foi confirmada.'
              : 'Não consegui entrar: ' + error.message,
        )
        return
      }
      router.push('/painel')
      router.refresh()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <svg
          viewBox="40 50 1845 415"
          width="88"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="85"
          strokeLinecap="butt"
          strokeLinejoin="round"
          role="img"
          aria-label="Alta"
          style={{ display: 'block', marginBottom: 10 }}
        >
          <path d="M75 345 L233.97 191.52 A62 62 0 0 1 320.03 191.52 L479 345" />
          <path d="M667 100 V337 A80 80 0 0 0 747 417 H955" />
          <path d="M965 97.5 H1167.5 A80 80 0 0 1 1247.5 177.5 V395" />
          <path d="M1447 345 L1605.97 191.52 A62 62 0 0 1 1692.03 191.52 L1851 345" />
        </svg>

        <h1
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 30,
            fontWeight: 600,
            lineHeight: 1.1,
            marginBottom: 6,
          }}
        >
          Social Planner
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 26 }}>
          Entre com a sua conta da Alta.
        </p>

        <form onSubmit={entrar}>
          <label
            htmlFor="email"
            style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 5 }}
          >
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={campo}
          />

          <label
            htmlFor="senha"
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 5,
              marginTop: 16,
            }}
          >
            Senha
          </label>
          <input
            id="senha"
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={campo}
          />

          {erro && (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: '10px 14px',
                borderLeft: '3px solid var(--accent)',
                background: 'var(--accent-wash)',
                color: 'var(--accent-2)',
                borderRadius: '0 8px 8px 0',
                fontSize: 13.3,
                lineHeight: 1.5,
              }}
            >
              {erro}
            </div>
          )}

          <button type="submit" disabled={enviando} style={botao(enviando)}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p
          style={{
            marginTop: 22,
            fontSize: 12.5,
            color: 'var(--faint)',
            lineHeight: 1.55,
          }}
        >
          Para cadastrar um novo acesso entre em contato com o atendimento da
          sua marca.
        </p>
      </div>
    </main>
  )
}

const campo: React.CSSProperties = {
  width: '100%',
  fontSize: 14.5,
  fontFamily: 'inherit',
  padding: '10px 12px',
  border: '1px solid var(--line-2)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text)',
}

function botao(desabilitado: boolean): React.CSSProperties {
  return {
    width: '100%',
    marginTop: 22,
    padding: '11px 16px',
    fontSize: 14.5,
    fontWeight: 700,
    fontFamily: 'inherit',
    color: 'var(--paper)',
    background: 'var(--text)',
    border: 'none',
    borderRadius: 8,
    cursor: desabilitado ? 'not-allowed' : 'pointer',
    opacity: desabilitado ? 0.5 : 1,
  }
}
