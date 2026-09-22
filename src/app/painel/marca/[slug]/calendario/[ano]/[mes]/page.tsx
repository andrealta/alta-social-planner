import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { mesTitulado } from '@/lib/prompt'
import { Calendario } from './calendario'
import type { ConteudoPauta, Decisao, JuizoDaPauta, Pauta, Recado, Versao } from './comum'
import { Estrategia } from '../../../plano/[ano]/[mes]/estrategia'
import { lerInterno } from '@/lib/interno'
import { carregarLayouts } from '@/lib/layouts'

export default async function CalendarioDoMes({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; ano: string; mes: string }>
  /** `?pauta=<id>` abre a pauta direto, vindo da fila de trabalho. */
  searchParams: Promise<{ pauta?: string }>
}) {
  const { slug, ano: anoTexto, mes: mesTexto } = await params
  const { pauta: abrir } = await searchParams
  const ano = Number(anoTexto)
  const mes = Number(mesTexto)
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) notFound()

  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const papel = (perfil?.role as string) ?? 'client'
  if (papel !== 'admin' && papel !== 'staff') redirect('/painel')

  const { data: marca } = await supabase
    .from('brands')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()
  if (!marca) notFound()

  // O nível desta pessoa NESTA marca: responsável, edita ou só lê.
  // Quem manda é o banco — a tela apenas evita mostrar um botão que
  // seria recusado. Administração alcança como responsável.
  const { data: nivelBruto } = await supabase.rpc('nivel_na_marca', { b: marca.id })
  const nivel = (nivelBruto as string | null) ?? 'viewer'

  const { data: plano } = await supabase
    .from('plans')
    .select(
      'id, status, client_released_at, estrategia_cliente, estrategia_atualizada_em, investimento_total',
    )
    .eq('brand_id', marca.id)
    .eq('year', ano)
    .eq('month', mes)
    .maybeSingle()
  if (!plano) notFound()
  // Leitura e crítica moram em plano_interno, fora do alcance do cliente.
  const interno = await lerInterno(supabase, plano.id as string)

  const [
    { data: pautasBrutas },
    { data: canais },
    { data: linhas },
    { data: versoes },
    { data: conteudos },
    { data: recados },
    { data: decisoes },
  ] = await Promise.all([
    supabase
      .from('content_ideas')
      .select(
        'id, title, theme, concept, description, editorial_line, objective, rationale, cta, status, current_version, scope_id, position, meta_objetivo, meta_investimento, meta_justificativa',
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
      .from('content_versions')
      .select('idea_id, version, reason, trigger, created_at, snapshot, author_id')
      .eq('brand_id', marca.id)
      .order('version'),
    supabase
      .from('idea_content')
      .select(
        'idea_id, piece_kind, aspect_ratio, caption, cta, hashtags, alt_text, caption_variants, art_concept, art_direction, image_prompt, scenes, layout, generated_for_version',
      )
      .eq('brand_id', marca.id),
    supabase
      .from('comments')
      .select('id, idea_id, body, created_at, author_id, author_kind')
      .eq('brand_id', marca.id)
      .eq('author_kind', 'client')
      .order('created_at', { ascending: false }),
    supabase
      .from('approvals')
      .select('id, idea_id, decision, actor_id, actor_kind, version, created_at, seconds_to_decide')
      .eq('brand_id', marca.id)
      .order('created_at', { ascending: false }),
  ])

  // ---------- a crítica, se o mês já foi avaliado ----------
  // Cada item guarda a versão da pauta no momento da avaliação. Pauta
  // editada depois disso tem a crítica marcada como vencida: crítica
  // velha apresentada como atual é pior que nenhuma, porque a equipe
  // passa a revisar o que já foi consertado.
  const analisePlano = interno.analysis as {
    critica?: {
      veredito_do_mes?: string
      gerada_em?: string
      itens?: {
        id: string
        nota: number
        veredito: 'boa' | 'revisar' | 'fraca'
        porque: string
        arrume: string
        versao?: number
      }[]
    }
  }

  const versaoAtualDe = new Map<string, number>(
    (pautasBrutas ?? []).map((p): [string, number] => [
      p.id as string,
      Number(p.current_version ?? 1),
    ]),
  )

  const itensCritica: Record<string, JuizoDaPauta> = {}
  for (const i of analisePlano.critica?.itens ?? []) {
    itensCritica[i.id] = {
      nota: Number(i.nota),
      veredito: i.veredito,
      porque: i.porque ?? '',
      arrume: i.arrume ?? '',
      vencida: Number(i.versao ?? 1) !== (versaoAtualDe.get(i.id) ?? 1),
    }
  }

  const critica = analisePlano.critica
    ? {
        veredito: analisePlano.critica.veredito_do_mes ?? '',
        quando: analisePlano.critica.gerada_em ?? null,
        itens: itensCritica,
      }
    : null

  const nomeDaLinha = new Map<string, string>(
    (linhas ?? []).map((l): [string, string] => [l.id as string, l.label as string]),
  )

  // A cor da linha vem da posição cadastrada no contrato, não da ordem
  // em que as pautas aparecem. Assim a Classic é sempre da mesma cor,
  // mesmo num mês em que a Diet não tenha nenhuma peça.
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

  // Quem escreveu cada versão, para o histórico dizer o nome em vez do id.
  const autores = new Set<string>()
  for (const v of versoes ?? []) if (v.author_id) autores.add(v.author_id as string)
  for (const r of recados ?? []) if (r.author_id) autores.add(r.author_id as string)
  for (const d of decisoes ?? []) if (d.actor_id) autores.add(d.actor_id as string)
  const { data: pessoas } = autores.size
    ? await supabase.from('profiles').select('id, name, email').in('id', [...autores])
    : { data: [] }
  const nomeDe = new Map<string, string>(
    (pessoas ?? []).map((p): [string, string] => [p.id as string, (p.name as string) ?? '']),
  )
  const emailDe = new Map<string, string>(
    (pessoas ?? []).map((p): [string, string] => [p.id as string, (p.email as string) ?? '']),
  )

  const decisoesDe = new Map<string, Decisao[]>()
  for (const d of decisoes ?? []) {
    const id = d.idea_id as string
    const lista = decisoesDe.get(id) ?? []
    lista.push({
      id: d.id as string,
      decisao: (d.decision as string) ?? '',
      autor: d.actor_id ? (nomeDe.get(d.actor_id as string) || null) : null,
      email: d.actor_id ? (emailDe.get(d.actor_id as string) || null) : null,
      created_at: d.created_at as string,
      version: Number(d.version ?? 1),
      lado: (d.actor_kind as string) ?? 'client',
      segundos: d.seconds_to_decide === null || d.seconds_to_decide === undefined
        ? null
        : Number(d.seconds_to_decide),
    })
    decisoesDe.set(id, lista)
  }

  const historicoDe = new Map<string, Versao[]>()
  for (const v of versoes ?? []) {
    const id = v.idea_id as string
    const foto = (v.snapshot ?? {}) as Record<string, unknown>
    const lista = historicoDe.get(id) ?? []
    lista.push({
      version: Number(v.version),
      reason: (v.reason as string) ?? null,
      trigger: (v.trigger as string) ?? 'internal',
      created_at: v.created_at as string,
      titulo: typeof foto.title === 'string' ? foto.title : null,
      autor: v.author_id ? (nomeDe.get(v.author_id as string) ?? null) : null,
    })
    historicoDe.set(id, lista)
  }

  const recadosDe = new Map<string, Recado[]>()
  for (const r of recados ?? []) {
    const id = r.idea_id as string
    const lista = recadosDe.get(id) ?? []
    lista.push({
      id: r.id as string,
      body: (r.body as string) ?? '',
      created_at: r.created_at as string,
      autor: r.author_id ? (nomeDe.get(r.author_id as string) ?? null) : null,
    })
    recadosDe.set(id, lista)
  }

  const conteudoDe = new Map<string, ConteudoPauta>(
    (conteudos ?? []).map((c): [string, ConteudoPauta] => [
      c.idea_id as string,
      {
        piece_kind: (c.piece_kind as string) ?? 'image',
        aspect_ratio: (c.aspect_ratio as string) ?? '4:5',
        caption: (c.caption as string) ?? null,
        cta: (c.cta as string) ?? null,
        hashtags: (c.hashtags as string[]) ?? [],
        alt_text: (c.alt_text as string) ?? null,
        caption_variants: (c.caption_variants as { canal?: string; texto?: string }[]) ?? [],
        art_concept: (c.art_concept as string) ?? null,
        art_direction: (c.art_direction as string) ?? null,
        image_prompt: (c.image_prompt as string) ?? null,
        scenes:
          (c.scenes as { t?: string; descricao?: string; fala?: string; chave?: boolean }[]) ?? [],
        layout: (c.layout as Record<string, string>) ?? {},
        generated_for_version:
          c.generated_for_version === null ? null : Number(c.generated_for_version),
      },
    ]),
  )

  // As imagens do layout, com link assinado para ver (ver lib/layouts.ts).
  const layoutsDe = await carregarLayouts(
    supabase,
    (pautasBrutas ?? []).map((p) => p.id as string),
  )

  const pautas: Pauta[] = (pautasBrutas ?? []).map((p) => {
    const c = canalDa.get(p.id as string)
    return {
      id: p.id as string,
      title: (p.title as string) ?? '',
      theme: (p.theme as string) ?? null,
      concept: (p.concept as string) ?? null,
      description: (p.description as string) ?? null,
      editorial_line: (p.editorial_line as string) ?? null,
      objective: (p.objective as string) ?? null,
      rationale: (p.rationale as string) ?? null,
      cta: (p.cta as string) ?? null,
      status: (p.status as string) ?? 'ai_generated',
      current_version: Number(p.current_version ?? 1),
      linha: p.scope_id ? (nomeDaLinha.get(p.scope_id as string) ?? null) : null,
      linhaIndice: p.scope_id ? (indiceDaLinha.get(p.scope_id as string) ?? null) : null,
      formato: c?.format ?? null,
      plataforma: c?.platform ?? null,
      data: c?.scheduled_date ?? null,
      conteudo: conteudoDe.get(p.id as string) ?? null,
      layouts: layoutsDe.get(p.id as string) ?? [],
      midia: {
        objetivo: (p.meta_objetivo as string | null) ?? null,
        investimento:
          p.meta_investimento === null || p.meta_investimento === undefined
            ? null
            : Number(p.meta_investimento),
        justificativa: (p.meta_justificativa as string | null) ?? null,
      },
      historico: historicoDe.get(p.id as string) ?? [],
      recados: recadosDe.get(p.id as string) ?? [],
      decisoes: decisoesDe.get(p.id as string) ?? [],
    }
  })

  return (
    <main className="pagina-equipe">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
        <Link href={`/painel/marca/${slug}/plano`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          ← Planejamento
        </Link>
        <Link
          href={`/painel/marca/${slug}/plano/${ano}/${mes}`}
          style={{ color: 'var(--muted)', textDecoration: 'none' }}
        >
          Ver a leitura do mês
        </Link>
      </div>

      <header
        style={{
          marginTop: 12,
          paddingBottom: 16,
          borderBottom: '2px solid var(--text)',
        }}
      >
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
      </header>

      {/* A estratégia que o cliente lê fica AQUI, na tela onde a equipe
          trabalha o mês. Antes ela morava só na página da leitura, atrás
          de um link discreto, e na prática ninguém chegava até ela:
          o mês ia para o cliente sem o bloco. */}
      <Estrategia
        slug={slug}
        planoId={plano.id as string}
        inicial={(plano.estrategia_cliente as string | null) ?? null}
        atualizadaEm={(plano.estrategia_atualizada_em as string | null) ?? null}
        leitura={(interno.analysis as { leitura?: string }).leitura ?? null}
        podeEditar={nivel === 'owner' || nivel === 'editor'}
        lembrete={!(plano.estrategia_cliente as string | null)?.trim()}
      />

      <Calendario
        slug={slug}
        planoId={plano.id as string}
        ano={ano}
        mes={mes}
        pautas={pautas}
        nivel={nivel}
        critica={critica}
        investimentoTotal={
          plano.investimento_total === null || plano.investimento_total === undefined
            ? null
            : Number(plano.investimento_total)
        }
        abrir={typeof abrir === 'string' ? abrir : null}
        admin={papel === 'admin'}
      />
    </main>
  )
}
