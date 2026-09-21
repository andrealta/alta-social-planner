/**
 * Cliente administrativo do Supabase. Só existe para criar e convidar
 * pessoas — nada mais.
 *
 * ================== LEIA ISTO ANTES DE USAR ==================
 *
 * Esta chave passa POR CIMA de todo o isolamento entre marcas. Com
 * ela, qualquer consulta enxerga qualquer dado de qualquer cliente.
 * As políticas do banco, que são a espinha de segurança do sistema,
 * simplesmente não valem aqui.
 *
 * Por isso:
 *
 *  1. o nome da variável NÃO começa com NEXT_PUBLIC_, e nunca pode
 *     começar. É esse prefixo que decide o que vai para o navegador;
 *  2. este arquivo só é importado por código de servidor. A guarda
 *     abaixo estoura se alguém importar do lado do navegador;
 *  3. use `clienteServidor()` para TUDO que não seja criar pessoa.
 *     Aquele carrega a identidade de quem está logado e respeita as
 *     políticas. Este não respeita nada.
 *
 * Se a chave vazar, a saída é gerar outra no painel do Supabase
 * (Settings → API → service_role → Reset). A antiga morre na hora.
 * =============================================================
 */

import { createClient } from '@supabase/supabase-js'

export function clienteAdmin() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'clienteAdmin() foi chamado no navegador. Isto é um erro grave de programação: ' +
        'a chave de serviço nunca pode sair do servidor.',
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL não está definida.')
  if (!chave) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não está definida. Sem ela dá para mudar papel e vincular ' +
        'marca, mas não dá para criar pessoa nova. Pegue em Settings → API no painel do ' +
        'Supabase e acrescente ao .env.local, sem NEXT_PUBLIC_ no nome.',
    )
  }

  const problema = chaveErrada(chave)
  if (problema) throw new Error(problema)

  return createClient(url, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function temChaveAdmin(): boolean {
  return typeof process.env.SUPABASE_SERVICE_ROLE_KEY === 'string' &&
    process.env.SUPABASE_SERVICE_ROLE_KEY.length > 20
}

/**
 * A chave existe, mas é a chave certa?
 *
 * Colar a chave pública no lugar da de serviço é o engano mais fácil
 * de cometer: as duas ficam na mesma tela do Supabase, uma embaixo da
 * outra, e as duas parecem iguais. O Supabase só reclama lá na frente,
 * com "User not allowed" — que não diz a ninguém qual foi o erro.
 *
 * Então a conferência é feita aqui, onde dá para dizer o que houve.
 * A chave nunca é impressa; só o que ela diz de si mesma.
 */
function chaveErrada(chave: string): string | null {
  const arrume =
    ' Pegue a chave de serviço no painel do Supabase, em Settings → API Keys ' +
    '(a secreta, que começa com sb_secret_, ou a antiga service_role), e troque ' +
    'no .env.local e na Vercel. Essa chave passa por cima de todo o isolamento ' +
    'entre marcas. Não mande por e-mail, nem em print, nem para mim.'

  if (chave.startsWith('sb_publishable_')) {
    return 'A chave em SUPABASE_SERVICE_ROLE_KEY é a PÚBLICA, não a de serviço.' + arrume
  }

  if (chave.startsWith('eyJ')) {
    try {
      const meio = chave.split('.')[1]
      const corpo = JSON.parse(Buffer.from(meio, 'base64').toString('utf8'))
      if (corpo.role && corpo.role !== 'service_role') {
        return (
          `A chave em SUPABASE_SERVICE_ROLE_KEY é a de papel "${corpo.role}", ` +
          'e criar pessoa exige a de papel "service_role".' +
          arrume
        )
      }
    } catch {
      // Ilegível: deixa passar e o Supabase decide. Melhor um erro
      // dele do que um palpite errado meu barrando chave boa.
    }
  }

  return null
}
