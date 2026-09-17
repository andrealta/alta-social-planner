/**
 * Refina uma pauta a pedido da equipe.
 *
 * A diferença para a geração: aqui a IA recebe a pauta que já existe e
 * muda só o que foi pedido. E o resultado é gravado pela mesma função
 * do banco que a edição manual usa — com o carimbo 'ai', para o
 * histórico distinguir o que a máquina escreveu do que a equipe
 * escreveu.
 */

import { clienteServidor } from '@/lib/supabase/server'
import { chamarClaude, extrairJson, ErroClaude, MODELO_PADRAO } from '@/lib/claude'
import { registro } from '@/lib/registro'
import {
  montarPromptRefino,
  conferirRefino,
  SISTEMA_REFINO,
  VERSAO_PROMPT,
  type Refino,
} from '@/lib/prompt'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  let corpo: { ideaId?: string; comando?: string }
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Pedido malformado.' }, 400)
  }

  const ideaId = String(corpo.ideaId ?? '')
  const comando = String(corpo.comando ?? '').trim()

  if (!ideaId) return json({ erro: 'Faltou dizer qual pauta.' }, 400)
  if (comando.length < 3) return json({ erro: 'Diga o que você quer mudar.' }, 400)
  if (comando.length > 1000) return json({ erro: 'O pedido ficou longo demais.' }, 400)

  const log = registro('refino')
  await log.passo('pedido recebido', comando.slice(0, 60))

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ erro: 'Sua sessão expirou. Entre de novo.' }, 401)

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const papel = (perfil?.role as string) ?? 'client'
  if (papel !== 'admin' && papel !== 'staff') {
    return json({ erro: 'Só a equipe da Alta pode pedir refino.' }, 403)
  }

  // A pauta só aparece aqui se as políticas do banco deixarem.
  const { data: pauta } = await supabase
    .from('content_ideas')
    .select(
      'id, brand_id, plan_id, title, theme, concept, description, editorial_line, objective, rationale, cta, status, scope_id',
    )
    .eq('id', ideaId)
    .maybeSingle()

  if (!pauta) return json({ erro: 'Não achei esta pauta, ou você não tem acesso a ela.' }, 404)

  if (pauta.status === 'client_approved') {
    return json(
      { erro: 'Esta pauta já foi aprovada pelo cliente. Reabrir é uma decisão de gente, não de IA.' },
      409,
    )
  }

  const [{ data: marca }, { data: plano }, { data: secoes }, { data: canal }, { data: linha }] =
    await Promise.all([
      supabase.from('brands').select('name, segment').eq('id', pauta.brand_id).single(),
      supabase.from('plans').select('month, year, analysis').eq('id', pauta.plan_id).single(),
      supabase.from('brand_knowledge').select('section, content').eq('brand_id', pauta.brand_id),
      supabase
        .from('content_channels')
        .select('format, scheduled_date')
        .eq('idea_id', ideaId)
        .maybeSingle(),
      pauta.scope_id
        ? supabase.from('brand_scope').select('label').eq('id', pauta.scope_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  if (!marca || !plano) return json({ erro: 'Não consegui carregar o contexto da pauta.' }, 500)

  const base: Record<string, Record<string, string>> = {}
  for (const s of secoes ?? []) {
    const c = (s.content ?? {}) as Record<string, unknown>
    const limpo: Record<string, string> = {}
    for (const [k, v] of Object.entries(c)) if (typeof v === 'string') limpo[k] = v
    base[s.section as string] = limpo
  }

  const analise = (plano.analysis ?? {}) as {
    leitura?: string
    territorios?: { nome: string; peso: number }[]
  }

  const data = canal?.scheduled_date as string | undefined

  const prompt = montarPromptRefino({
    marca: { nome: marca.name as string, segmento: marca.segment as string | null },
    base,
    mes: Number(plano.month),
    ano: Number(plano.year),
    leitura: analise.leitura ?? null,
    territorios: analise.territorios ?? [],
    pauta: {
      dia: data ? Number(data.slice(8, 10)) : null,
      linha: (linha?.label as string) ?? null,
      formato: (canal?.format as string) ?? null,
      objetivo: (pauta.objective as string) ?? null,
      pilar: (pauta.editorial_line as string) ?? null,
      tema: (pauta.theme as string) ?? null,
      titulo: (pauta.title as string) ?? '',
      conceito: (pauta.concept as string) ?? null,
      descricao: (pauta.description as string) ?? null,
      cta: (pauta.cta as string) ?? null,
      justificativa: (pauta.rationale as string) ?? null,
    },
    comando,
  })

  const { data: corrida } = await supabase
    .from('ai_runs')
    .insert({
      brand_id: pauta.brand_id,
      plan_id: pauta.plan_id,
      idea_id: ideaId,
      agent: 'refine',
      model: MODELO_PADRAO,
      prompt_version: VERSAO_PROMPT,
      status: 'running',
    })
    .select('id')
    .single()
  const corridaId = corrida?.id as string | undefined

  await log.passo('chamando a Anthropic', `${prompt.length} caracteres`)

  try {
    // Limite generoso: o raciocínio sai deste mesmo bolso, e foi
    // apertá-lo demais que travou a geração na primeira tentativa.
    const r = await chamarClaude(prompt, {
      system: SISTEMA_REFINO,
      maxTokens: 20000,
      limiteSegundos: 280,
    })

    await log.passo('resposta', `${r.texto.length} caracteres, US$ ${r.custoUsd.toFixed(4)}`)

    const novo = extrairJson<Refino>(r.texto)
    const achados = conferirRefino(novo, base)

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
      // Não grava: uma pauta com expressão proibida não pode entrar no
      // banco só porque veio da IA.
      return json({ erro: achados.map((a) => a.texto).join(' '), achados }, 422)
    }

    const { data: versao, error: erroGravar } = await supabase.rpc('salvar_pauta', {
      p_id: ideaId,
      p_title: novo.titulo,
      p_theme: novo.tema || null,
      p_concept: novo.conceito || null,
      p_description: novo.descricao || null,
      p_editorial_line: novo.pilar || null,
      p_objective: (pauta.objective as string) ?? null,
      p_rationale: novo.justificativa || null,
      p_cta: novo.cta || null,
      p_motivo: `Pedido da equipe: ${comando}`,
      p_origem: 'ai',
    })

    if (erroGravar) {
      await log.passo('FALHOU ao gravar', erroGravar.message.slice(0, 120))
      return json({ erro: 'A IA respondeu, mas a gravação falhou: ' + erroGravar.message }, 500)
    }

    // O formato fica no canal, não na pauta.
    if (novo.formato && canal && novo.formato !== canal.format) {
      await supabase
        .from('content_channels')
        .update({ format: novo.formato })
        .eq('idea_id', ideaId)
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

    await log.passo('FIM', `versao ${versao}`)

    return json({
      ok: true,
      versao: Number(versao),
      oQueMudou: novo.o_que_mudou ?? '',
      achados,
      custoUsd: Number(r.custoUsd.toFixed(4)),
      segundos: Math.round(r.latenciaMs / 1000),
      pauta: {
        title: novo.titulo,
        theme: novo.tema ?? '',
        concept: novo.conceito ?? '',
        description: novo.descricao ?? '',
        editorial_line: novo.pilar ?? '',
        rationale: novo.justificativa ?? '',
        cta: novo.cta ?? '',
        formato: novo.formato ?? (canal?.format as string) ?? '',
      },
    })
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Algo deu errado no refino.'
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
