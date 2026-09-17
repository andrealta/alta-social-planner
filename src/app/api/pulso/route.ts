/**
 * Rota de diagnóstico: manda uma linha a cada meio segundo, dez vezes.
 *
 * Serve para separar duas coisas que se parecem na tela: "a geração
 * está demorando" e "a resposta está chegando toda de uma vez no fim".
 * Se as linhas aparecem espaçadas, o fluxo funciona. Se aparecem todas
 * juntas aos 5 segundos, alguma camada está segurando o corpo.
 *
 * Não lê nem escreve nada. Pode apagar quando o sistema estabilizar.
 */

import { clienteServidor } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Exige estar logado. A rota e inofensiva no conteudo, mas segura
  // uma conexao por cinco segundos, e na Vercel tempo de execucao e
  // dinheiro. Endereco publico que custa a cada chamada nao fica
  // aberto sem motivo.
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Entre no sistema para usar esta conferencia.', { status: 401 })
  }

  const cod = new TextEncoder()
  const t0 = Date.now()

  const fluxo = new ReadableStream<Uint8Array>({
    async start(c) {
      for (let i = 1; i <= 10; i++) {
        c.enqueue(cod.encode(JSON.stringify({ i, ms: Date.now() - t0 }) + '\n'))
        await new Promise((r) => setTimeout(r, 500))
      }
      c.close()
    },
  })

  return new Response(fluxo, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
