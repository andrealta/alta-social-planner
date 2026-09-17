/**
 * As duas configuracoes do Supabase que o navegador precisa.
 *
 * O Supabase renomeou a chave publica de "anon key" para "publishable
 * key". Aceito os dois nomes para o sistema nao quebrar dependendo de
 * quando o projeto foi criado.
 *
 * Os acessos a process.env precisam ser escritos por extenso: o Next
 * substitui esses trechos pelo valor durante a compilacao, e so
 * reconhece quando o nome esta literal no codigo.
 */
export function ambienteSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !chave) {
    throw new Error(
      'Faltam configuracoes do Supabase no arquivo .env.local. ' +
        'Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        'e reinicie o servidor (feche a janela preta e rode 03-rodar.cmd de novo).',
    )
  }

  return { url, chave }
}
