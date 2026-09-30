import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { Marcas, type MarcaAdmin, type LinhaDoRegistro } from './marcas'

/**
 * A administração de marcas.
 *
 * O que muda aqui muda o que a IA vai gerar no mês que vem: o escopo é
 * restrição dura na geração, e arquivar uma marca para o planejamento
 * dela por completo. Por isso a tela é só de administração, e por isso
 * cada mexida fica registrada com nome e data.
 *
 * A base da marca continua na tela da marca. Ali se descreve a conta;
 * aqui se decide quantas peças por mês e se a conta existe.
 */
export default async function AdministrarMarcas() {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role !== 'admin') redirect('/painel')

  const [{ data: marcasBrutas }, { data: escopos }, { data: planos }, { data: registro }] =
    await Promise.all([
      supabase
        .from('brands')
        .select('id, name, slug, segment, color, arquivada_em')
        .order('name'),
      supabase
        .from('brand_scope')
        .select('brand_id, label, monthly_quota, position')
        .eq('active', true)
        .order('position'),
      // Só para a tela dizer o tamanho do histórico de cada marca. O
      // que se perde ao apagar é contado na hora de apagar, com o
      // número na frente da pessoa.
      supabase.from('plans').select('brand_id'),
      supabase
        .from('registro_admin')
        .select('id, quando, quem_nome, acao, marca_nome, marca_slug, detalhe')
        .order('quando', { ascending: false })
        .limit(60),
    ])

  const porMarca = new Map<string, { label: string; quota: number }[]>()
  for (const l of escopos ?? []) {
    const id = l.brand_id as string
    const lista = porMarca.get(id) ?? []
    lista.push({ label: l.label as string, quota: Number(l.monthly_quota ?? 0) })
    porMarca.set(id, lista)
  }

  const planosPorMarca = new Map<string, number>()
  for (const p of planos ?? []) {
    const id = p.brand_id as string
    planosPorMarca.set(id, (planosPorMarca.get(id) ?? 0) + 1)
  }

  const marcas: MarcaAdmin[] = (marcasBrutas ?? []).map((m) => ({
    id: m.id as string,
    nome: m.name as string,
    slug: m.slug as string,
    segmento: (m.segment as string) ?? '',
    cor: (m.color as string) ?? null,
    arquivadaEm: (m.arquivada_em as string) ?? null,
    escopo: porMarca.get(m.id as string) ?? [],
    planejamentos: planosPorMarca.get(m.id as string) ?? 0,
  }))

  const linhas: LinhaDoRegistro[] = (registro ?? []).map((r) => ({
    id: Number(r.id),
    quando: r.quando as string,
    quem: (r.quem_nome as string) ?? 'alguém que já saiu',
    acao: r.acao as string,
    marca: (r.marca_nome as string) ?? (r.marca_slug as string) ?? '',
    detalhe: (r.detalhe as Record<string, unknown>) ?? {},
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
          Marcas e escopo
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
          As cotas mensais moram aqui e em nenhum outro lugar. Elas são restrição dura na
          geração: a IA fecha exatamente estes números. O resto do que se sabe sobre a
          conta, incluindo os canais e os formatos, fica na base de cada marca.
        </p>
      </header>

      <div style={{ marginTop: 24 }}>
        <Marcas marcas={marcas} registro={linhas} />
      </div>
    </main>
  )
}
