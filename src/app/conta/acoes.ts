'use server'

import { createClient } from '@supabase/supabase-js'
import { clienteServidor } from '@/lib/supabase/server'
import { ambienteSupabase } from '@/lib/supabase/env'
import { revalidatePath } from 'next/cache'
import { LIMITE_DA_FOTO, TIPOS_DE_FOTO } from '@/lib/avatar'
import { recadoDoErroDeSenha } from '@/lib/senha'

export type Resultado = { ok: boolean; erro?: string }

const MINIMO = 8

/**
 * A pessoa troca a própria senha.
 *
 * Pede a senha ATUAL antes. Sem isso, qualquer um que achasse o
 * computador de alguém com a sessão aberta poderia trocar a senha e
 * tomar a conta — e a pessoa descobriria só quando não conseguisse
 * mais entrar.
 *
 * A conferência da senha atual usa um cliente separado, que não grava
 * cookie: um login "de teste" que não mexe na sessão aberta. Se a
 * senha estiver certa, a troca é feita na sessão de verdade.
 *
 * O DEFEITO QUE ESTAVA AQUI, porque ele volta se alguém "simplificar"
 * esta função: o `signOut()` do Supabase usa escopo GLOBAL por padrão.
 * Ele não encerra a sessão de teste, encerra TODAS as sessões daquela
 * pessoa — inclusive a do navegador dela, que estava ali do lado
 * esperando para trocar a senha. Confirmado na documentação dentro do
 * próprio pacote: "By default, signOut() uses the global scope, which
 * signs out the user on every device they are signed in on".
 *
 * O estrago aparecia na linha seguinte. Com o refresh token revogado,
 * o `updateUser` tentava renovar a sessão do cookie, não conseguia,
 * apagava a sessão e devolvia "Auth session missing!" — em inglês, na
 * cara de quem acabou de receber uma senha temporária e está tentando
 * trocá-la. E não era intermitente por acaso: o Supabase considera a
 * sessão vencida alguns minutos ANTES da hora, então o erro só
 * aparecia para quem já estava logado havia um tempo. Quem tinha
 * acabado de entrar trocava a senha normalmente, que é o motivo de
 * isto ter passado pelos testes de quem escreveu.
 *
 * `scope: 'local'` encerra só a sessão de teste, no servidor e aqui, e
 * é o que sempre se quis.
 *
 * Nenhuma senha passa por log, banco ou tela. O Supabase guarda só o
 * resumo criptográfico dela.
 */
export async function trocarSenha(atual: string, nova: string): Promise<Resultado> {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  if (!atual) return { ok: false, erro: 'Digite a sua senha atual.' }
  if ((nova ?? '').length < MINIMO) {
    return { ok: false, erro: `A senha nova precisa ter pelo menos ${MINIMO} caracteres.` }
  }
  if (nova === atual) return { ok: false, erro: 'A senha nova é igual à atual.' }

  const { url, chave } = ambienteSupabase()
  const conferencia = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error: errado } = await conferencia.auth.signInWithPassword({
    email: user.email,
    password: atual,
  })
  if (errado) return { ok: false, erro: 'A senha atual não confere.' }
  // O login de conferência não serve para mais nada. ESCOPO LOCAL: ver
  // o comentário acima. Sem ele, esta linha desloga a pessoa.
  await conferencia.auth.signOut({ scope: 'local' }).catch(() => {})

  const { error } = await supabase.auth.updateUser({ password: nova })
  if (error) return { ok: false, erro: recadoDoErroDeSenha(error.message) }

  return { ok: true }
}

/**
 * A foto de perfil.
 *
 * O arquivo não passa por aqui: o navegador reduz a imagem e manda
 * direto para o balde "avatares", como no layout das publicações. Aqui
 * se decide o caminho e se guarda o endereço na linha da pessoa.
 */
export async function prepararFoto(
  arquivo: { tipo: string; bytes: number },
): Promise<{ ok: true; caminho: string } | { ok: false; erro: string }> {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  if (!(TIPOS_DE_FOTO as readonly string[]).includes(arquivo.tipo)) {
    return { ok: false, erro: 'Use uma imagem em JPG, PNG ou WEBP.' }
  }
  if (arquivo.bytes > LIMITE_DA_FOTO) {
    return { ok: false, erro: 'A imagem passa de 2 MB.' }
  }
  const extensao = arquivo.tipo === 'image/png' ? 'png' : arquivo.tipo === 'image/webp' ? 'webp' : 'jpg'
  return { ok: true, caminho: `${user.id}/${crypto.randomUUID()}.${extensao}` }
}

/** Guarda o caminho da foto nova e apaga a anterior. */
export async function salvarFoto(caminho: string): Promise<Resultado> {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }
  if (!caminho.startsWith(`${user.id}/`)) return { ok: false, erro: 'Caminho inválido.' }

  const { data: antes } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  const { error } = await supabase.from('profiles').update({ avatar_url: caminho }).eq('id', user.id)
  if (error) {
    await supabase.storage.from('avatares').remove([caminho])
    return { ok: false, erro: error.message }
  }

  const anterior = (antes?.avatar_url as string | null) ?? null
  if (anterior && anterior !== caminho) {
    await supabase.storage.from('avatares').remove([anterior])
  }
  revalidatePath('/conta')
  return { ok: true }
}

/** Tira a foto: some da linha e do balde. */
export async function removerFoto(): Promise<Resultado> {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Entre de novo.' }

  const { data: antes } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
  if (error) return { ok: false, erro: error.message }

  const anterior = (antes?.avatar_url as string | null) ?? null
  if (anterior) await supabase.storage.from('avatares').remove([anterior])
  revalidatePath('/conta')
  return { ok: true }
}
