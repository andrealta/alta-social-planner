'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * O menu da equipe. Fica num componente próprio só porque precisa
 * saber em que tela a pessoa está para marcar o item, e isso é coisa
 * do navegador.
 */
export function Navegacao({ admin }: { admin: boolean }) {
  const rota = usePathname() ?? '/painel'

  const itens = [
    // As telas de marca (base, planejamento, calendário) contam como
    // "Painel": é de lá que a pessoa chega nelas.
    { href: '/painel', texto: 'Painel', ativo: rota === '/painel' || rota.startsWith('/painel/marca') },
    { href: '/painel/agenda', texto: 'Agenda', ativo: rota.startsWith('/painel/agenda') },
    { href: '/painel/qualidade', texto: 'Precisão', ativo: rota.startsWith('/painel/qualidade') },
    ...(admin
      ? [{ href: '/painel/pessoas', texto: 'Pessoas', ativo: rota.startsWith('/painel/pessoas') }]
      : []),
  ]

  return (
    <nav className="topo-menu" aria-label="Menu da equipe">
      {itens.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={i.ativo ? 'topo-link ativo' : 'topo-link'}
          aria-current={i.ativo ? 'page' : undefined}
        >
          {i.texto}
        </Link>
      ))}
    </nav>
  )
}
