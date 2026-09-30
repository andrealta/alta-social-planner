'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/lib/supabase/server'
import { conferirMarca, corValida, escopoQueSai, type LinhaDeEscopo } from '@/lib/marca'
import { registrar, resumoDeEscopo } from '@/lib/registro-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Resultado = { ok: boolean; erro?: string; aviso?: string }

type Marca = {
  id: string
  name: string
  slug: string
  segment: string | null
  color: string | null
  arquivada_em: string | null
}

/**
 * Só administração chega aqui.
 *
 * As políticas do banco já recusam quem não é, e a checagem existe para
 * dar uma frase em português em vez de um erro de permissão cru. As
 * duas valem: a do banco é a que protege, a daqui é a que explica.
 */
async function comoAdmin(): Promise<
  { ok: true; supabase: SupabaseClient; userId: string; nome: string } | { ok: false; erro: string }
> {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()
  if (perfil?.role !== 'admin') {
    return { ok: false, erro: 'Só quem administra pode mexer em marcas.' }
  }
  return {
    ok: true,
    supabase,
    userId: user.id,
    nome: (perfil?.name as string) ?? user.email ?? 'sem nome',
  }
}

async function acharMarca(supabase: SupabaseClient, slug: string): Promise<Marca | null> {
  const { data } = await supabase
    .from('brands')
    .select('id, name, slug, segment, color, arquivada_em')
    .eq('slug', slug)
    .maybeSingle()
  return (data as Marca) ?? null
}

/**
 * Arquivar: o contrato acabou.
 *
 * A marca some das listas, para de gerar planejamento e o cliente perde
 * o acesso ao portal. Nada é apagado: o histórico continua inteiro para
 * consulta e para o cálculo de custo.
 */
export async function arquivarMarca(slug: string, motivo: string): Promise<Resultado> {
  const sessao = await comoAdmin()
  if (!sessao.ok) return { ok: false, erro: sessao.erro }
  const { supabase, userId, nome } = sessao

  const marca = await acharMarca(supabase, slug)
  if (!marca) return { ok: false, erro: 'Não achei esta marca.' }
  if (marca.arquivada_em) return { ok: false, erro: 'Esta marca já está arquivada.' }

  const { error } = await supabase
    .from('brands')
    .update({ arquivada_em: new Date().toISOString(), arquivada_por: userId })
    .eq('id', marca.id)
  if (error) return { ok: false, erro: 'Não consegui arquivar: ' + error.message }

  const falhaLog = await registrar(supabase, { id: userId, nome }, 'marca_arquivada', marca, {
    motivo: motivo.trim() || null,
  })
  revalidatePath('/painel')
  revalidatePath('/painel/marcas')
  return { ok: true, aviso: falhaLog ? 'Arquivou, mas o registro falhou: ' + falhaLog : undefined }
}

/**
 * Nome, segmento e cor.
 *
 * Os três juntos numa ação só porque são a mesma coisa: quem a marca é.
 * Antes disto nenhum deles se editava. A cor tinha uma tela própria
 * dentro da página da marca, e o nome e o segmento não tinham nenhuma:
 * um erro de digitação no nome ficava para sempre, e ele aparece no
 * portal do cliente.
 *
 * O ENDEREÇO CURTO NÃO ENTRA
 *
 * Ele está em todo link que a equipe já salvou, no comando do Operand e
 * no endereço que o cliente recebeu por e-mail. Trocar o slug quebraria
 * os três de uma vez, em silêncio, e o ganho seria estético. Marca com
 * o endereço errado se resolve criando a certa e arquivando a outra,
 * que é uma decisão consciente em vez de um campo inocente.
 */
export async function editarMarca(
  slug: string,
  dados: { nome: string; segmento: string; cor: string | null },
): Promise<Resultado> {
  const sessao = await comoAdmin()
  if (!sessao.ok) return { ok: false, erro: sessao.erro }
  const { supabase, userId, nome: quemNome } = sessao

  const marca = await acharMarca(supabase, slug)
  if (!marca) return { ok: false, erro: 'Não achei esta marca.' }

  const nome = (dados.nome ?? '').trim()
  const segmento = (dados.segmento ?? '').trim()
  const cor = (dados.cor ?? '').trim() || null

  // O slug vai junto na conferência só para ela não reclamar de um
  // campo que esta tela nem mostra.
  const doNome = conferirMarca({ nome, slug: marca.slug, escopo: [] }).find(
    (p) => p.campo === 'nome',
  )
  if (doNome) return { ok: false, erro: doNome.texto }
  if (cor !== null && !corValida(cor)) {
    return { ok: false, erro: 'A cor precisa estar no formato #RRGGBB, por exemplo #2502D0.' }
  }

  const antes = {
    nome: marca.name,
    segmento: marca.segment ?? '',
    cor: marca.color ?? '',
  }
  const depois = { nome, segmento, cor: cor ?? '' }
  const mudou = (Object.keys(depois) as (keyof typeof depois)[]).filter(
    (k) => antes[k] !== depois[k],
  )
  if (mudou.length === 0) return { ok: true, aviso: 'Nada mudou.' }

  const { error } = await supabase
    .from('brands')
    .update({ name: nome, segment: segmento || null, color: cor })
    .eq('id', marca.id)
  if (error) return { ok: false, erro: 'Não consegui gravar: ' + error.message }

  // Só o que mudou vai para o registro. Uma linha listando os três
  // campos toda vez esconderia qual deles alguém mexeu.
  const falhaLog = await registrar(
    supabase,
    { id: userId, nome: quemNome },
    'marca_editada',
    { ...marca, name: nome },
    Object.fromEntries(mudou.map((k) => [k, { de: antes[k] || null, para: depois[k] || null }])),
  )

  revalidatePath('/painel')
  revalidatePath('/painel/marcas')
  revalidatePath(`/painel/marca/${marca.slug}`)
  revalidatePath('/cliente')
  return { ok: true, aviso: falhaLog ? 'Gravou, mas o registro falhou: ' + falhaLog : undefined }
}

/** Reabrir: o contrato voltou, ou foi engano. */
export async function reabrirMarca(slug: string): Promise<Resultado> {
  const sessao = await comoAdmin()
  if (!sessao.ok) return { ok: false, erro: sessao.erro }
  const { supabase, userId, nome } = sessao

  const marca = await acharMarca(supabase, slug)
  if (!marca) return { ok: false, erro: 'Não achei esta marca.' }
  if (!marca.arquivada_em) return { ok: false, erro: 'Esta marca não está arquivada.' }

  const { error } = await supabase
    .from('brands')
    .update({ arquivada_em: null, arquivada_por: null })
    .eq('id', marca.id)
  if (error) return { ok: false, erro: 'Não consegui reabrir: ' + error.message }

  const falhaLog = await registrar(supabase, { id: userId, nome }, 'marca_reaberta', marca)
  revalidatePath('/painel')
  revalidatePath('/painel/marcas')
  return { ok: true, aviso: falhaLog ? 'Reabriu, mas o registro falhou: ' + falhaLog : undefined }
}

/**
 * O que existe pendurado numa marca, em números.
 *
 * Serve para a tela mostrar o tamanho do estrago ANTES de apagar. Uma
 * confirmação que não diz o que se perde é um botão de OK com etapa a
 * mais, não uma decisão.
 */
export async function contarDaMarca(
  slug: string,
): Promise<{ ok: boolean; erro?: string; contas?: Record<string, number> }> {
  const sessao = await comoAdmin()
  if (!sessao.ok) return { ok: false, erro: sessao.erro }
  const { supabase } = sessao

  const marca = await acharMarca(supabase, slug)
  if (!marca) return { ok: false, erro: 'Não achei esta marca.' }

  const contar = async (tabela: string) => {
    const { count } = await supabase
      .from(tabela)
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', marca.id)
    return count ?? 0
  }

  const [planejamentos, pautas, pessoas, jobs] = await Promise.all([
    contar('plans'),
    contar('content_ideas'),
    contar('brand_members'),
    contar('operand_jobs'),
  ])
  return { ok: true, contas: { planejamentos, pautas, pessoas, jobs } }
}

/**
 * Apagar de verdade. Só marca já arquivada.
 *
 * Duas etapas separadas por uma decisão consciente é o que impede o
 * clique errado, e custa pouco: quem quer mesmo apagar arquiva e apaga
 * em seguida. O gatilho no banco garante a ordem mesmo que esta função
 * seja contornada.
 *
 * O registro é escrito ANTES de apagar. Depois a marca não existe mais
 * para ser lida, e um log escrito com os dados já perdidos registraria
 * nulos.
 */
export async function apagarMarca(slug: string, confirmacao: string): Promise<Resultado> {
  const sessao = await comoAdmin()
  if (!sessao.ok) return { ok: false, erro: sessao.erro }
  const { supabase, userId, nome } = sessao

  const marca = await acharMarca(supabase, slug)
  if (!marca) return { ok: false, erro: 'Não achei esta marca.' }
  if (!marca.arquivada_em) {
    return {
      ok: false,
      erro: 'Arquive a marca antes de apagar. São duas decisões, de propósito.',
    }
  }
  if (confirmacao.trim() !== marca.slug) {
    return { ok: false, erro: `Para confirmar, digite exatamente "${marca.slug}".` }
  }

  const antes = await contarDaMarca(slug)
  await registrar(supabase, { id: userId, nome }, 'marca_apagada', marca, {
    contas: antes.contas ?? {},
  })

  const { error } = await supabase.from('brands').delete().eq('id', marca.id)
  if (error) return { ok: false, erro: 'Não consegui apagar: ' + error.message }

  revalidatePath('/painel')
  revalidatePath('/painel/marcas')
  return { ok: true }
}

/**
 * As cotas mensais da marca.
 *
 * Escopo é restrição dura na geração: a IA fecha exatamente estes
 * números. Mexer aqui muda o que o próximo planejamento vai entregar,
 * e por isso a alteração fica registrada com o antes e o depois.
 *
 * Linha que sai não é apagada, é desativada: planejamentos antigos
 * referenciam o nome dela, e apagar deixaria mês passado sem
 * explicação de onde veio cada pauta.
 */
export async function salvarEscopo(slug: string, linhas: LinhaDeEscopo[]): Promise<Resultado> {
  const sessao = await comoAdmin()
  if (!sessao.ok) return { ok: false, erro: sessao.erro }
  const { supabase, userId, nome } = sessao

  const marca = await acharMarca(supabase, slug)
  if (!marca) return { ok: false, erro: 'Não achei esta marca.' }

  const limpas = (linhas ?? [])
    .map((l) => ({ label: (l.label ?? '').trim(), quota: Number(l.quota) }))
    .filter((l) => l.label !== '' || Number.isFinite(l.quota))

  const problemas = conferirMarca({ nome: marca.name, slug: marca.slug, escopo: limpas })
  const doEscopo = problemas.find((p) => p.campo === 'escopo')
  if (doEscopo) return { ok: false, erro: doEscopo.texto }
  if (limpas.length === 0) {
    return { ok: false, erro: 'Sem nenhuma linha, o planejamento não tem o que fechar.' }
  }

  const { data: antesBruto } = await supabase
    .from('brand_scope')
    .select('id, label, monthly_quota, active')
    .eq('brand_id', marca.id)
  const antes = (antesBruto ?? []).filter((l) => l.active)

  for (const [i, l] of limpas.entries()) {
    const { error } = await supabase.from('brand_scope').upsert(
      {
        brand_id: marca.id,
        label: l.label,
        monthly_quota: l.quota,
        position: i,
        active: true,
      },
      { onConflict: 'brand_id,label' },
    )
    if (error) return { ok: false, erro: 'Não consegui gravar "' + l.label + '": ' + error.message }
  }

  // Desativar pelo id, e não por uma lista de nomes montada dentro de
  // um filtro de texto: nome de linha é escrito por gente e pode ter
  // vírgula, aspas e parêntese, que são justamente os caracteres que
  // quebram esse tipo de filtro.
  const aDesativar = escopoQueSai(antes as { id: string; label: string }[], limpas).map(
    (l) => l.id,
  )

  if (aDesativar.length > 0) {
    const { error: erroFora } = await supabase
      .from('brand_scope')
      .update({ active: false })
      .in('id', aDesativar)
    if (erroFora) {
      return { ok: false, erro: 'Gravou as linhas novas, mas não desativou as antigas.' }
    }
  }

  const falhaLog = await registrar(supabase, { id: userId, nome }, 'escopo_alterado', marca, {
    antes: resumoDeEscopo(antes as { label: string; monthly_quota: number }[]),
    depois: resumoDeEscopo(limpas),
  })

  revalidatePath('/painel/marcas')
  revalidatePath(`/painel/marca/${marca.slug}`)
  return { ok: true, aviso: falhaLog ? 'Gravou, mas o registro falhou: ' + falhaLog : undefined }
}
