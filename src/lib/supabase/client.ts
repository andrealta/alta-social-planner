'use client'

import { createBrowserClient } from '@supabase/ssr'
import { ambienteSupabase } from './env'

/** Cliente do Supabase para código que roda no navegador. */
export function clienteNavegador() {
  const { url, chave } = ambienteSupabase()
  return createBrowserClient(url, chave)
}
