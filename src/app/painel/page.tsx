import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { Sair } from './sair'

const PAPEL: Record<string, string> = {
  admin: 'Administração',
  staff: 'Equipe',
  client: 'Cliente',
}

const ACESSO: Record<string, string> = {
  owner: 'responsável',
  editor: 'edita',
  viewer: 'visualiza',
  client: 'cliente',
}

export default async function Painel() {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/entrar')

  // Cada consulta abaixo passa pelas políticas do banco com a identidade
  // desta pessoa. Não há filtro por marca no código — e é esse o ponto.
  const { data: perfil } = await supabase
    .from('profiles')
    .select('name, email, role')
    .eq('id', user.id)
    .single()

  const { data: marcas } = await supabase
    .from('brands')
    .select('id, name, slug, segment')
    .order('name')

  const { data: vinculos } = await supabase
    .from('brand_members')
    .select('brand_id, access')
    .eq('user_id', user.id)

  const acessoPorMarca = new Map(
    (vinculos ?? []).map((v) => [v.brand_id as string, v.access as string]),
  )

  const papel = perfil?.role ?? 'client'

  // O cliente tem uma casa própria. O painel interno mostraria a ele
  // uma tela cheia de coisas que as políticas do banco vão negar uma
  // a uma — funciona, mas é uma péssima recepção.
  if (papel === 'client') redirect('/cliente')

  return (
    <main className="pagina" style={{ maxWidth: 720 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          paddingBottom: 22,
          borderBottom: '2px solid var(--text)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div
            style={{
              fontFamily: 'var(--disp)',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              marginBottom: 8,
            }}
          >
            Alta Social Planner
          </div>
          <h1 style={{ fontFamily: 'var(--disp)', fontSize: 32, fontWeight: 600, lineHeight: 1.1 }}>
            {perfil?.name ?? user.email}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            {perfil?.email ?? user.email} · {PAPEL[papel] ?? papel}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          <Link
            href="/painel/qualidade"
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 14px',
              border: '1px solid var(--line-2)',
              borderRadius: 8,
              background: 'var(--surface)',
              color: 'var(--text)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Qualidade
          </Link>
          {papel === 'admin' && (
            <Link
              href="/painel/pessoas"
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 14px',
                border: '1px solid var(--line-2)',
                borderRadius: 8,
                background: 'var(--surface)',
                color: 'var(--text)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Pessoas
            </Link>
          )}
          <Sair />
        </div>
      </header>

      <section style={{ marginTop: 32 }}>
        <h2
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
            marginBottom: 14,
          }}
        >
          Marcas que você alcança
        </h2>

        {marcas && marcas.length > 0 ? (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-lg)',
              background: 'var(--surface)',
              boxShadow: 'var(--shadow)',
              overflow: 'hidden',
            }}
          >
            {marcas.map((m, i) => (
              <li
                key={m.id as string}
                style={{
                  borderBottom: i === marcas.length - 1 ? 'none' : '1px solid var(--line)',
                }}
              >
                <Link
                  href={`/painel/marca/${m.slug as string}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 14,
                    padding: '15px 20px',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name as string}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {(m.segment as string) ?? '—'}
                    </div>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 99,
                        background: 'var(--surface-3)',
                        color: 'var(--muted)',
                      }}
                    >
                      {ACESSO[acessoPorMarca.get(m.id as string) ?? ''] ??
                        (papel === 'admin' ? 'administração' : '—')}
                    </span>
                    <span style={{ color: 'var(--faint)', fontSize: 16 }} aria-hidden>
                      &rsaquo;
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div
            style={{
              border: '1px dashed var(--line-2)',
              borderRadius: 'var(--r-lg)',
              padding: '32px 24px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <b style={{ color: 'var(--text)', display: 'block', marginBottom: 6 }}>
              Nenhuma marca ainda
            </b>
            O banco está vazio — as marcas entram na próxima etapa. Se você
            esperava ver alguma aqui, é porque o seu papel ou o seu vínculo
            ainda não foi definido.
          </div>
        )}
      </section>

      <section
        style={{
          marginTop: 30,
          padding: '16px 20px',
          border: '1px solid var(--line)',
          borderLeft: '3px solid var(--ok)',
          borderRadius: '0 var(--r) var(--r) 0',
          background: 'var(--ok-wash)',
          fontSize: 13.5,
          lineHeight: 1.6,
        }}
      >
        <b>O isolamento está valendo.</b> Esta página não filtra nada por
        marca — ela pede &ldquo;todas as marcas&rdquo; ao banco, e o banco
        devolve só as que você pode ver. Uma consulta esquecida no futuro não
        vaza dado de cliente.
      </section>
    </main>
  )
}
