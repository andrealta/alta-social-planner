'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { clienteNavegador } from '@/lib/supabase/client'

export function Sair() {
  const router = useRouter()
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    setSaindo(true)
    const supabase = clienteNavegador()
    // Escopo LOCAL: sai deste navegador, e só dele. O padrão do
    // Supabase é global, que encerra a sessão da pessoa em todos os
    // aparelhos em que ela entrou. Quem sai no computador da agência
    // não espera cair do celular junto, e um cliente que sai do
    // celular no meio da aprovação não pode perder a janela que deixou
    // aberta no computador. A documentação do próprio pacote
    // recomenda local para o botão de sair.
    await supabase.auth.signOut({ scope: 'local' })
    router.push('/entrar')
    router.refresh()
  }

  // "Minha conta" mora junto do "Sair" porque os dois aparecem em
  // todo topo de tela, da equipe e do cliente — e é ali que a pessoa
  // procura quando quer mexer na própria conta.
  return (
    <>
    <Link
      href="/conta"
      style={{
        fontSize: 13,
        fontWeight: 600,
        padding: '8px 4px',
        color: 'var(--muted)',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      Minha conta
    </Link>
    <button
      onClick={sair}
      disabled={saindo}
      style={{
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'inherit',
        padding: '8px 14px',
        border: '1px solid var(--line-2)',
        borderRadius: 8,
        background: 'var(--surface)',
        color: 'var(--text)',
        cursor: saindo ? 'not-allowed' : 'pointer',
        opacity: saindo ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
    </>
  )
}
