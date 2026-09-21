'use client'

import { useState } from 'react'
import { botao, caixaTexto } from '@/lib/visual'
import { trocarSenha } from './acoes'

/**
 * O formulário de troca de senha.
 *
 * A senha nova é pedida duas vezes: errar um caractere numa senha que
 * não aparece na tela é fácil, e a pessoa só descobriria no próximo
 * login.
 */
export function TrocarSenha() {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repete, setRepete] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(false)

  const diferentes = repete.length > 0 && nova !== repete
  const curta = nova.length > 0 && nova.length < 8
  const pronto = atual.length > 0 && nova.length >= 8 && nova === repete

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!pronto || salvando) return
    setSalvando(true)
    setErro(null)
    const r = await trocarSenha(atual, nova)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui trocar a senha.')
      return
    }
    setAtual('')
    setNova('')
    setRepete('')
    setFeito(true)
  }

  const rotulo: React.CSSProperties = {
    display: 'block',
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 5,
  }
  const campo: React.CSSProperties = { ...caixaTexto, width: '100%' }

  return (
    <form onSubmit={salvar} style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
      {feito && (
        <div
          role="status"
          style={{
            padding: '12px 15px',
            borderRadius: 'var(--r)',
            background: 'var(--ok-wash)',
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          <b>Senha trocada.</b> Da próxima vez que entrar, use a senha nova.
        </div>
      )}
      {erro && (
        <div
          role="alert"
          style={{
            padding: '12px 15px',
            borderRadius: 'var(--r)',
            background: 'var(--laranja-wash)',
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          {erro}
        </div>
      )}

      <label>
        <span style={rotulo}>Senha atual</span>
        <input
          type="password"
          value={atual}
          onChange={(e) => {
            setAtual(e.target.value)
            setFeito(false)
          }}
          autoComplete="current-password"
          style={campo}
        />
      </label>

      <label>
        <span style={rotulo}>Senha nova</span>
        <input
          type="password"
          value={nova}
          onChange={(e) => {
            setNova(e.target.value)
            setFeito(false)
          }}
          autoComplete="new-password"
          style={campo}
        />
        <span style={{ display: 'block', fontSize: 12, color: curta ? 'var(--laranja-tinta)' : 'var(--faint)', marginTop: 4 }}>
          Pelo menos 8 caracteres.
        </span>
      </label>

      <label>
        <span style={rotulo}>Repita a senha nova</span>
        <input
          type="password"
          value={repete}
          onChange={(e) => {
            setRepete(e.target.value)
            setFeito(false)
          }}
          autoComplete="new-password"
          style={campo}
        />
        {diferentes && (
          <span style={{ display: 'block', fontSize: 12, color: 'var(--laranja-tinta)', marginTop: 4 }}>
            As duas não estão iguais.
          </span>
        )}
      </label>

      <div>
        <button type="submit" disabled={!pronto || salvando} style={botao(true, !pronto || salvando)}>
          {salvando ? 'Trocando…' : 'Trocar senha'}
        </button>
      </div>
    </form>
  )
}
