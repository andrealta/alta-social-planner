'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { clienteNavegador } from '@/lib/supabase/client'

export function Sair() {
  const router = useRouter()
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    setSaindo(true)
    const supabase = clienteNavegador()
    await supabase.auth.signOut()
    router.push('/entrar')
    router.refresh()
  }

  return (
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
  )
}
