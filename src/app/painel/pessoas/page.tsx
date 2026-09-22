import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { temChaveAdmin } from '@/lib/supabase/admin'
import { Pessoas, type Marca, type Pessoa } from './pessoas'

export default async function GerenciarPessoas() {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role !== 'admin') redirect('/painel')

  // A política `profiles_admin_all` devolve todo mundo para quem
  // administra, e só para quem administra.
  const [{ data: gente }, { data: marcasBrutas }, { data: vinculos }] = await Promise.all([
    supabase.from('profiles').select('id, name, email, role').order('name'),
    supabase.from('brands').select('id, name, slug').order('name'),
    supabase.from('brand_members').select('user_id, brand_id, access'),
  ])

  const marcas: Marca[] = (marcasBrutas ?? []).map((m) => ({
    id: m.id as string,
    nome: m.name as string,
    slug: m.slug as string,
  }))

  const porPessoa = new Map<string, { brandId: string; acesso: string }[]>()
  for (const v of vinculos ?? []) {
    const id = v.user_id as string
    const lista = porPessoa.get(id) ?? []
    lista.push({ brandId: v.brand_id as string, acesso: v.access as string })
    porPessoa.set(id, lista)
  }

  const pessoas: Pessoa[] = (gente ?? []).map((p) => ({
    id: p.id as string,
    nome: (p.name as string) ?? '',
    email: (p.email as string) ?? '',
    papel: (p.role as string) ?? 'client',
    vinculos: porPessoa.get(p.id as string) ?? [],
  }))

  return (
    <main className="pagina-equipe">
      <Link href="/painel" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
        ← Painel
      </Link>

      <header style={{ marginTop: 12, paddingBottom: 18, borderBottom: '2px solid var(--text)' }}>
        <div
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            marginBottom: 6,
          }}
        >
          Administração
        </div>
        <h1 style={{ fontFamily: 'var(--disp)', fontSize: 34, fontWeight: 600, lineHeight: 1.08 }}>
          Pessoas e acessos
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
          Quem é da Alta trabalha nas marcas em que for vinculado. Quem é cliente só enxerga o
          planejamento da própria marca, e só depois que ele for enviado.
        </p>
      </header>

      <div style={{ marginTop: 24 }}>
        <Pessoas
          marcas={marcas}
          pessoas={pessoas}
          temChaveAdmin={temChaveAdmin()}
          euId={user.id}
        />
      </div>
    </main>
  )
}
