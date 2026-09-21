import { notFound, redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import type { PautaCliente } from './avaliacao'

/**
 * Tudo o que o cliente vê de um mês, num lugar só.
 *
 * Existe porque agora são duas telas lendo o mesmo mês: o portal e a
 * versão para PDF. Com a consulta duplicada, a primeira mudança feita
 * num lado e esquecida no outro faria o PDF mostrar uma coisa e a tela
 * outra — e o PDF é justamente o documento que o cliente encaminha.
 *
 * Nenhum filtro por marca, por cliente ou por "já foi liberado" aqui.
 * Tudo isso é decidido pelo banco.
 */
export async function carregarMesDoCliente(slug: string, anoTexto: string, mesTexto: string) {
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
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()
  if (perfil?.role === 'admin' || perfil?.role === 'staff') {
    redirect(`/painel/marca/${slug}/calendario/${anoTexto}/${mesTexto}`)
  }

  const { data: marca } = await supabase
    .from('brands')
    .select('id, name, color')
    .eq('slug', slug)
    .maybeSingle()
  if (!marca) notFound()

  const { data: plano } = await supabase
    .from('plans')
    .select('id, client_released_at, approved_at, estrategia_cliente')
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
    { data: nomes },
  ] = await Promise.all([
    supabase
      .from('content_ideas')
      .select(
        'id, title, concept, description, editorial_line, cta, status, scope_id, position, enviada_ao_cliente_em',
      )
      .eq('plan_id', plano.id)
      .order('position'),
    supabase
      .from('content_channels')
      .select('idea_id, platform, format, scheduled_date')
      .eq('brand_id', marca.id),
    supabase
      .from('brand_scope')
      .select('id, label, position')
      .eq('brand_id', marca.id)
      .order('position'),
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
      .select('id, idea_id, decision, actor_id, created_at, seconds_to_decide')
      .eq('brand_id', marca.id)
      .order('created_at', { ascending: false }),
    // Os nomes vêm por uma função, não pela tabela `profiles`: a
    // política de `profiles` só deixa o cliente ler o próprio perfil,
    // e o colega da mesma empresa virava "alguém da sua equipe".
    // A função devolve só nome, só do lado do cliente, só desta marca.
    supabase.rpc('nomes_da_marca', { p_brand: marca.id }),
  ])

  const nomeDe = new Map<string, string>(
    ((nomes ?? []) as { id: string; nome: string }[]).map((p): [string, string] => [
      p.id,
      p.nome ?? '',
    ]),
  )
  const euNome = ((perfil?.name as string) ?? '').trim() || null
  if (euNome) nomeDe.set(user.id, euNome)

  const decisoesDe = new Map<string, PautaCliente['decisoes']>()
  for (const d of decisoes ?? []) {
    const id = d.idea_id as string
    const lista = decisoesDe.get(id) ?? []
    lista.push({
      id: d.id as string,
      decisao: (d.decision as string) ?? '',
      autor: d.actor_id ? (nomeDe.get(d.actor_id as string) || null) : null,
      created_at: d.created_at as string,
      meu: d.actor_id === user.id,
      segundos: d.seconds_to_decide === null || d.seconds_to_decide === undefined
        ? null
        : Number(d.seconds_to_decide),
    })
    decisoesDe.set(id, lista)
  }

  const nomeDaLinha = new Map<string, string>(
    (linhas ?? []).map((l): [string, string] => [l.id as string, l.label as string]),
  )

  // A cor de cada linha vem da posição no contrato, não da ordem em
  // que as pautas aparecem: a Classic é sempre da mesma cor, mesmo
  // num mês em que a Diet não tenha nenhuma peça.
  const indiceDaLinha = new Map<string, number>(
    (linhas ?? []).map((l, i): [string, number] => [l.id as string, i]),
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
        linhaIndice: p.scope_id ? (indiceDaLinha.get(p.scope_id as string) ?? null) : null,
        formato: c?.format ?? null,
        plataforma: c?.platform ? (REDES[c.platform] ?? c.platform) : null,
        data: c?.scheduled_date ?? null,
        caption: k?.caption ?? null,
        hashtags: k?.hashtags ?? [],
        art_concept: k?.art_concept ?? null,
        cenas,
        recados: recadosDe.get(p.id as string) ?? [],
        decisoes: decisoesDe.get(p.id as string) ?? [],
        enviadaEm: (p.enviada_ao_cliente_em as string | null) ?? null,
      }
    })
    .sort((a, b) => String(a.data ?? '9999').localeCompare(String(b.data ?? '9999')))

  // A ficha de feedback que esta pessoa já escreveu para o mês, para o
  // formulário abrir preenchido.
  const { data: minhaFicha } = await supabase
    .from('feedback_mes')
    .select('destaques, atencao, updated_at')
    .eq('plan_id', plano.id)
    .eq('author_id', user.id)
    .maybeSingle()

  return {
    ano,
    mes,
    estrategia: ((plano.estrategia_cliente as string | null) ?? '').trim() || null,
    meuFeedback: minhaFicha
      ? {
          destaques: (minhaFicha.destaques as string | null) ?? '',
          atencao: (minhaFicha.atencao as string | null) ?? '',
          em: (minhaFicha.updated_at as string | null) ?? null,
        }
      : null,
    marca: {
      id: marca.id as string,
      nome: (marca.name as string) ?? '',
      // Quando ninguém escolheu uma cor, o portal usa a do sistema —
      // melhor neutro do que uma cor inventada.
      cor: (marca.color as string | null) ?? null,
    },
    fechado: plano.approved_at !== null,
    pautas,
    linhas: (linhas ?? []).map((l) => (l.label as string) ?? ''),
    eu: { id: user.id, nome: euNome },
  }
}
