import type { NextRequest } from 'next/server'
import { atualizarSessao } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await atualizarSessao(request)
}

export const config = {
  matcher: [
    /*
     * Roda em tudo, menos arquivos estáticos e imagens — não há sessão
     * para renovar num ícone, e cada execução aqui é uma chamada ao
     * Supabase.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
