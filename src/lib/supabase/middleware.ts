import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ambienteSupabase } from './env'

/** Rotas que exigem estar logado. */
const PROTEGIDAS = ['/painel', '/cliente', '/conta']

/**
 * Renova a sessão a cada navegação e decide quem entra onde.
 *
 * Usa getUser() e não getSession(): getSession apenas lê o cookie, que
 * o navegador pode ter adulterado. getUser pergunta ao Supabase se o
 * token é válido de verdade.
 */
export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request })

  const { url, chave } = ambienteSupabase()

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(paraGravar) {
        paraGravar.forEach(({ name, value }) => request.cookies.set(name, value))
        resposta = NextResponse.next({ request })
        paraGravar.forEach(({ name, value, options }) =>
          resposta.cookies.set(name, value, options),
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const caminho = request.nextUrl.pathname
  const precisaLogin = PROTEGIDAS.some((p) => caminho.startsWith(p))

  if (!user && precisaLogin) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/entrar'
    destino.searchParams.set('de', caminho)
    return NextResponse.redirect(destino)
  }

  if (user && caminho === '/entrar') {
    const destino = request.nextUrl.clone()
    destino.pathname = '/painel'
    destino.search = ''
    return NextResponse.redirect(destino)
  }

  return resposta
}
