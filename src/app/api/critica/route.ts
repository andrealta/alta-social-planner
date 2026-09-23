/**
 * O crítico: um segundo passe de IA sobre o mês já gerado.
 *
 * Roda a pedido da equipe, não automaticamente depois da geração. Duas
 * razões: custa uma chamada, e o momento útil de avaliar é quando
 * alguém vai sentar para revisar — não às três da manhã, quando o mês
 * nasceu.
 *
 * O resultado fica em `plano_interno.analysis.critica`, com a versão de cada
 * pauta no momento da avaliação. Pauta editada depois disso tem a
 * crítica marcada como vencida na tela, em vez de fingir que ainda
 * vale.
 */

import { clienteServidor } from '@/lib/supabase/server'
import { chamarClaude, extrairJson, ErroClaude, MODELO_PADRAO } from '@/lib/claude'
import { coletarEstilo, blocoDeEstilo } from '@/lib/estilo'
import { coletarConcorrencia, blocoDeConcorrencia } from '@/lib/concorrencia'
import {
  montarPromptCritica,
  conferirCritica,
  SISTEMA_CRITICA,
  VERSAO_PROMPT,
  type Critica,
  type PautaParaCritica,
} from '@/lib/prompt'
import { lerInterno, gravarInterno } from '@/lib/interno'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  let corpo: { planoId?: string }
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Pedido malformado.' }, 400)
  }

  const planoId = String(corpo.planoId ?? '')
  if (!planoId) return json({ erro: 'Faltou dizer qual planejamento.' }, 400)

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ erro: 'Sua sessão expirou. Entre de novo.' }, 401)

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const papel = (perfil?.role as string) ?? 'client'
  if (papel !== 'admin' && papel !== 'staff') {
    return json({ erro: 'Só a equipe da Alta pode avaliar o mês.' }, 403)
  }

  // O planejamento só aparece aqui se as políticas deixarem.
  const { data: plano } = await supabase
    .from('plans')
    .select('id, brand_id, month, year')
    .eq('id', planoId)
    .maybeSingle()
  if (!plano) return json({ erro: 'Não achei este planejamento, ou você não tem acesso a ele.' }, 404)

  const marcaId = plano.brand_id as string

  // Desde a 0028 a permissão de planejamento é que abre esta porta, e
  // não o nível na marca. Quem só cuida de conteúdo não gasta a conta
  // da Anthropic sem querer.
  const { data: podePlanejar } = await supabase.rpc('pode', { p: 'planejamento' })
  if (podePlanejar !== true) {
    return json(
      { erro: 'Avaliar o mês com a IA não está entre as suas permissões.' },
      403,
    )
  }

  const [{ data: marca }, { data: secoes }, { data: escopoBruto }, { data: pautasBrutas }, { data: canais }, { data: linhas }] =
    await Promise.all([
      supabase.from('brands').select('name, segment').eq('id', marcaId).single(),
      supabase.from('brand_knowledge').select('section, content').eq('brand_id', marcaId),
      supabase
        .from('brand_scope')
        .select('label, monthly_quota, position')
        .eq('brand_id', marcaId)
        .eq('active', true)
        .order('position'),
      supabase
        .from('content_ideas')
        .select('id, title, theme, concept, description, editorial_line, cta, scope_id, current_version, position')
        .eq('plan_id', planoId)
        .order('position'),
      supabase.from('content_channels').select('idea_id, format, scheduled_date').eq('brand_id', marcaId),
      supabase.from('brand_scope').select('id, label').eq('brand_id', marcaId),
    ])

  if (!marca) return json({ erro: 'Não consegui carregar a marca.' }, 500)
  if ((pautasBrutas ?? []).length === 0) {
    return json({ erro: 'Este mês ainda não tem pautas para avaliar.' }, 400)
  }

  const base: Record<string, Record<string, string>> = {}
  for (const s of secoes ?? []) {
    const c = (s.content ?? {}) as Record<string, unknown>
    const limpo: Record<string, string> = {}
    for (const [k, v] of Object.entries(c)) if (typeof v === 'string') limpo[k] = v
    base[s.section as string] = limpo
  }

  const nomeDaLinha = new Map<string, string>(
    (linhas ?? []).map((l): [string, string] => [l.id as string, l.label as string]),
  )
  type Canal = { format?: string; scheduled_date?: string }
  const canalDe = new Map<string, Canal>(
    (canais ?? []).map((c): [string, Canal] => [
      c.idea_id as string,
      { format: c.format as string | undefined, scheduled_date: c.scheduled_date as string | undefined },
    ]),
  )

  const pautas: PautaParaCritica[] = (pautasBrutas ?? []).map((p) => {
    const c = canalDe.get(p.id as string)
    const data = c?.scheduled_date
    return {
      id: p.id as string,
      dia: data ? Number(data.slice(8, 10)) : null,
      linha: p.scope_id ? (nomeDaLinha.get(p.scope_id as string) ?? null) : null,
      formato: c?.format ?? null,
      pilar: (p.editorial_line as string) ?? null,
      tema: (p.theme as string) ?? null,
      titulo: (p.title as string) ?? '',
      conceito: (p.concept as string) ?? null,
      descricao: (p.description as string) ?? null,
      cta: (p.cta as string) ?? null,
    }
  })

  // A análise mora em plano_interno, que o cliente não alcança.
  const analise = (await lerInterno(supabase, planoId)).analysis as {
    leitura?: string
    territorios?: { nome: string; peso: number }[]
  }

  const estilo = blocoDeEstilo(await coletarEstilo(supabase, marcaId, base))

  // O crítico já pergunta "isto serviria para qualquer concorrente?".
  // Com as publicações reais dos concorrentes na mão, ele responde com
  // evidência em vez de intuição — e pode citar quem já disse aquilo.
  const concorrencia = blocoDeConcorrencia(await coletarConcorrencia(supabase, marcaId), true)

  const prompt = montarPromptCritica({
    marca: { nome: marca.name as string, segmento: marca.segment as string | null },
    base,
    estilo,
    concorrencia,
    mes: Number(plano.month),
    ano: Number(plano.year),
    leitura: analise.leitura ?? null,
    territorios: analise.territorios ?? [],
    escopo: (escopoBruto ?? []).map((e) => ({
      label: e.label as string,
      quota: Number(e.monthly_quota ?? 0),
    })),
    pautas,
  })

  const { data: corrida } = await supabase
    .from('ai_runs')
    .insert({
      brand_id: marcaId,
      plan_id: planoId,
      agent: 'critique',
      model: MODELO_PADRAO,
      prompt_version: VERSAO_PROMPT,
      status: 'running',
    })
    .select('id')
    .single()
  const corridaId = corrida?.id as string | undefined

  try {
    // Duas frases por pauta mais o veredito do mês: o teto sobe com o
    // número de pautas, mas não precisa do limite de uma geração.
    const r = await chamarClaude(prompt, {
      system: SISTEMA_CRITICA,
      maxTokens: Math.min(32000, 8000 + pautas.length * 500),
      limiteSegundos: 270,
    })

    const bruta = extrairJson<Critica>(r.texto)
    if (!bruta) {
      throw new ErroClaude('A IA respondeu fora do formato pedido. Tente de novo.')
    }

    const { achados, itens } = conferirCritica(
      bruta,
      pautas.map((p) => p.id),
    )

    const versaoDe = new Map<string, number>(
      (pautasBrutas ?? []).map((p): [string, number] => [
        p.id as string,
        Number(p.current_version ?? 1),
      ]),
    )

    const critica = {
      gerada_em: new Date().toISOString(),
      modelo: r.modelo,
      versao_prompt: VERSAO_PROMPT,
      veredito_do_mes: String(bruta.veredito_do_mes ?? '').trim(),
      achados,
      itens: itens.map((i) => ({ ...i, versao: versaoDe.get(i.id) ?? 1 })),
    }

    const erroGravar = await gravarInterno(supabase, planoId, marcaId, {
      analysis: { ...analise, critica },
    })

    if (erroGravar) {
      return json({ erro: 'A avaliação saiu, mas não consegui gravar: ' + erroGravar }, 500)
    }

    if (corridaId) {
      await supabase
        .from('ai_runs')
        .update({
          status: 'ok',
          input_tokens: r.uso.entrada,
          cache_write_tokens: r.uso.escritaCache,
          cache_read_tokens: r.uso.leituraCache,
          output_tokens: r.uso.saida,
          cost_usd: Number(r.custoUsd.toFixed(6)),
          latency_ms: r.latenciaMs,
        })
        .eq('id', corridaId)
    }

    return json({
      critica,
      custoUsd: Number(r.custoUsd.toFixed(4)),
      segundos: Math.round(r.latenciaMs / 1000),
    })
  } catch (e) {
    const mensagem =
      e instanceof ErroClaude ? e.message : e instanceof Error ? e.message : 'Falha inesperada.'
    if (corridaId) {
      await supabase
        .from('ai_runs')
        .update({ status: 'failed', error: mensagem.slice(0, 500) })
        .eq('id', corridaId)
    }
    return json({ erro: mensagem }, 500)
  }
}
