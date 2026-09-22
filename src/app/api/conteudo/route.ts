/**
 * Escreve o conteúdo de uma pauta: legenda, hashtags, direção de arte
 * e, para vídeo, a decupagem em cenas.
 *
 * Grava em `idea_content`, uma linha por pauta. Regerar substitui —
 * conteúdo não é versionado como a pauta, porque o que vale é o que
 * vai ser publicado, e o rascunho anterior não ajuda ninguém.
 *
 * `generated_for_version` guarda a versão da PAUTA que gerou este
 * texto. É assim que a tela sabe avisar "a pauta mudou depois que
 * este conteúdo foi escrito" em vez de mostrar um texto órfão.
 */

import { clienteServidor } from '@/lib/supabase/server'
import { chamarClaude, extrairJson, ErroClaude, MODELO_PADRAO } from '@/lib/claude'
import { registro } from '@/lib/registro'
import { coletarEstilo, blocoDeEstilo } from '@/lib/estilo'
import {
  montarPromptConteudo,
  montarPromptRefinoConteudo,
  conferirConteudo,
  ehVideo,
  SISTEMA_CONTEUDO,
  VERSAO_PROMPT,
  type Conteudo,
} from '@/lib/prompt'
import { lerInterno } from '@/lib/interno'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

const PROPORCOES = ['1:1', '4:5', '9:16', '16:9']

export async function POST(req: Request) {
  let corpo: { ideaId?: string; pedido?: string }
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Pedido malformado.' }, 400)
  }

  const ideaId = String(corpo.ideaId ?? '')
  if (!ideaId) return json({ erro: 'Faltou dizer qual pauta.' }, 400)

  // Com pedido, é alteração do que já existe. Sem pedido, é escrever
  // do zero. O resto do caminho é o mesmo.
  const pedido = String(corpo.pedido ?? '').trim()
  if (pedido.length > 2000) return json({ erro: 'O pedido está longo demais.' }, 400)

  const log = registro('conteudo')
  await log.passo('pedido recebido')

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ erro: 'Sua sessão expirou. Entre de novo.' }, 401)

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const papel = (perfil?.role as string) ?? 'client'
  if (papel !== 'admin' && papel !== 'staff') {
    return json({ erro: 'Só a equipe da Alta pode criar conteúdo.' }, 403)
  }

  const { data: pauta } = await supabase
    .from('content_ideas')
    .select(
      'id, brand_id, plan_id, title, theme, concept, description, editorial_line, objective, rationale, cta, status, scope_id, current_version',
    )
    .eq('id', ideaId)
    .maybeSingle()

  if (!pauta) return json({ erro: 'Não achei esta pauta, ou você não tem acesso a ela.' }, 404)

  // Quem só lê não gasta chamada de IA. Sem esta conferência, o pedido
  // iria até o fim, a conta seria paga, e só então o banco recusaria a
  // gravação. O dinheiro já teria saído.
  const { data: nivel } = await supabase.rpc('nivel_na_marca', { b: pauta.brand_id })
  if (nivel !== 'owner' && nivel !== 'editor') {
    return json({ erro: 'Você tem acesso de leitura nesta marca. Escrever o conteúdo é de quem edita.' }, 403)
  }

  const [{ data: marca }, { data: plano }, { data: secoes }, { data: canal }, { data: linha }, { data: atual }, interno] =
    await Promise.all([
      supabase.from('brands').select('name, segment').eq('id', pauta.brand_id).single(),
      supabase.from('plans').select('month, year').eq('id', pauta.plan_id).single(),
      supabase.from('brand_knowledge').select('section, content').eq('brand_id', pauta.brand_id),
      supabase
        .from('content_channels')
        .select('format, platform, scheduled_date')
        .eq('idea_id', ideaId)
        .maybeSingle(),
      pauta.scope_id
        ? supabase.from('brand_scope').select('label').eq('id', pauta.scope_id).maybeSingle()
        : Promise.resolve({ data: null }),
      pedido
        ? supabase
            .from('idea_content')
            .select('caption, cta, hashtags, alt_text, art_concept, art_direction, image_prompt, scenes')
            .eq('idea_id', ideaId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // A leitura do mês mora em plano_interno, fora do alcance do cliente.
      lerInterno(supabase, pauta.plan_id as string),
    ])

  if (!marca || !plano) return json({ erro: 'Não consegui carregar o contexto da pauta.' }, 500)

  const base: Record<string, Record<string, string>> = {}
  for (const s of secoes ?? []) {
    const c = (s.content ?? {}) as Record<string, unknown>
    const limpo: Record<string, string> = {}
    for (const [k, v] of Object.entries(c)) if (typeof v === 'string') limpo[k] = v
    base[s.section as string] = limpo
  }

  // É aqui que a voz da marca mais importa: a legenda é o texto que o
  // público lê. O bloco vai inteiro.
  const estilo = blocoDeEstilo(await coletarEstilo(supabase, pauta.brand_id as string, base))

  const analise = interno.analysis as { leitura?: string }
  const data = canal?.scheduled_date as string | undefined
  const formato = (canal?.format as string) ?? null
  const video = ehVideo(formato)

  const dadosDoPrompt = {
    marca: { nome: marca.name as string, segmento: marca.segment as string | null },
    base,
    estilo,
    mes: Number(plano.month),
    ano: Number(plano.year),
    leitura: analise.leitura ?? null,
    pauta: {
      dia: data ? Number(data.slice(8, 10)) : null,
      linha: (linha?.label as string) ?? null,
      formato,
      objetivo: (pauta.objective as string) ?? null,
      pilar: (pauta.editorial_line as string) ?? null,
      tema: (pauta.theme as string) ?? null,
      titulo: (pauta.title as string) ?? '',
      conceito: (pauta.concept as string) ?? null,
      descricao: (pauta.description as string) ?? null,
      cta: (pauta.cta as string) ?? null,
      justificativa: (pauta.rationale as string) ?? null,
    },
    video,
  }

  if (pedido && !atual) {
    return json({ erro: 'Não achei o conteúdo para alterar. Crie o conteúdo primeiro.' }, 400)
  }

  const prompt = pedido
    ? montarPromptRefinoConteudo({
        ...dadosDoPrompt,
        pedido,
        atual: {
          legenda: (atual?.caption as string | null) ?? null,
          cta: (atual?.cta as string | null) ?? null,
          hashtags: (atual?.hashtags as string[]) ?? [],
          alt: (atual?.alt_text as string | null) ?? null,
          conceito: (atual?.art_concept as string | null) ?? null,
          direcao: (atual?.art_direction as string | null) ?? null,
          prompt: (atual?.image_prompt as string | null) ?? null,
          cenas: (atual?.scenes as { t?: string; descricao?: string; fala?: string; chave?: boolean }[]) ?? [],
        },
      })
    : montarPromptConteudo(dadosDoPrompt)

  const { data: corrida } = await supabase
    .from('ai_runs')
    .insert({
      brand_id: pauta.brand_id,
      plan_id: pauta.plan_id,
      idea_id: ideaId,
      agent: pedido ? 'content_refine' : 'content',
      model: MODELO_PADRAO,
      prompt_version: VERSAO_PROMPT,
      status: 'running',
    })
    .select('id')
    .single()
  const corridaId = corrida?.id as string | undefined

  await log.passo(
    'chamando a Anthropic',
    `${prompt.length} caracteres, video=${video}${pedido ? ', com pedido de alteração' : ''}`,
  )

  try {
    const r = await chamarClaude(prompt, {
      system: SISTEMA_CONTEUDO,
      maxTokens: 24000,
      limiteSegundos: 420,
    })

    await log.passo('resposta', `${r.texto.length} caracteres, US$ ${r.custoUsd.toFixed(4)}`)

    const c = extrairJson<Conteudo>(r.texto)
    const achados = conferirConteudo(c, base, video)

    if (achados.some((a) => a.gravidade === 'erro')) {
      if (corridaId) {
        await supabase
          .from('ai_runs')
          .update({
            status: 'failed',
            error: achados.map((a) => a.texto).join(' | ').slice(0, 500),
            input_tokens: r.uso.entrada,
            output_tokens: r.uso.saida,
            cost_usd: Number(r.custoUsd.toFixed(6)),
          })
          .eq('id', corridaId)
      }
      return json({ erro: achados.map((a) => a.texto).join(' '), achados }, 422)
    }

    const proporcao = PROPORCOES.includes(c.peca?.proporcao ?? '') ? c.peca!.proporcao! : '4:5'

    const linhaConteudo = {
      idea_id: ideaId,
      brand_id: pauta.brand_id,
      piece_kind: video ? 'video' : 'image',
      aspect_ratio: proporcao,
      channel: (c.peca?.canal as string) ?? (canal?.platform as string) ?? null,
      caption: c.legenda?.principal ?? null,
      cta: c.legenda?.cta ?? null,
      hashtags: (c.legenda?.hashtags ?? []).filter((h) => typeof h === 'string').slice(0, 30),
      alt_text: c.legenda?.alt ?? null,
      caption_variants: c.legenda?.variantes ?? [],
      art_concept: c.arte?.conceito ?? null,
      art_direction: c.arte?.direcao ?? null,
      image_prompt: c.arte?.prompt ?? null,
      scenes: c.cenas ?? [],
      layout: c.mockup ?? {},
      generated_for_version: Number(pauta.current_version ?? 1),
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }

    const { error: erroGravar } = await supabase
      .from('idea_content')
      .upsert(linhaConteudo, { onConflict: 'idea_id' })

    if (erroGravar) {
      await log.passo('FALHOU ao gravar', erroGravar.message.slice(0, 120))
      return json({ erro: 'O conteúdo saiu, mas a gravação falhou: ' + erroGravar.message }, 500)
    }

    if (corridaId) {
      await supabase
        .from('ai_runs')
        .update({
          status: 'ok',
          input_tokens: r.uso.entrada,
          output_tokens: r.uso.saida,
          cost_usd: Number(r.custoUsd.toFixed(6)),
          latency_ms: r.latenciaMs,
        })
        .eq('id', corridaId)
    }

    await log.passo('FIM, conteudo gravado')

    return json({
      ok: true,
      achados,
      custoUsd: Number(r.custoUsd.toFixed(4)),
      segundos: Math.round(r.latenciaMs / 1000),
      conteudo: {
        piece_kind: linhaConteudo.piece_kind,
        aspect_ratio: linhaConteudo.aspect_ratio,
        caption: linhaConteudo.caption,
        cta: linhaConteudo.cta,
        hashtags: linhaConteudo.hashtags,
        alt_text: linhaConteudo.alt_text,
        caption_variants: linhaConteudo.caption_variants,
        art_concept: linhaConteudo.art_concept,
        art_direction: linhaConteudo.art_direction,
        image_prompt: linhaConteudo.image_prompt,
        scenes: linhaConteudo.scenes,
        layout: linhaConteudo.layout,
        generated_for_version: linhaConteudo.generated_for_version,
      },
    })
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Algo deu errado ao criar o conteúdo.'
    await log.passo('FALHOU', mensagem.slice(0, 160))
    if (corridaId) {
      const uso = e instanceof ErroClaude ? e.uso : undefined
      await supabase
        .from('ai_runs')
        .update({
          status: 'failed',
          error: mensagem.slice(0, 500),
          input_tokens: uso?.entrada ?? 0,
          output_tokens: uso?.saida ?? 0,
          cost_usd: Number((e instanceof ErroClaude ? (e.custoUsd ?? 0) : 0).toFixed(6)),
        })
        .eq('id', corridaId)
    }
    return json({ erro: mensagem }, 500)
  }
}
