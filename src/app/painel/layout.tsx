import Link from 'next/link'
import { clienteServidor } from '@/lib/supabase/server'
import { Sair } from './sair'
import { Navegacao } from './navegacao'
import { Avatar, urlDaFoto } from '@/lib/avatar'

/**
 * A moldura de todas as telas da equipe: uma barra no topo, fixa, com
 * o nome do sistema, o menu e a conta de quem está usando.
 *
 * Antes cada tela repetia os próprios botões no cabeçalho, e cada uma
 * tinha uma largura diferente (de 720 a 1180 pixels). Agora o menu
 * mora aqui, uma vez, e as telas usam a mesma largura (.pagina-equipe
 * no globals.css).
 *
 * Quem decide se a pessoa pode ver a tela continua sendo cada página
 * e o banco. Esta moldura só lê nome e papel para montar o menu.
 */
export default async function LayoutDaEquipe({ children }: { children: React.ReactNode }) {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Sem sessão, a própria página manda para /entrar.
  if (!user) return <>{children}</>

  const { data: perfil } = await supabase
    .from('profiles')
    .select('name, role, avatar_url')
    .eq('id', user.id)
    .single()

  const nome = ((perfil?.name as string | null) ?? user.email ?? '').trim()
  const foto = await urlDaFoto(supabase, perfil?.avatar_url as string | null)

  return (
    <>
      <header className="topo-equipe">
        <div className="topo-equipe-dentro">
          <Link href="/painel" className="topo-marca">
            <span className="topo-selo" aria-hidden>
              A
            </span>
            <span>Alta Social Planner</span>
          </Link>

          <Navegacao admin={perfil?.role === 'admin'} />

          <div className="topo-conta">
            <span className="topo-pessoa" title={nome}>
              <Avatar nome={nome} url={foto} tamanho={30} />
              <span className="topo-nome">{nome.split(' ')[0]}</span>
            </span>
            <Sair />
          </div>
        </div>
      </header>
      {children}
    </>
  )
}
