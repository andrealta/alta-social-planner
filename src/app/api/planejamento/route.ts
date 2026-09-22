/**
 * Gera o planejamento do mês.
 *
 * É uma rota, e não uma Server Action, por um motivo prático: a
 * geração leva minutos e a tela precisa mostrar que está viva. A rota
 * devolve linhas NDJSON à medida que o texto chega do Claude.
 *
 * Toda leitura e toda escrita passam pelo cliente do usuário logado,
 * então as políticas do banco valem aqui igual valem na tela. A chave
 * da Anthropic é a única coisa que vive só neste lado.
 */

import { clienteServidor } from '@/lib/supabase/server'
import { registro } from '@/lib/registro'
import { coletarEstilo, blocoDeEstilo } from '@/lib/estilo'
import { coletarConcorrencia, blocoDeConcorrencia } from '@/lib/concorrencia'
import { chamarClaude, extrairJson, ErroClaude, MODELO_PADRAO, type Uso } from '@/lib/claude'
import {
  montarPromptPautas,
  conferir,
  SISTEMA,
  VERSAO_PROMPT,
  PLATAFORMAS,
  MESES,
  OBJETIVOS_META,
  type Planejamento,
  type Entrada,
  type Linha,
} from '@/lib/prompt'
import { lerAnalises, gravarInterno } from '@/lib/interno'

export const dynamic = 'force-dynamic'
/**
 * O Opus 5 raciocina vários minutos antes de escrever um mês inteiro.
 * Localmente não há limite; na Vercel este número é o teto. Se um dia
 * ele não bastar, a saída não é aumentá-lo mais: é tirar a geração da
 * requisição e passá-la para uma fila.
 */
export const maxDuration = 600

type Corpo = {
  slug?: string
  mes?: number
  ano?: number
  briefing?: string
  /** Quanto o cliente investe em mídia neste mês, no total. Opcional. */
  investimento?: number | null
  substituir?: boolean
}

function linha(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + '\n')
}

/**
 * Quanto espaço a resposta pode ocupar.
 *
 * O Opus 5 raciocina antes de escrever, e o raciocínio SAI DESTE MESMO
 * limite. Na primeira versão eu dimensionei o limite só pelo texto
 * final: o modelo gastou os 15.100 tokens inteiros pensando e parou
 * antes da primeira letra — duas vezes, a US$ 0,44 cada.
 *
 * Então o limite agora é generoso. Ele não é o custo: cobra-se o que
 * for usado, não o que foi reservado.
 */
function limiteDeTokens(pecas: number): number {
  return Math.min(64000, 24000 + pecas * 1500)
}

function erro(mensagem: string, status = 400): Response {
  return new Response(JSON.stringify({ tipo: 'erro', mensagem }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  let corpo: Corpo
  try {
    corpo = (await req.json()) as Corpo
  } catch {
    return erro('Pedido malformado.')
  }

  const slug = String(corpo.slug ?? '')
  const mes = Number(corpo.mes)
  const ano = Number(corpo.ano)
  const briefing = String(corpo.briefing ?? '')

  // A verba do mês é opcional: sem ela o planejamento sai como sempre
  // saiu, só sem plano de mídia. Nunca pode virar pré-requisito para
  // gerar um mês.
  const bruto = corpo.investimento
  const investimento = bruto === null || bruto === undefined ? null : Number(bruto)
  if (investimento !== null && (!Number.isFinite(investimento) || investimento < 0)) {
    return erro('O investimento do mês precisa ser um valor em reais, ou ficar em branco.')
  }

  if (!slug) return erro('Faltou dizer a marca.')
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return erro('Mês inválido.')
  if (!Number.isInteger(ano) || ano < 2024 || ano > 2100) return erro('Ano inválido.')

  const log = registro(`${slug} ${mes}/${ano}`)
  await log.passo('pedido recebido')

  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return erro('Sua sessão expirou. Entre de novo.', 401)
  await log.passo('usuario autenticado')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const papel = (perfil?.role as string) ?? 'client'
  if (papel !== 'admin' && papel !== 'staff') {
    return erro('Só a equipe da Alta pode gerar planejamento.', 403)
  }

  // ---------- a marca e a base ----------
  const { data: marca } = await supabase
    .from('brands')
    .select('id, name, segment')
    .eq('slug', slug)
    .maybeSingle()
  if (!marca) return erro('Não achei esta marca, ou você não tem acesso a ela.', 404)
  await log.passo('marca carregada')

  const marcaId = marca.id as string

  // Quem só lê não gasta chamada de IA — e gerar um mês é a chamada
  // mais cara do sistema.
  const { data: nivel } = await supabase.rpc('nivel_na_marca', { b: marcaId })
  if (nivel !== 'owner' && nivel !== 'editor') {
    return erro('Você tem acesso de leitura nesta marca. Gerar o planejamento é de quem edita.', 403)
  }

  const [{ data: secoes }, { data: escopoBruto }] = await Promise.all([
    supabase.from('brand_knowledge').select('section, content').eq('brand_id', marcaId),
    supabase
      .from('brand_scope')
      .select('id, label, monthly_quota')
      .eq('brand_id', marcaId)
      .eq('active', true)
      .order('position'),
  ])

  const escopo: Linha[] = (escopoBruto ?? []).map((l) => ({
    label: l.label as string,
    quota: Number(l.monthly_quota),
  }))
  const idDaLinha = new Map<string, string>(
    (escopoBruto ?? []).map((l): [string, string] => [l.label as string, l.id as string]),
  )

  if (escopo.length === 0 || escopo.every((l) => l.quota === 0)) {
    return erro(
      'Esta marca não tem escopo contratado cadastrado. Sem saber quantas peças o contrato pede, não dá para planejar o mês.',
    )
  }

  const base: Record<string, Record<string, string>> = {}
  for (const s of secoes ?? []) {
    const conteudo = (s.content ?? {}) as Record<string, unknown>
    const limpo: Record<string, string> = {}
    for (const [k, v] of Object.entries(conteudo)) if (typeof v === 'string') limpo[k] = v
    base[s.section as string] = limpo
  }

  if (Object.keys(base).length === 0) {
    return erro('A base desta marca está vazia. Preencha antes de gerar.')
  }
  await log.passo('base e escopo carregados', `${Object.keys(base).length} secoes, ${escopo.length} linhas`)

  // Como esta marca escreve, em exemplos: legendas reais, correções que
  // a equipe já fez no texto da IA e pedidos do cliente. Vale mais que
  // a descrição de tom de voz — e cresce sozinho com o uso.
  const estilo = blocoDeEstilo(await coletarEstilo(supabase, marcaId, base))
  if (estilo) await log.passo('voz da marca reunida', `${estilo.length} caracteres de exemplo`)

  // A última varredura dos concorrentes, quando existe. Entra no prompt
  // como restrição — o que já está ocupado e onde está o vazio —, nunca
  // como exemplo a imitar. Sem varredura, o mês é gerado como sempre
  // foi: isto nunca pode virar pré-requisito para trabalhar.
  const concorrencia = blocoDeConcorrencia(await coletarConcorrencia(supabase, marcaId))
  if (concorrencia) {
    await log.passo('concorrencia lida', `${concorrencia.length} caracteres de varredura`)
  }

  // ---------- o mês já existe? ----------
  const { data: planoExistente } = await supabase
    .from('plans')
    .select('id, status')
    .eq('brand_id', marcaId)
    .eq('year', ano)
    .eq('month', mes)
    .maybeSingle()

  let planoId = planoExistente?.id as string | undefined

  if (planoExistente) {
    const { data: pautasExistentes } = await supabase
      .from('content_ideas')
      .select('id, status')
      .eq('plan_id', planoId)

    const quantas = pautasExistentes?.length ?? 0
    const tocadas = (pautasExistentes ?? []).filter((p) => p.status !== 'ai_generated')

    if (tocadas.length > 0) {
      return erro(
        `${MESES[mes - 1]} de ${ano} já está em revisão: ${tocadas.length} pauta(s) saíram do estado original. Gerar de novo apagaria esse trabalho. Se é isso mesmo que você quer, mova ou apague o mês primeiro.`,
        409,
      )
    }

    if (quantas > 0 && !corpo.substituir) {
      return new Response(
        JSON.stringify({
          tipo: 'confirmar',
          mensagem: `${MESES[mes - 1]} de ${ano} já tem ${quantas} pautas geradas e nenhuma foi revisada ainda. Gerar de novo substitui todas.`,
          pautas: quantas,
        }),
        { status: 409, headers: { 'content-type': 'application/json; charset=utf-8' } },
      )
    }

    if (quantas > 0) {
      const { error: erroApagar } = await supabase.from('content_ideas').delete().eq('plan_id', planoId)
      if (erroApagar) return erro('Não consegui limpar as pautas anteriores: ' + erroApagar.message, 500)
    }
  }

  await log.passo('mes conferido')

  // ---------- histórico ----------
  const { data: anteriores } = await supabase
    .from('plans')
    .select('id, month, year')
    .eq('brand_id', marcaId)
    .or(`year.lt.${ano},and(year.eq.${ano},month.lt.${mes})`)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(3)

  const historico: Entrada['historico'] = []
  for (const p of anteriores ?? []) {
    const { data: temas } = await supabase
      .from('content_ideas')
      .select('theme, title')
      .eq('plan_id', p.id)
    historico.push({
      mes: Number(p.month),
      ano: Number(p.year),
      temas: (temas ?? [])
        .map((t) => ((t.theme as string) ?? (t.title as string) ?? '').trim())
        .filter(Boolean),
    })
  }
  historico.reverse()

  // Territórios que já apareceram nos meses anteriores.
  //
  // A tag "novo" na leitura do mês era um campo que eu pedia à IA sem
  // nunca explicar o que significava — ela preenchia por conta, e por
  // isso aparecia em umas pautas e não em outras sem critério visível.
  // Agora quem decide é a comparação com o histórico: nome que não
  // estava nos meses anteriores é novo. No primeiro mês da marca nada
  // é novo, porque não existe "antes" com o que comparar.
  const territoriosDeAntes = new Set<string>()
  const analisesDeAntes = await lerAnalises(
    supabase,
    (anteriores ?? []).map((p) => p.id as string),
  )
  for (const p of anteriores ?? []) {
    const a = (analisesDeAntes.get(p.id as string) ?? {}) as { territorios?: { nome?: string }[] }
    for (const t of a.territorios ?? []) {
      const n = (t.nome ?? '').trim().toLowerCase()
      if (n) territoriosDeAntes.add(n)
    }
  }
  const temPassado = (anteriores ?? []).length > 0

  const entrada: Entrada = {
    marca: { nome: marca.name as string, segmento: marca.segment as string | null },
    base,
    estilo,
    concorrencia,
    escopo,
    mes,
    ano,
    briefing,
    investimento,
    historico,
  }

  const temVerba = investimento !== null && investimento > 0

  const prompt = montarPromptPautas(entrada)
  const totalPecas = escopo.reduce((a, l) => a + l.quota, 0)
  await log.passo('prompt montado', `${prompt.length} caracteres, ${historico.length} mes(es) de historico`)

  // Em desenvolvimento, guarda o prompt exato que foi enviado. É o que
  // permite repetir a MESMA chamada fora do Next e comparar. Contém
  // dados da marca, então fica fora do Git e pode ser apagado.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(
        'ultimo-prompt.json',
        JSON.stringify(
          { modelo: MODELO_PADRAO, system: SISTEMA, max_tokens: limiteDeTokens(totalPecas), prompt },
          null,
          2,
        ),
        'utf8',
      )
    } catch {
      /* diagnóstico nunca derruba a geração */
    }
  }

  // ---------- o plano e o registro da corrida ----------
  if (!planoId) {
    const { data: novo, error: erroPlano } = await supabase
      .from('plans')
      .insert({
        brand_id: marcaId,
        month: mes,
        year: ano,
        status: 'generating',
        investimento_total: investimento,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (erroPlano || !novo) return erro('Não consegui criar o planejamento: ' + (erroPlano?.message ?? ''), 500)
    planoId = novo.id as string
  } else {
    // A verba entra ANTES das pautas: o gatilho `investimento_guard`
    // compara a soma das publicações com este total, e se ele ainda
    // fosse o do mês passado a gravação seria recusada sem motivo.
    await supabase
      .from('plans')
      .update({ status: 'generating', investimento_total: investimento })
      .eq('id', planoId)
  }
  // O briefing é da equipe: mora em plano_interno, onde o cliente não chega.
  await gravarInterno(supabase, planoId, marcaId, { briefing })

  const { data: corrida } = await supabase
    .from('ai_runs')
    .insert({
      brand_id: marcaId,
      plan_id: planoId,
      agent: 'strategy',
      model: MODELO_PADRAO,
      prompt_version: VERSAO_PROMPT,
      status: 'running',
    })
    .select('id')
    .single()
  const corridaId = corrida?.id as string | undefined
  await log.passo('plano e corrida criados')

  // ---------- a geração, em fluxo ----------
  const fluxo = new ReadableStream<Uint8Array>({
    async start(controle) {
      const enviar = (o: unknown) => {
        try {
          controle.enqueue(linha(o))
        } catch {
          /* o navegador fechou a aba */
        }
      }

      // Enquanto nada chega da API, a tela precisa mostrar que a espera
      // é a espera, e não um travamento. Um pulso a cada 5 segundos.
      let vivo = true
      const inicioEspera = Date.now()
      let jaVeioAlgo = false
      const batimento = setInterval(() => {
        if (!vivo || jaVeioAlgo) return
        enviar({ tipo: 'pulso', segundos: Math.round((Date.now() - inicioEspera) / 1000) })
      }, 5000)

      const falhar = async (mensagem: string, gasto?: { uso?: Uso; custoUsd?: number }) => {
        await log.passo(
          'FALHOU',
          mensagem.slice(0, 160) +
            (gasto?.custoUsd ? ` [gastou US$ ${gasto.custoUsd.toFixed(4)}]` : ''),
        )
        vivo = false
        clearInterval(batimento)
        if (corridaId) {
          // O que já foi consumido entra no registro mesmo em falha.
          // Custo de tentativa frustrada é custo.
          await supabase
            .from('ai_runs')
            .update({
              status: 'failed',
              error: mensagem.slice(0, 500),
              input_tokens: gasto?.uso?.entrada ?? 0,
              output_tokens: gasto?.uso?.saida ?? 0,
              cost_usd: Number((gasto?.custoUsd ?? 0).toFixed(6)),
            })
            .eq('id', corridaId)
        }
        await supabase.from('plans').update({ status: 'draft' }).eq('id', planoId)
        enviar({ tipo: 'erro', mensagem })
        controle.close()
      }

      await log.passo('fluxo aberto, mandando o primeiro evento')
      enviar({
        tipo: 'inicio',
        planoId,
        marca: marca.name,
        mes,
        ano,
        pecas: totalPecas,
        promptChars: prompt.length,
      })

      try {
        await log.passo('chamando a Anthropic')
        let ultimoAviso = 0
        let faseAnterior = ''
        let primeiroDelta = false
        const r = await chamarClaude(prompt, {
          system: SISTEMA,
          modelo: MODELO_PADRAO,
          maxTokens: limiteDeTokens(totalPecas),
          aoConectar: (status, ms) => {
            void log.passo('conectado na Anthropic', `HTTP ${status} em ${ms}ms`)
            enviar({ tipo: 'conectado' })
          },
          aoReceber: (fase, acumulado) => {
            if (!primeiroDelta) {
              primeiroDelta = true
              jaVeioAlgo = true
              void log.passo('primeiro pedaco da resposta', fase)
            }
            // Uma linha a cada ~400 caracteres, e sempre na virada de
            // fase — é a virada que diz à pessoa que saiu do raciocínio
            // e começou a escrever.
            if (fase !== faseAnterior || acumulado - ultimoAviso >= 400) {
              if (fase !== faseAnterior) ultimoAviso = 0
              faseAnterior = fase
              ultimoAviso = acumulado
              enviar({ tipo: 'progresso', fase, chars: acumulado })
            }
          },
        })

        vivo = false
        clearInterval(batimento)
        await log.passo(
          'resposta completa',
          `${r.texto.length} caracteres de texto, ${r.pensamento} de raciocinio, ` +
            `${r.uso.saida} tokens de saida, ${Math.round(r.latenciaMs / 1000)}s, US$ ${r.custoUsd.toFixed(4)}`,
        )
        enviar({ tipo: 'progresso', fase: 'escrevendo', chars: r.texto.length, fim: true })

        let plano: Planejamento
        try {
          plano = extrairJson<Planejamento>(r.texto)
        } catch (e) {
          await falhar(e instanceof Error ? e.message : 'A resposta não veio em JSON.')
          return
        }

        await log.passo('json extraido', `${plano.pautas?.length ?? 0} pautas`)
        const achados = conferir(plano, entrada)
        enviar({ tipo: 'conferencia', achados, pautas: plano.pautas?.length ?? 0 })

        // ---------- gravação ----------
        const pautas = (plano.pautas ?? []).slice(0, 200)

        // O plano de mídia sai da IA já conferido (`conferir` corta o
        // que passa do total). "Sem impulsionamento" vira objetivo
        // gravado com verba zero, e não campo vazio: é uma decisão
        // tomada, e a equipe precisa ver a diferença entre "decidiram
        // não impulsionar" e "ninguém olhou isto ainda".
        const objetivosValidos: string[] = [...OBJETIVOS_META]
        const midiaDa = (p: (typeof pautas)[number]) => {
          if (!temVerba) return { objetivo: null, investimento: null, justificativa: null }
          const objetivo = (p.midia?.objetivo ?? '').trim()
          const valor = Number(p.midia?.investimento ?? 0)
          const bom = Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : 0
          return {
            objetivo: objetivosValidos.includes(objetivo)
              ? objetivo
              : bom > 0
                ? null
                : 'Sem impulsionamento',
            investimento: bom,
            justificativa: (p.midia?.porque ?? '').trim() || null,
          }
        }

        const paraGravar = pautas.map((p, i) => {
          const midia = midiaDa(p)
          return {
            brand_id: marcaId,
            plan_id: planoId,
            title: String(p.titulo ?? '(sem título)').slice(0, 300),
            concept: p.conceito ?? null,
            description: p.descricao ?? null,
            editorial_line: p.pilar ?? null,
            objective: p.objetivo ?? null,
            theme: p.tema ?? null,
            rationale: p.justificativa ?? null,
            cta: p.cta ?? null,
            scope_id: idDaLinha.get(String(p.linha ?? '').trim()) ?? null,
            meta_objetivo: midia.objetivo,
            meta_investimento: midia.investimento,
            meta_justificativa: midia.justificativa,
            status: 'ai_generated',
            position: i,
          }
        })

        const { data: gravadas, error: erroPautas } = await supabase
          .from('content_ideas')
          .insert(paraGravar)
          .select('id, position')

        if (erroPautas || !gravadas) {
          await falhar('As pautas não gravaram: ' + (erroPautas?.message ?? 'motivo desconhecido'))
          return
        }

        await log.passo('pautas gravadas', gravadas.length)
        const idPorPosicao = new Map<number, string>(
          gravadas.map((g): [number, string] => [Number(g.position), g.id as string]),
        )
        const dias = new Date(ano, mes, 0).getDate()

        const canais = pautas
          .map((p, i) => {
            const id = idPorPosicao.get(i)
            if (!id) return null
            const dia = Math.min(Math.max(Number(p.dia) || 1, 1), dias)
            const plat = String(p.plataforma ?? 'instagram').toLowerCase()
            return {
              brand_id: marcaId,
              idea_id: id,
              platform: PLATAFORMAS.includes(plat) ? plat : 'instagram',
              format: String(p.formato ?? 'Feed').slice(0, 80) || 'Feed',
              scheduled_date: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
            }
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)

        if (canais.length > 0) {
          const { error: erroCanais } = await supabase.from('content_channels').insert(canais)
          if (erroCanais) {
            enviar({
              tipo: 'aviso',
              mensagem: 'As pautas gravaram, mas as datas não: ' + erroCanais.message,
            })
          }
        }

        await supabase.from('plans').update({ status: 'internal_review' }).eq('id', planoId)

        // A análise vai para plano_interno: o cliente lê `plans`, e a
        // leitura do mês é raciocínio da agência, não entrega.
        const erroAnalise = await gravarInterno(supabase, planoId as string, marcaId, {
          briefing,
          analysis: {
            leitura: plano.leitura ?? null,
            territorios: (plano.territorios ?? []).map((t) => ({
              ...t,
              novo: temPassado && !territoriosDeAntes.has((t.nome ?? '').trim().toLowerCase()),
            })),
            conferencia: plano.conferencia ?? {},
            nao_fazer: plano.nao_fazer ?? [],
            alertas: plano.alertas ?? [],
            achados,
            gerado_em: new Date().toISOString(),
            modelo: r.modelo,
            versao_prompt: VERSAO_PROMPT,
          },
        })
        if (erroAnalise) {
          enviar({ tipo: 'aviso', mensagem: 'As pautas gravaram, mas a leitura do mês não: ' + erroAnalise })
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

        await log.passo('FIM, tudo certo')
        enviar({
          tipo: 'fim',
          ok: true,
          planoId,
          pautas: gravadas.length,
          achados,
          custoUsd: Number(r.custoUsd.toFixed(4)),
          segundos: Math.round(r.latenciaMs / 1000),
          tokens: { entrada: r.uso.entrada, saida: r.uso.saida },
        })
        controle.close()
      } catch (e) {
        vivo = false
        clearInterval(batimento)
        const mensagem =
          e instanceof ErroClaude
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Algo deu errado na geração.'
        await falhar(
          mensagem,
          e instanceof ErroClaude ? { uso: e.uso, custoUsd: e.custoUsd } : undefined,
        )
      }
    },
  })

  return new Response(fluxo, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
