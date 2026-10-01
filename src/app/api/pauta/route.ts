/**
 * O rascunho de uma pauta avulsa.
 *
 * Esta rota NÃO grava nada. Ela devolve o rascunho para o formulário,
 * e quem grava é a pessoa, depois de ler. É de propósito: acrescentar
 * uma pauta a um mês aprovado obriga o cliente a decidir de novo, e
 * essa decisão não pode sair de um clique em "preencher com IA" sem
 * ninguém ter lido o que saiu.
 *
 * Por isso também não existe caminho de gravação automática aqui, nem
 * um botão "gerar e salvar". Quem assina a pauta é quem a leu.
 */

import { clienteServidor } from '@/lib/supabase/server'
import { chamarClaude, extrairJson, ErroClaude, MODELO_PADRAO } from '@/lib/claude'
import { registro } from '@/lib/registro'
import { lerInterno } from '@/lib/interno'
import { diasNoMes } from '@/lib/prompt'
import {
  montarPromptPauta,
  conferirRascunho,
  paraFormulario,
  SISTEMA_PAUTA,
  VERSAO_PROMPT_PAUTA,
  type Rascunho,
  type PautaNoMes,
} from '@/lib/pauta'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  let corpo: { planoId?: string; pedido?: string }
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Pedido malformado.' }, 400)
  }

  const planoId = String(corpo.planoId ?? '')
  const pedido = String(corpo.pedido ?? '').trim()
  if (!planoId) return json({ erro: 'Faltou dizer de qual mês.' }, 400)
  if (!pedido) return json({ erro: 'Escreva em uma linha o que a pauta precisa ser.' }, 400)
  if (pedido.length > 1000) return json({ erro: 'O pedido está longo demais.' }, 400)

  const log = registro('pauta')
  await log.passo('pedido recebido')

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ erro: 'Sua sessão expirou. Entre de novo.' }, 401)

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const papel = (perfil?.role as string) ?? 'client'
  if (papel !== 'admin' && papel !== 'staff') {
    return json({ erro: 'Só a equipe da Alta cria pauta.' }, 403)
  }

  const { data: plano } = await supabase
    .from('plans')
    .select('id, brand_id, month, year, status')
    .eq('id', planoId)
    .maybeSingle()

  if (!plano) return json({ erro: 'Não achei este planejamento, ou você não tem acesso a ele.' }, 404)

  // Quem só lê não gasta chamada de IA, e quem não pode rodar geração
  // também não. A conferência vem ANTES da chamada de propósito: sem
  // ela o dinheiro sai, o texto volta, e só então o banco recusa a
  // gravação. O gasto já teria acontecido.
  const [{ data: nivel }, { data: podeGerar }] = await Promise.all([
    supabase.rpc('nivel_na_marca', { b: plano.brand_id }),
    supabase.rpc('pode', { p: 'planejamento' }),
  ])
  if (nivel !== 'owner' && nivel !== 'editor') {
    return json({ erro: 'Você tem acesso de leitura nesta marca; escrever pauta é de quem edita.' }, 403)
  }
  if (podeGerar !== true) {
    return json({ erro: 'Você não tem permissão para rodar a IA. Escreva a pauta à mão.' }, 403)
  }

  const [{ data: marca }, { data: secoes }, { data: pautas }, { data: escopo }, interno] =
    await Promise.all([
      supabase.from('brands').select('name, segment').eq('id', plano.brand_id).single(),
      supabase.from('brand_knowledge').select('section, content').eq('brand_id', plano.brand_id),
      supabase
        .from('content_ideas')
        .select('title, editorial_line, theme, content_channels(platform, scheduled_date)')
        .eq('plan_id', planoId)
        .order('position'),
      supabase
        .from('brand_scope')
        .select('label')
        .eq('brand_id', plano.brand_id)
        .eq('active', true)
        .order('position'),
      lerInterno(supabase, planoId),
    ])

  if (!marca) return json({ erro: 'Não consegui carregar a marca.' }, 500)

  const base: Record<string, Record<string, string>> = {}
  for (const s of secoes ?? []) {
    const c = (s.content ?? {}) as Record<string, unknown>
    const limpo: Record<string, string> = {}
    for (const [k, v] of Object.entries(c)) if (typeof v === 'string') limpo[k] = v
    base[s.section as string] = limpo
  }
  const noMes: PautaNoMes[] = (pautas ?? []).map((p) => {
    const canais = (p.content_channels ?? []) as { platform?: string; scheduled_date?: string }[]
    const c = canais[0]
    const d = c?.scheduled_date ? Number(c.scheduled_date.slice(8, 10)) : null
    return {
      titulo: String(p.title ?? ''),
      pilar: (p.editorial_line as string | null) ?? null,
      tema: (p.theme as string | null) ?? null,
      dia: d && Number.isFinite(d) ? d : null,
      plataforma: (c?.platform as string | undefined) ?? null,
    }
  })

  const dias = diasNoMes(Number(plano.year), Number(plano.month))
  const linhas = (escopo ?? []).map((e) => String(e.label ?? '')).filter(Boolean)
  const leitura = ((interno.analysis?.leitura as string | null) ?? null) || null

  const prompt = montarPromptPauta({
    marca: { nome: marca.name as string, segmento: (marca.segment as string | null) ?? null },
    base,
    mes: Number(plano.month),
    ano: Number(plano.year),
    dias,
    pedido,
    noMes,
    linhas,
    ocupados: [...new Set(noMes.map((p) => p.dia).filter((d): d is number => d !== null))],
    leitura,
  })

  const { data: corrida } = await supabase
    .from('ai_runs')
    .insert({
      brand_id: plano.brand_id,
      plan_id: planoId,
      agent: 'pauta_nova',
      model: MODELO_PADRAO,
      prompt_version: VERSAO_PROMPT_PAUTA,
      status: 'running',
    })
    .select('id')
    .single()
  const corridaId = corrida?.id as string | undefined

  await log.passo('chamando a Anthropic', `${prompt.length} caracteres, ${noMes.length} pautas no mes`)

  try {
    const r = await chamarClaude(prompt, {
      system: SISTEMA_PAUTA,
      maxTokens: 4000,
      limiteSegundos: 180,
    })

    await log.passo('resposta', `${r.texto.length} caracteres, US$ ${r.custoUsd.toFixed(4)}`)

    const rascunho = extrairJson<Rascunho>(r.texto)
    const achados = conferirRascunho(rascunho, { dias, linhas, noMes })

    if (corridaId) {
      await supabase
        .from('ai_runs')
        .update({
          status: achados.some((a) => a.gravidade === 'erro') ? 'failed' : 'ok',
          error: achados
            .filter((a) => a.gravidade === 'erro')
            .map((a) => a.texto)
            .join(' | ')
            .slice(0, 500) || null,
          input_tokens: r.uso.entrada,
          output_tokens: r.uso.saida,
          cost_usd: Number(r.custoUsd.toFixed(6)),
          latency_ms: r.latenciaMs,
        })
        .eq('id', corridaId)
    }

    if (achados.some((a) => a.gravidade === 'erro')) {
      return json({ erro: achados.map((a) => a.texto).join(' '), achados }, 422)
    }

    await log.passo('FIM, rascunho devolvido')

    return json({
      ok: true,
      achados,
      custoUsd: Number(r.custoUsd.toFixed(4)),
      segundos: Math.round(r.latenciaMs / 1000),
      rascunho: paraFormulario(rascunho, { dias }),
    })
  } catch (e) {
    const msg = e instanceof ErroClaude ? e.message : e instanceof Error ? e.message : 'erro desconhecido'
    await log.passo('FALHOU', msg.slice(0, 160))
    if (corridaId) {
      await supabase
        .from('ai_runs')
        .update({
          status: 'failed',
          error: msg.slice(0, 500),
          cost_usd: e instanceof ErroClaude ? Number((e.custoUsd ?? 0).toFixed(6)) : 0,
        })
        .eq('id', corridaId)
    }
    return json({ erro: 'A IA não respondeu: ' + msg }, 502)
  }
}
