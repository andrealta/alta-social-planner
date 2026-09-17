import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ambienteSupabase } from './env'

/**
 * Cliente do Supabase para código que roda no servidor.
 *
 * Toda consulta feita por aqui carrega a identidade de quem está
 * logado, então as políticas de isolamento do banco valem para ela.
 * É de propósito: a segurança não depende de a gente lembrar de
 * filtrar por marca em cada consulta.
 */
export async function clienteServidor() {
  const { url, chave } = ambienteSupabase()
  const cookieStore = await cookies()

  return createServerClient(url, chave, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(paraGravar) {
        try {
          paraGravar.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Componente de servidor não pode gravar cookie. O middleware
          // já cuida da renovação da sessão, então ignorar aqui é seguro.
        }
      },
    },
  })
}
