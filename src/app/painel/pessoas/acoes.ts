'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/lib/supabase/server'
import { clienteAdmin } from '@/lib/supabase/admin'

export type Resultado = { ok: boolean; erro?: string; aviso?: string; senha?: string }

const PAPEIS = ['admin', 'staff', 'client']
const ACESSOS = ['owner', 'editor', 'viewer', 'client']

/**
 * Só administrador entra aqui.
 *
 * A checagem é feita com a identidade de quem chamou, lendo o próprio
 * perfil — que as políticas do banco só devolvem para a própria
 * pessoa. Não dá para se declarar admin de fora.
 */
async function souAdmin() {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { erro: 'Sua sessão expirou. Entre de novo.' as const }

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role !== 'admin') {
    return { erro: 'Só quem administra pode gerenciar pessoas.' as const }
  }
  return { supabase, user }
}

function emailValido(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)
}

/** Senha temporária legível, para quando não dá para mandar e-mail. */
function senhaTemporaria() {
  const letras = 'abcdefghijkmnopqrstuvwxyz'
  const numeros = '23456789'
  const parte = (n: number, de: string) =>
    Array.from({ length: n }, () => de[Math.floor(Math.random() * de.length)]).join('')
  return `alta-${parte(4, letras)}-${parte(4, numeros)}-${parte(4, letras)}`
}

/**
 * Cria a pessoa e já a vincula às marcas.
 *
 * Duas formas de entrada, e a diferença importa:
 *
 *   convite  — o Supabase manda um e-mail e a pessoa escolhe a
 *              própria senha. Ninguém na Alta chega a saber a senha
 *              dela. É o caminho certo, e depende de o envio de
 *              e-mail estar configurado no projeto.
 *
 *   senha    — o sistema gera uma senha temporária e mostra UMA vez,
 *              para você passar à pessoa. Funciona sem e-mail
 *              configurado, mas alguém além dela conhece a senha até
 *              que ela troque.
 */
export async function criarPessoa(dados: {
  nome: string
  email: string
  papel: string
  marcas: { id: string; acesso: string }[]
  porConvite: boolean
}): Promise<Resultado> {
  const ctx = await souAdmin()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  const nome = dados.nome.trim()
  const email = dados.email.trim().toLowerCase()

  if (nome.length < 2) return { ok: false, erro: 'Escreva o nome da pessoa.' }
  if (!emailValido(email)) return { ok: false, erro: 'Esse e-mail não parece válido.' }
  if (!PAPEIS.includes(dados.papel)) return { ok: false, erro: 'Papel inválido.' }

  const marcas = (dados.marcas ?? []).filter((m) => m.id && ACESSOS.includes(m.acesso))

  if (dados.papel === 'client' && marcas.length === 0) {
    return {
      ok: false,
      erro: 'Um cliente precisa estar vinculado a pelo menos uma marca — senão ele entra e não vê nada.',
    }
  }

  let admin
  try {
    admin = clienteAdmin()
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Chave de serviço indisponível.' }
  }

  let id: string | undefined
  let senha: string | undefined

  if (dados.porConvite) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name: nome, role: dados.papel },
    })
    if (error) {
      return {
        ok: false,
        erro:
          `Não consegui enviar o convite: ${error.message}. ` +
          'Se o envio de e-mail não estiver configurado no Supabase, use a opção de senha temporária.',
      }
    }
    id = data.user?.id
  } else {
    senha = senhaTemporaria()
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { name: nome, role: dados.papel },
    })
    if (error) {
      return {
        ok: false,
        erro: error.message.includes('already')
          ? 'Já existe alguém com esse e-mail.'
          : 'Não consegui criar: ' + error.message,
      }
    }
    id = data.user?.id
  }

  if (!id) return { ok: false, erro: 'A pessoa foi criada, mas não recebi o identificador dela.' }

  // O gatilho do banco já criou o perfil com o papel do metadado.
  // Confirmar aqui cobre o caso de o metadado não ter chegado.
  const { error: erroPerfil } = await ctx.supabase
    .from('profiles')
    .update({ role: dados.papel, name: nome })
    .eq('id', id)

  let aviso: string | undefined
  if (erroPerfil) aviso = 'A pessoa foi criada, mas o papel não gravou: ' + erroPerfil.message

  if (marcas.length > 0) {
    const { error: erroVinculo } = await ctx.supabase
      .from('brand_members')
      .upsert(
        marcas.map((m) => ({ brand_id: m.id, user_id: id, access: m.acesso })),
        { onConflict: 'brand_id,user_id' },
      )
    if (erroVinculo) {
      aviso = (aviso ? aviso + ' ' : '') + 'As marcas não vincularam: ' + erroVinculo.message
    }
  }

  revalidatePath('/painel/pessoas')
  return { ok: true, senha, aviso }
}

/** Muda o papel de alguém que já existe. */
export async function definirPapel(userId: string, papel: string): Promise<Resultado> {
  const ctx = await souAdmin()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }
  if (!PAPEIS.includes(papel)) return { ok: false, erro: 'Papel inválido.' }

  if (userId === ctx.user.id && papel !== 'admin') {
    return {
      ok: false,
      erro: 'Você ia tirar a própria administração e ficar sem poder devolvê-la. Peça a outro administrador.',
    }
  }

  const { error } = await ctx.supabase.from('profiles').update({ role: papel }).eq('id', userId)
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/painel/pessoas')
  return { ok: true }
}

export type Historico = {
  nome: string
  papel: string
  aprovacoes: number
  versoes: number
  comentarios: number
  planos: number
  marcas: number
}

/**
 * O que a pessoa deixa para trás, antes de o administrador decidir.
 *
 * "Apagar Marina" e "apagar Marina, que aprovou 14 conteúdos" são
 * decisões diferentes, e a segunda não pode chegar como surpresa
 * depois do clique.
 */
export async function resumoDaPessoa(
  userId: string,
): Promise<{ ok: boolean; erro?: string; historico?: Historico }> {
  const ctx = await souAdmin()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  const { data, error } = await ctx.supabase.rpc('historico_da_pessoa', { p_id: userId })
  if (error) return { ok: false, erro: error.message }

  const h = (data ?? {}) as Record<string, unknown>
  return {
    ok: true,
    historico: {
      nome: String(h.nome ?? ''),
      papel: String(h.papel ?? ''),
      aprovacoes: Number(h.aprovacoes ?? 0),
      versoes: Number(h.versoes ?? 0),
      comentarios: Number(h.comentarios ?? 0),
      planos: Number(h.planos ?? 0),
      marcas: Number(h.marcas ?? 0),
    },
  }
}

/**
 * Apaga o cadastro: o perfil e o login.
 *
 * A ORDEM IMPORTA, e não é a intuitiva. O perfil sai primeiro porque é
 * nele que moram as travas do banco — não apagar a si mesmo, não
 * apagar o último administrador. Se o login saísse antes e o banco
 * recusasse depois, o sistema poderia ficar sem nenhuma conta capaz de
 * administrar, e a saída seria mexer no Supabase na mão.
 *
 * O caminho contrário tem falha benigna: perfil apagado e login vivo
 * vira uma conta que entra e não vê nada, porque sem perfil o sistema
 * a trata como cliente sem marca. Some da lista, não incomoda ninguém,
 * e dá para remover no painel do Supabase. É o lado certo para errar.
 *
 * O histórico não some: aprovação, versão de texto e comentário
 * continuam gravados, apenas sem o nome de quem fez.
 */
export async function apagarPessoa(userId: string): Promise<Resultado> {
  const ctx = await souAdmin()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  if (userId === ctx.user.id) {
    return {
      ok: false,
      erro: 'Você não pode apagar a própria conta — perderia o acesso e não teria como desfazer.',
    }
  }

  // 1. o perfil, onde estão as travas
  const { data: apagados, error } = await ctx.supabase
    .from('profiles')
    .delete()
    .eq('id', userId)
    .select('id')

  if (error) return { ok: false, erro: error.message }
  if (!apagados || apagados.length === 0) {
    return {
      ok: false,
      erro: 'Nada foi apagado. Ou a pessoa já não existe, ou o banco recusou a exclusão.',
    }
  }

  // 2. o login
  let admin
  try {
    admin = clienteAdmin()
  } catch {
    revalidatePath('/painel/pessoas')
    return {
      ok: true,
      aviso:
        'O cadastro saiu da lista, mas o login continua existindo: a chave de serviço ' +
        'não está configurada. Remova em Supabase → Authentication → Users.',
    }
  }

  const { error: erroLogin } = await admin.auth.admin.deleteUser(userId)

  revalidatePath('/painel/pessoas')

  if (erroLogin) {
    return {
      ok: true,
      aviso:
        'O cadastro saiu da lista, mas o login não foi removido: ' +
        erroLogin.message +
        '. Essa conta entra e não vê nada; remova em Supabase → Authentication → Users.',
    }
  }

  return { ok: true }
}

/**
 * Corrige o nome e o e-mail de alguém.
 *
 * O e-mail é o login. Ele mora em dois lugares — no cadastro de acesso
 * do Supabase (`auth.users`) e na ficha da pessoa (`profiles`) — e os
 * dois têm de andar juntos. A ordem é: primeiro o login, que é quem
 * recusa e-mail repetido; depois a ficha. Se a ficha falhar, o login
 * já mudou, e a mensagem diz isso com todas as letras. Salvar de novo
 * resolve, porque trocar o login para o e-mail que ele já tem não faz
 * nada.
 *
 * O e-mail novo entra já confirmado: é a administração corrigindo um
 * cadastro, não a pessoa pedindo a troca — não faz sentido mandar
 * "confirme seu novo e-mail" para quem nem sabe que ele mudou.
 */
export async function editarPessoa(
  userId: string,
  dados: { nome: string; email: string },
): Promise<Resultado> {
  const ctx = await souAdmin()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  const nome = (dados.nome ?? '').trim()
  const email = (dados.email ?? '').trim().toLowerCase()
  if (nome.length < 2) return { ok: false, erro: 'Escreva o nome da pessoa.' }
  if (!emailValido(email)) return { ok: false, erro: 'Esse e-mail não parece válido.' }

  const { data: atual } = await ctx.supabase
    .from('profiles')
    .select('name, email')
    .eq('id', userId)
    .maybeSingle()
  if (!atual) return { ok: false, erro: 'Não encontrei essa pessoa. Atualize a página.' }

  const mudouEmail = ((atual.email as string) ?? '').toLowerCase() !== email

  if (mudouEmail) {
    let admin
    try {
      admin = clienteAdmin()
    } catch {
      return {
        ok: false,
        erro:
          'Para trocar o e-mail é preciso a chave de serviço do Supabase configurada. ' +
          'O nome dá para trocar sem ela — mantenha o e-mail como está e salve.',
      }
    }
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    })
    if (error) {
      return {
        ok: false,
        erro: /already|registered|exists/i.test(error.message)
          ? 'Já existe outra pessoa cadastrada com esse e-mail.'
          : 'Não consegui trocar o e-mail: ' + error.message,
      }
    }
  }

  const { error: erroFicha } = await ctx.supabase
    .from('profiles')
    .update({ name: nome, email })
    .eq('id', userId)

  if (erroFicha) {
    return {
      ok: false,
      erro: mudouEmail
        ? `O login já passou a ser ${email}, mas a ficha não gravou (${erroFicha.message}). ` +
          'Clique em salvar de novo.'
        : 'Não consegui salvar: ' + erroFicha.message,
    }
  }

  revalidatePath('/painel/pessoas')
  return {
    ok: true,
    aviso: mudouEmail
      ? `Pronto. A partir de agora ${nome} entra com ${email} — a senha continua a mesma.`
      : undefined,
  }
}

/**
 * Gera uma senha temporária nova para alguém que esqueceu a dele.
 *
 * A senha antiga para de funcionar na hora. A nova aparece uma vez,
 * como no cadastro, para ser passada por um canal privado.
 *
 * Não vale para a própria conta: quem administra e está logado não
 * precisa que outra tela invente uma senha para ele.
 */
export async function novaSenha(userId: string): Promise<Resultado> {
  const ctx = await souAdmin()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }
  if (userId === ctx.user.id) {
    return { ok: false, erro: 'Para a sua própria conta, use a troca de senha do seu acesso.' }
  }

  let admin
  try {
    admin = clienteAdmin()
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Chave de serviço indisponível.' }
  }

  const senha = senhaTemporaria()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: senha })
  if (error) return { ok: false, erro: 'Não consegui trocar a senha: ' + error.message }

  return { ok: true, senha }
}

/** Vincula (ou muda o acesso de) uma pessoa a uma marca. */
export async function vincular(
  userId: string,
  brandId: string,
  acesso: string,
): Promise<Resultado> {
  const ctx = await souAdmin()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }
  if (!ACESSOS.includes(acesso)) return { ok: false, erro: 'Nível de acesso inválido.' }

  const { error } = await ctx.supabase
    .from('brand_members')
    .upsert({ brand_id: brandId, user_id: userId, access: acesso }, { onConflict: 'brand_id,user_id' })

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/painel/pessoas')
  return { ok: true }
}

/** Tira o acesso de alguém a uma marca. */
export async function desvincular(userId: string, brandId: string): Promise<Resultado> {
  const ctx = await souAdmin()
  if ('erro' in ctx) return { ok: false, erro: ctx.erro }

  const { error } = await ctx.supabase
    .from('brand_members')
    .delete()
    .eq('user_id', userId)
    .eq('brand_id', brandId)

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/painel/pessoas')
  return { ok: true }
}
