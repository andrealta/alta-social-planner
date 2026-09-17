import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { mesTitulado } from '@/lib/prompt'
import { Sair } from '@/app/painel/sair'

export default async function PortalDoCliente() {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('name, email, role')
    .eq('id', user.id)
    .single()

  // Quem é da Alta tem o painel interno; este portal é do cliente.
  if (perfil?.role === 'admin' || perfil?.role === 'staff') redirect('/painel')

  const { data: marcas } = await supabase.from('brands').select('id, name, slug').order('name')

  // As políticas do banco só devolvem planejamento já liberado.
  const { data: planos } = await supabase
    .from('plans')
    .select('id, brand_id, month, year, approved_at, client_released_at')
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  const { data: pautas } = await supabase.from('content_ideas').select('plan_id, status')

  const porPlano = new Map<string, { total: number; aguardando: number }>()
  for (const p of pautas ?? []) {
    const id = p.plan_id as string
    const c = porPlano.get(id) ?? { total: 0, aguardando: 0 }
    c.total++
    if (p.status === 'sent_to_client') c.aguardando++
    porPlano.set(id, c)
  }

  const nomeDaMarca = new Map<string, { nome: string; slug: string }>(
    (marcas ?? []).map((m): [string, { nome: string; slug: string }] => [
      m.id as string,
      { nome: m.name as string, slug: m.slug as string },
    ]),
  )

  const aguardandoTotal = (planos ?? []).reduce(
    (s, p) => s + (porPlano.get(p.id as string)?.aguardando ?? 0),
    0,
  )

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          paddingBottom: 20,
          borderBottom: '2px solid var(--text)',
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
            Alta Comunicazione
          </div>
          <h1 style={{ fontFamily: 'var(--disp)', fontSize: 32, fontWeight: 600, lineHeight: 1.1 }}>
            {perfil?.name ?? 'Seu planejamento'}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            {aguardandoTotal > 0
              ? `${aguardandoTotal} publicação(ões) aguardando você.`
              : 'Nada aguardando você no momento.'}
          </p>
        </div>
        <Sair />
      </header>

      <section style={{ marginTop: 28 }}>
        {(planos ?? []).length === 0 ? (
          <div
            style={{
              border: '1px dashed var(--line-2)',
              borderRadius: 'var(--r-lg)',
              padding: '36px 24px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 14,
              lineHeight: 1.65,
            }}
          >
            <b style={{ color: 'var(--text)', display: 'block', marginBottom: 6 }}>
              Nenhum mês para avaliar ainda
            </b>
            Assim que a equipe da Alta enviar um planejamento, ele aparece aqui.
          </div>
        ) : (
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
            {(planos ?? []).map((p, i) => {
              const marca = nomeDaMarca.get(p.brand_id as string)
              const c = porPlano.get(p.id as string) ?? { total: 0, aguardando: 0 }
              const fechado = p.approved_at !== null
              return (
                <li
                  key={p.id as string}
                  style={{
                    borderBottom: i === (planos ?? []).length - 1 ? 'none' : '1px solid var(--line)',
                  }}
                >
                  <Link
                    href={`/cliente/${marca?.slug ?? ''}/${p.year}/${p.month}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 14,
                      padding: '16px 20px',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15.5 }}>
                        {mesTitulado(Number(p.month))} de {p.year as number}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                        {marca?.nome ?? '—'} · {c.total} publicações
                      </div>
                    </div>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '3px 11px',
                        borderRadius: 99,
                        border: `1px solid ${fechado ? 'var(--st-aprovado)' : c.aguardando > 0 ? 'var(--st-cliente)' : 'var(--line-2)'}`,
                        background: fechado
                          ? 'color-mix(in srgb, var(--st-aprovado) 14%, transparent)'
                          : c.aguardando > 0
                            ? 'color-mix(in srgb, var(--st-cliente) 14%, transparent)'
                            : 'transparent',
                        color: fechado
                          ? 'var(--st-aprovado)'
                          : c.aguardando > 0
                            ? 'var(--st-cliente)'
                            : 'var(--muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fechado ? '✓ aprovado' : c.aguardando > 0 ? `${c.aguardando} aguardando` : 'em andamento'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
