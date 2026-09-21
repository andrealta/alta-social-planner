'use server'

import { createClient } from '@supabase/supabase-js'
import { clienteServidor } from '@/lib/supabase/server'
import { ambienteSupabase } from '@/lib/supabase/env'

export type Resultado = { ok: boolean; erro?: string }

const MINIMO = 8

/**
 * A pessoa troca a própria senha.
 *
 * Pede a senha ATUAL antes. Sem isso, qualquer um que achasse o
 * computador de alguém com a sessão aberta poderia trocar a senha e
 * tomar a conta — e a pessoa descobriria só quando não conseguisse
 * mais entrar.
 *
 * A conferência da senha atual usa um cliente separado, que não grava
 * cookie: um login "de teste" que não mexe na sessão aberta. Se a
 * senha estiver certa, a troca é feita na sessão de verdade.
 *
 * Nenhuma senha passa por log, banco ou tela. O Supabase guarda só o
 * resumo criptográfico dela.
 */
export async function trocarSenha(atual: string, nova: string): Promise<Resultado> {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  if (!atual) return { ok: false, erro: 'Digite a sua senha atual.' }
  if ((nova ?? '').length < MINIMO) {
    return { ok: false, erro: `A senha nova precisa ter pelo menos ${MINIMO} caracteres.` }
  }
  if (nova === atual) return { ok: false, erro: 'A senha nova é igual à atual.' }

  const { url, chave } = ambienteSupabase()
  const conferencia = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error: errado } = await conferencia.auth.signInWithPassword({
    email: user.email,
    password: atual,
  })
  if (errado) return { ok: false, erro: 'A senha atual não confere.' }
  // O login de conferência não serve para mais nada.
  await conferencia.auth.signOut().catch(() => {})

  const { error } = await supabase.auth.updateUser({ password: nova })
  if (error) {
    const m = error.message
    return {
      ok: false,
      erro: /weak|short|characters/i.test(m)
        ? 'O Supabase recusou a senha por ser fraca. Use letras, números e pelo menos 8 caracteres.'
        : /same|different/i.test(m)
          ? 'A senha nova é igual à atual.'
          : /reauth/i.test(m)
            ? 'O Supabase está pedindo confirmação extra para trocar senha. Saia, entre de novo e tente logo em seguida.'
            : 'Não consegui trocar a senha: ' + m,
    }
  }

  return { ok: true }
}
