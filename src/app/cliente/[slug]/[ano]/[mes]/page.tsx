import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { mesTitulado } from '@/lib/prompt'
import { Sair } from '@/app/painel/sair'
import { Avaliacao, type PautaCliente } from './avaliacao'

export default async function MesDoCliente({
  params,
}: {
  params: Promise<{ slug: string; ano: string; mes: string }>
}) {
  const { slug, ano: anoTexto, mes: mesTexto } = await params
  const ano = Number(anoTexto)
  const mes = Number(mesTexto)
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) notFound()

  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  // Quem é da Alta não entra por esta porta. Não é uma trava de
  // segurança — as políticas do banco continuam valendo para todo
  // mundo —, é para a equipe não confundir a tela do cliente com a
  // dela e achar que está vendo o que o cliente vê.
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role === 'admin' || perfil?.role === 'staff') {
    redirect(`/painel/marca/${slug}/calendario/${anoTexto}/${mesTexto}`)
  }

  // Sem filtro por marca, por cliente ou por "já foi liberado" em
  // nenhuma consulta desta página. Tudo isso é decidido pelo banco.
  // Se as políticas estiverem certas, a página está certa; se
  // estiverem erradas, nenhum cuidado aqui salvaria.
  const { data: marca } = await supabase
    .from('brands')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()
  if (!marca) notFound()

  const { data: plano } = await supabase
    .from('plans')
    .select('id, client_released_at, approved_at')
    .eq('brand_id', marca.id)
    .eq('year', ano)
    .eq('month', mes)
    .maybeSingle()
  if (!plano) notFound()

  const [
    { data: pautasBrutas },
    { data: canais },
    { data: linhas },
    { data: conteudos },
    { data: recados },
    { data: decisoes },
  ] = await Promise.all([
      supabase
        .from('content_ideas')
        .select('id, title, concept, description, editorial_line, cta, status, scope_id, position')
        .eq('plan_id', plano.id)
        .order('position'),
      supabase
        .from('content_channels')
        .select('idea_id, platform, format, scheduled_date')
        .eq('brand_id', marca.id),
      supabase.from('brand_scope').select('id, label').eq('brand_id', marca.id),
      supabase
        .from('idea_content')
        .select('idea_id, caption, hashtags, art_concept, scenes')
        .eq('brand_id', marca.id),
      supabase
        .from('comments')
        .select('id, idea_id, body, created_at, author_id')
        .eq('brand_id', marca.id)
        .eq('visibility', 'shared')
        .order('created_at', { ascending: false }),
      supabase
        .from('approvals')
        .select('id, idea_id, decision, actor_id, created_at')
        .eq('brand_id', marca.id)
        .order('created_at', { ascending: false }),
    ])

  // Quem decidiu, pelo nome. Numa empresa com mais de uma pessoa
  // avaliando, "aprovada" sem dono não resolve discussão nenhuma.
  const quem = new Set<string>()
  for (const r of recados ?? []) if (r.author_id) quem.add(r.author_id as string)
  for (const d of decisoes ?? []) if (d.actor_id) quem.add(d.actor_id as string)
  const { data: pessoas } = quem.size
    ? await supabase.from('profiles').select('id, name').in('id', [...quem])
    : { data: [] }
  const nomeDe = new Map<string, string>(
    (pessoas ?? []).map((p): [string, string] => [p.id as string, (p.name as string) ?? '']),
  )

  const decisoesDe = new Map<string, PautaCliente['decisoes']>()
  for (const d of decisoes ?? []) {
    const id = d.idea_id as string
    const lista = decisoesDe.get(id) ?? []
    lista.push({
      id: d.id as string,
      decisao: (d.decision as string) ?? '',
      autor: d.actor_id ? (nomeDe.get(d.actor_id as string) || null) : null,
      created_at: d.created_at as string,
    })
    decisoesDe.set(id, lista)
  }

  const nomeDaLinha = new Map<string, string>(
    (linhas ?? []).map((l): [string, string] => [l.id as string, l.label as string]),
  )
  type Canal = { platform?: string; format?: string; scheduled_date?: string }
  const canalDa = new Map<string, Canal>(
    (canais ?? []).map((c): [string, Canal] => [
      c.idea_id as string,
      {
        platform: c.platform as string | undefined,
        format: c.format as string | undefined,
        scheduled_date: c.scheduled_date as string | undefined,
      },
    ]),
  )
  type Conteudo = { caption?: string; hashtags?: string[]; art_concept?: string; scenes?: unknown }
  const conteudoDa = new Map<string, Conteudo>(
    (conteudos ?? []).map((c): [string, Conteudo] => [
      c.idea_id as string,
      {
        caption: (c.caption as string) ?? undefined,
        hashtags: (c.hashtags as string[]) ?? [],
        art_concept: (c.art_concept as string) ?? undefined,
        scenes: c.scenes,
      },
    ]),
  )
  const recadosDe = new Map<string, PautaCliente['recados']>()
  for (const r of recados ?? []) {
    const id = r.idea_id as string
    const lista = recadosDe.get(id) ?? []
    lista.push({
      id: r.id as string,
      body: (r.body as string) ?? '',
      created_at: r.created_at as string,
      meu: r.author_id === user.id,
      autor: r.author_id ? (nomeDe.get(r.author_id as string) || null) : null,
    })
    recadosDe.set(id, lista)
  }

  const REDES: Record<string, string> = {
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    facebook: 'Facebook',
    pinterest: 'Pinterest',
  }

  const pautas: PautaCliente[] = (pautasBrutas ?? [])
    .map((p) => {
      const c = canalDa.get(p.id as string)
      const k = conteudoDa.get(p.id as string)
      const cenas = Array.isArray(k?.scenes)
        ? (k.scenes as { t?: string; descricao?: string; chave?: boolean }[])
        : []
      return {
        id: p.id as string,
        title: (p.title as string) ?? '',
        concept: (p.concept as string) ?? null,
        description: (p.description as string) ?? null,
        editorial_line: (p.editorial_line as string) ?? null,
        cta: (p.cta as string) ?? null,
        status: (p.status as string) ?? 'sent_to_client',
        linha: p.scope_id ? (nomeDaLinha.get(p.scope_id as string) ?? null) : null,
        formato: c?.format ?? null,
        plataforma: c?.platform ? (REDES[c.platform] ?? c.platform) : null,
        data: c?.scheduled_date ?? null,
        caption: k?.caption ?? null,
        hashtags: k?.hashtags ?? [],
        art_concept: k?.art_concept ?? null,
        cenas,
        recados: recadosDe.get(p.id as string) ?? [],
        decisoes: decisoesDe.get(p.id as string) ?? [],
      }
    })
    .sort((a, b) => String(a.data ?? '9999').localeCompare(String(b.data ?? '9999')))

  const fechado = plano.approved_at !== null

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 70px' }}>
      <Link href="/cliente" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
        ← Todos os meses
      </Link>

      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
          marginTop: 12,
          paddingBottom: 18,
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
              marginBottom: 6,
            }}
          >
            {marca.name as string}
          </div>
          <h1
            style={{
              fontFamily: 'var(--disp)',
              fontSize: 34,
              fontWeight: 600,
              lineHeight: 1.08,
            }}
          >
            {mesTitulado(mes)} de {ano}
          </h1>
        </div>
        <Sair />
      </header>

      {fechado ? (
        <div
          style={{
            marginTop: 20,
            padding: '16px 20px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--st-aprovado)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--ok-wash)',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <b>Mês aprovado por completo.</b> Nada mais precisa de você aqui — a equipe da Alta
          segue para a produção.
        </div>
      ) : (
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 18, lineHeight: 1.65 }}>
          Leia cada publicação e responda. <b>Aprovar</b> libera a peça para produção;{' '}
          <b>Pedir alteração</b> devolve à equipe com o que você escrever. Pode responder aos
          poucos — o que você já decidiu fica salvo.
        </p>
      )}

      <div style={{ marginTop: 22 }}>
        <Avaliacao slug={slug} ano={ano} mes={mes} pautas={pautas} />
      </div>
    </main>
  )
}
