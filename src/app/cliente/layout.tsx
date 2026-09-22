import Link from 'next/link'
import { clienteServidor } from '@/lib/supabase/server'
import { Sair } from '@/app/painel/sair'

/**
 * A moldura do portal do cliente: a mesma barra fixa da equipe, mais
 * simples. O cliente tem uma tela inicial e os meses; o menu é só o
 * caminho de volta para o início, e a conta fica sempre à mão.
 *
 * Na impressão (o PDF do mês) a barra some: ver globals.css.
 */
export default async function LayoutDoCliente({ children }: { children: React.ReactNode }) {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return <>{children}</>

  const { data: perfil } = await supabase.from('profiles').select('name').eq('id', user.id).single()
  const nome = ((perfil?.name as string | null) ?? user.email ?? '').trim()
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')

  return (
    <>
      <header className="topo-equipe">
        <div className="topo-equipe-dentro">
          <Link href="/cliente" className="topo-marca">
            <span className="topo-selo" aria-hidden>
              A
            </span>
            <span>Alta Comunicazione</span>
          </Link>
          <nav className="topo-menu" aria-label="Menu">
            <Link href="/cliente" className="topo-link ativo">
              Seus planejamentos
            </Link>
          </nav>
          <div className="topo-conta">
            <span className="topo-pessoa" title={nome}>
              <span className="topo-avatar" aria-hidden>
                {iniciais || '?'}
              </span>
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
