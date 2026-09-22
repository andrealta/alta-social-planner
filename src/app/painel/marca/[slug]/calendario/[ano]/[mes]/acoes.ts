'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/lib/supabase/server'

export type Resultado = { ok: boolean; erro?: string; versao?: number }

/**
 * Transições que a equipe interna pode fazer. Espelha o gatilho do
 * banco — e o banco continua sendo quem manda. Isto aqui existe só
 * para dar uma frase decente à pessoa antes da viagem até o servidor.
 */
const PERMITIDO: Record<string, string[]> = {
  ai_generated: ['internal_review', 'internal_changes', 'internally_approved'],
  internal_review: ['internal_changes', 'internally_approved'],
  internal_changes: ['internal_review', 'internally_approved'],
  internally_approved: ['internal_changes'],
  client_changes_requested: ['internal_changes', 'internal_review'],
}

async function equipe() {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { erro: 'Sua sessão expirou. Entre de novo.' as const }

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const papel = (perfil?.role as string) ?? 'client'
  if (papel !== 'admin' && papel !== 'staff') {
    return { erro: 'Só a equipe da Alta pode mexer no planejamento.' as const }
  }
  return { supabase, user }
}

function caminho(slug: string, ano: number, mes: number) {
  return `/painel/marca/${slug}/calendario/${ano}/${mes}`
}

/**
 * Remarca uma pauta para outro dia.
 *
 * Data não é conteúdo: mover no calendário não cria versão nova, e é
 * de propósito — senão o histórico de uma pauta vira um diário de
 * arrastões de mouse e o que importa se perde no meio.
 */
export async function moverPauta(
  slug: string,
  ideaId: string,
  data: string,
  ano: number,
  mes: number,
): Promise<Resultado> {
  const ctx = await equipe()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: 'Data inválida.' }

  const { error } = await ctx.supabase
    .from('content_channels')
    .update({ scheduled_date: data })
    .eq('idea_id', ideaId)

  if (error) return { ok: false, erro: error.message }

  revalidatePath(caminho(slug, ano, mes))
  return { ok: true }
}

/**
 * Grava o texto da pauta.
 *
 * Chama a função `salvar_pauta` do banco em vez de fazer um update
 * direto: ela arquiva a versão anterior e incrementa o número na mesma
 * transação. Duas chamadas separadas daqui poderiam deixar o histórico
 * pela metade se a segunda falhasse.
 */
export async function salvarPauta(
  slug: string,
  ideaId: string,
  campos: {
    title: string
    theme: string
    concept: string
    description: string
    editorial_line: string
    objective: string
    rationale: string
    cta: string
  },
  motivo: string,
  ano: number,
  mes: number,
): Promise<Resultado> {
  const ctx = await equipe()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  const limpo = (v: string) => {
    const t = (v ?? '').trim()
    return t === '' ? null : t
  }

  if (!limpo(campos.title)) return { ok: false, erro: 'A pauta precisa de um título.' }

  const { data, error } = await ctx.supabase.rpc('salvar_pauta', {
    p_id: ideaId,
    p_title: campos.title.trim(),
    p_theme: limpo(campos.theme),
    p_concept: limpo(campos.concept),
    p_description: limpo(campos.description),
    p_editorial_line: limpo(campos.editorial_line),
    p_objective: limpo(campos.objective),
    p_rationale: limpo(campos.rationale),
    p_cta: limpo(campos.cta),
    p_motivo: limpo(motivo),
  })

  if (error) {
    return {
      ok: false,
      erro:
        error.code === '42501' || error.message.includes('acesso')
          ? 'O banco recusou: você não tem acesso a esta pauta.'
          : error.message,
    }
  }

  revalidatePath(caminho(slug, ano, mes))
  return { ok: true, versao: Number(data) }
}

/** Muda o estado da pauta no ciclo de revisão. */
export async function mudarStatus(
  slug: string,
  ideaId: string,
  de: string,
  para: string,
  ano: number,
  mes: number,
): Promise<Resultado> {
  const ctx = await equipe()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  // A conferência acontece nos dois lugares de propósito: aqui para dar
  // uma frase decente à pessoa, e no banco porque é lá que a regra vale.
  if (!(PERMITIDO[de] ?? []).includes(para)) {
    return { ok: false, erro: `Não dá para ir de "${de}" para "${para}".` }
  }

  const { error } = await ctx.supabase
    .from('content_ideas')
    .update({ status: para })
    .eq('id', ideaId)

  if (error) {
    return {
      ok: false,
      erro: error.message.includes('Transição')
        ? 'O banco recusou essa mudança de estado. Recarregue a página: alguém pode ter mexido nesta pauta.'
        : error.message,
    }
  }

  revalidatePath(caminho(slug, ano, mes))
  return { ok: true }
}

/**
 * Aprova de uma vez as pautas que ainda não foram aprovadas.
 *
 * Existe porque, quando o mês sai bom, clicar catorze vezes é só
 * trabalho. Não toca no que já foi para o cliente nem no que está
 * marcado como pendente: essas duas a pessoa decidiu alguma coisa, e
 * um botão em massa não deve desfazer decisão.
 */
export async function aprovarTodas(
  slug: string,
  planoId: string,
  ano: number,
  mes: number,
): Promise<Resultado & { quantas?: number }> {
  const ctx = await equipe()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  const { data, error } = await ctx.supabase
    .from('content_ideas')
    .update({ status: 'internally_approved' })
    .eq('plan_id', planoId)
    .in('status', ['ai_generated', 'internal_review'])
    .select('id')

  if (error) return { ok: false, erro: error.message }

  revalidatePath(caminho(slug, ano, mes))
  return { ok: true, quantas: data?.length ?? 0 }
}

/**
 * Libera o mês para o cliente.
 *
 * A checagem de "tudo aprovado internamente" mora no banco, não aqui:
 * é a regra que impede a agência de mandar ao cliente algo que ela
 * própria ainda não leu, e regra dessas não pode depender de a tela
 * lembrar de conferir.
 */
export async function enviarAoCliente(
  slug: string,
  planoId: string,
  ano: number,
  mes: number,
): Promise<Resultado & { enviadas?: number }> {
  const ctx = await equipe()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  const { data, error } = await ctx.supabase.rpc('liberar_plano', { p_plan_id: planoId })

  if (error) {
    return {
      ok: false,
      erro: error.message.includes('aprovadas internamente')
        ? error.message
        : 'Não consegui enviar: ' + error.message,
    }
  }

  revalidatePath(caminho(slug, ano, mes))
  return { ok: true, enviadas: Number(data) }
}

/**
 * Grava o conteúdo escrito à mão pela equipe.
 *
 * Diferente da pauta, o conteúdo não é versionado: o que vale é o que
 * vai ser publicado, e guardar rascunho de legenda não ajuda ninguém.
 * A medida de Precisão também não muda com isto, porque ela conta
 * edição de PAUTA, não de legenda.
 */
export async function salvarConteudo(
  slug: string,
  ideaId: string,
  campos: {
    caption: string
    cta: string
    hashtags: string
    alt_text: string
    art_concept: string
    art_direction: string
    image_prompt: string
  },
  ano: number,
  mes: number,
): Promise<Resultado> {
  const ctx = await equipe()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  const limpo = (t: string) => {
    const x = (t ?? '').trim()
    return x === '' ? null : x
  }

  // As hashtags chegam como texto solto; viram lista, com o # na frente
  // e sem repetir.
  const tags = [
    ...new Set(
      (campos.hashtags ?? '')
        .split(/[\s,]+/)
        .map((h) => h.trim())
        .filter(Boolean)
        .map((h) => (h.startsWith('#') ? h : '#' + h)),
    ),
  ].slice(0, 30)

  const { error } = await ctx.supabase
    .from('idea_content')
    .update({
      caption: limpo(campos.caption),
      cta: limpo(campos.cta),
      hashtags: tags,
      alt_text: limpo(campos.alt_text),
      art_concept: limpo(campos.art_concept),
      art_direction: limpo(campos.art_direction),
      image_prompt: limpo(campos.image_prompt),
      updated_at: new Date().toISOString(),
    })
    .eq('idea_id', ideaId)

  if (error) return { ok: false, erro: error.message }

  revalidatePath(caminho(slug, ano, mes))
  return { ok: true }
}

/**
 * Grava o plano de mídia de uma publicação.
 *
 * Fica separado de `salvarPauta` por um motivo de fundo: mexer no
 * objetivo de campanha ou no valor investido NÃO é mexer no conteúdo.
 * Se passasse por `salvar_pauta`, cada ajuste de verba criaria uma
 * versão nova, mandaria o texto anterior para o histórico e contaria
 * como edição na medida de Precisão — que existe para responder
 * "quanto do que a IA escreveu foi aproveitado". Distribuir verba não
 * responde nada disso.
 *
 * Quem impede a soma de passar do total do mês é o banco (migração
 * 0026). A conta feita na tela é cortesia, não trava.
 */
export async function salvarMidia(
  slug: string,
  ideaId: string,
  midia: { objetivo: string | null; investimento: number | null; justificativa: string | null },
  ano: number,
  mes: number,
): Promise<Resultado> {
  const ctx = await equipe()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  const objetivo = (midia.objetivo ?? '').trim() || null
  const bruto = Number(midia.investimento ?? 0)
  const valor = Number.isFinite(bruto) && bruto > 0 ? Math.round(bruto * 100) / 100 : 0

  if (valor > 0 && (!objetivo || objetivo === 'Sem impulsionamento')) {
    return {
      ok: false,
      erro: 'Escolha o objetivo da campanha antes de destinar verba a esta publicação.',
    }
  }

  const { error } = await ctx.supabase
    .from('content_ideas')
    .update({
      meta_objetivo: objetivo,
      meta_investimento: valor,
      meta_justificativa: (midia.justificativa ?? '').trim() || null,
    })
    .eq('id', ideaId)

  if (error) {
    // O gatilho do banco fala em português e já diz os dois valores.
    // Repassar a frase dele é melhor que inventar uma aqui.
    return { ok: false, erro: error.message }
  }

  revalidatePath(caminho(slug, ano, mes))
  return { ok: true }
}
