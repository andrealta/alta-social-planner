'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/lib/supabase/server'
import { arrumarSlug, conferirMarca, type LinhaDeEscopo } from '@/lib/marca'

export type Resultado = { ok: boolean; slug?: string; erro?: string }

/**
 * Cria uma marca nova.
 *
 * Só administração. A política `brands_admin_all` do banco já garante
 * isso, e a checagem aqui existe para dar uma frase em português em
 * vez de um erro de permissão cru. As duas valem: a do banco é a que
 * protege, a daqui é a que explica.
 *
 * A marca nasce com a base VAZIA de propósito. Preencher a base é
 * trabalho de quem conhece a conta, e o lugar disso é a tela da marca,
 * onde dá para escrever com calma. Base inventada por formulário é
 * pior que base em branco, porque parece preenchida e ninguém revisa.
 */
export async function criarMarca(dados: {
  nome: string
  slug: string
  segmento: string
  escopo: LinhaDeEscopo[]
}): Promise<Resultado> {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role !== 'admin') {
    return { ok: false, erro: 'Só quem administra pode criar marca.' }
  }

  const nome = (dados.nome ?? '').trim()
  const slug = arrumarSlug(dados.slug || dados.nome)
  const segmento = (dados.segmento ?? '').trim()
  const escopo = (dados.escopo ?? [])
    .map((l) => ({ label: (l.label ?? '').trim(), quota: Number(l.quota) }))
    .filter((l) => l.label !== '' || Number.isFinite(l.quota))

  const problemas = conferirMarca({ nome, slug, escopo })
  if (problemas.length > 0) return { ok: false, erro: problemas[0].texto }

  // Slug repetido tem mensagem própria porque é o erro mais provável e
  // o mais confuso de ler no formato que o banco devolve.
  const { data: jaExiste } = await supabase
    .from('brands')
    .select('slug, name')
    .eq('slug', slug)
    .maybeSingle()
  if (jaExiste) {
    return {
      ok: false,
      erro: `O endereço "${slug}" já é da marca ${jaExiste.name}. Escolha outro.`,
    }
  }

  const { data: criada, error } = await supabase
    .from('brands')
    .insert({ name: nome, slug, segment: segmento || null })
    .select('id, slug')
    .single()

  if (error || !criada) {
    return { ok: false, erro: 'Não consegui criar a marca. ' + (error?.message ?? '') }
  }

  if (escopo.length > 0) {
    const { error: erroEscopo } = await supabase.from('brand_scope').insert(
      escopo.map((l, i) => ({
        brand_id: criada.id as string,
        label: l.label,
        monthly_quota: l.quota,
        position: i,
      })),
    )
    // A marca já existe. Falhar o escopo aqui não desfaz nada, e
    // desfazer seria pior: a pessoa perderia o que digitou. Ela entra
    // sem escopo e a tela da marca avisa que falta.
    if (erroEscopo) {
      revalidatePath('/painel')
      return {
        ok: true,
        slug: criada.slug as string,
        erro: 'A marca foi criada, mas o escopo não entrou: ' + erroEscopo.message,
      }
    }
  }

  revalidatePath('/painel')
  return { ok: true, slug: criada.slug as string }
}
