import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { mesTitulado } from '@/lib/prompt'
import { Gerador } from './gerador'
import { MesesPlanejados, type MesPlanejado } from './meses'
import { exclusaoDoPlano } from './regra'

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
      .select('id, month, year, status, created_at, client_released_at')
      .eq('brand_id', marca.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
  ])

  const pecas = (escopo ?? []).reduce((s, e) => s + Number(e.monthly_quota ?? 0), 0)

  // Quem pode excluir, quantas pautas cada mês tem, e em quais o
  // cliente já decidiu alguma coisa. O banco é quem manda nas três
  // coisas; a tela só pergunta para não oferecer o que vai ser recusado.
  const [{ data: nivel }, { data: perfil }, { data: ideias }, { data: decisoesCliente }] = await Promise.all([
    supabase.rpc('nivel_na_marca', { b: marca.id }),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('content_ideas').select('id, plan_id').eq('brand_id', marca.id),
    supabase
      .from('approvals')
      .select('idea_id')
      .eq('brand_id', marca.id)
      .eq('actor_kind', 'client'),
  ])

  const planoDaIdeia = new Map<string, string>()
  const pautasDoPlano = new Map<string, number>()
  for (const i of ideias ?? []) {
    planoDaIdeia.set(i.id as string, i.plan_id as string)
    pautasDoPlano.set(i.plan_id as string, (pautasDoPlano.get(i.plan_id as string) ?? 0) + 1)
  }
  const decisoesDoPlano = new Map<string, number>()
  for (const d of decisoesCliente ?? []) {
    const plano = planoDaIdeia.get(d.idea_id as string)
    if (plano) decisoesDoPlano.set(plano, (decisoesDoPlano.get(plano) ?? 0) + 1)
  }
  const papel = (perfil?.role as string) ?? null

  // "Novembro de 2026". Antes a lista usava text-transform: capitalize,
  // que põe maiúscula em TODA palavra — e o "de" virava "De".
  const meses: MesPlanejado[] = (planos ?? []).map((p) => ({
    id: p.id as string,
    mes: Number(p.month),
    ano: Number(p.year),
    nome: `${mesTitulado(Number(p.month))} de ${p.year}`,
    situacao: SITUACAO[p.status as string] ?? { rotulo: p.status as string, cor: 'faint' },
    pautas: pautasDoPlano.get(p.id as string) ?? 0,
    decisoesCliente: decisoesDoPlano.get(p.id as string) ?? 0,
    comCliente: p.client_released_at !== null,
    exclusao: exclusaoDoPlano(papel, nivel as string | null, p.client_released_at !== null),
  }))

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

        <MesesPlanejados slug={slug} meses={meses} />
      </section>
    </main>
  )
}
