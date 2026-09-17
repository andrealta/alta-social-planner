import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { MESES } from '@/lib/prompt'
import { Gerador } from './gerador'

const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  draft: { rotulo: 'rascunho', cor: 'faint' },
  generating: { rotulo: 'gerando…', cor: 'warn' },
  internal_review: { rotulo: 'em revisão interna', cor: 'warn' },
  sent_to_client: { rotulo: 'com o cliente', cor: 'accent' },
  approved: { rotulo: 'aprovado', cor: 'ok' },
  archived: { rotulo: 'arquivado', cor: 'faint' },
}

export default async function Planos({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: marca } = await supabase
    .from('brands')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!marca) notFound()

  const [{ data: escopo }, { data: planos }] = await Promise.all([
    supabase
      .from('brand_scope')
      .select('monthly_quota')
      .eq('brand_id', marca.id)
      .eq('active', true),
    supabase
      .from('plans')
      .select('id, month, year, status, created_at')
      .eq('brand_id', marca.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
  ])

  const pecas = (escopo ?? []).reduce((s, e) => s + Number(e.monthly_quota ?? 0), 0)

  const agora = new Date()
  const proximo = new Date(agora.getFullYear(), agora.getMonth() + 1, 1)

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px 60px' }}>
      <Link href={`/painel/marca/${slug}`} style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
        ← {marca.name as string}
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
          {marca.name as string}
        </div>
        <h1 style={{ fontFamily: 'var(--disp)', fontSize: 34, fontWeight: 600, lineHeight: 1.08 }}>
          Planejamento
        </h1>
      </header>

      {pecas === 0 ? (
        <div
          style={{
            marginTop: 22,
            padding: '16px 20px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--warn)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--warn-wash)',
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          <b>Esta marca não tem escopo contratado cadastrado.</b> Sem saber quantas
          peças o contrato pede por mês, não dá para planejar.
        </div>
      ) : (
        <Gerador
          slug={slug}
          mesInicial={proximo.getMonth() + 1}
          anoInicial={proximo.getFullYear()}
          pecas={pecas}
        />
      )}

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
          Meses já planejados
        </h2>

        {(planos ?? []).length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Nenhum ainda.</p>
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
              const s = SITUACAO[p.status as string] ?? { rotulo: p.status as string, cor: 'faint' }
              return (
                <li
                  key={p.id as string}
                  style={{ borderBottom: i === (planos ?? []).length - 1 ? 'none' : '1px solid var(--line)' }}
                >
                  <Link
                    href={`/painel/marca/${slug}/calendario/${p.year}/${p.month}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 20px',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 15, textTransform: 'capitalize' }}>
                      {MESES[Number(p.month) - 1]} de {p.year as number}
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 99,
                        background: 'var(--surface-3)',
                        color: `var(--${s.cor})`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.rotulo}
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
