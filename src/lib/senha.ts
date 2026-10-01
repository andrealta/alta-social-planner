/**
 * O que dizer quando a troca de senha falha.
 *
 * Fica fora da ação de servidor para poder ser testado: a tela que
 * mostra estas frases é a primeira que uma pessoa nova usa, e foi
 * exatamente aqui que um texto em inglês vazou para o usuário
 * ("Auth session missing!"). Erro que ninguém entende vira chamado
 * para a agência.
 *
 * As frases do Supabase mudam entre versões, então a conferência é por
 * palavra-chave e sempre há uma saída final. O que não pode acontecer é
 * a mensagem crua aparecer sozinha, sem nada que a pessoa possa fazer a
 * respeito.
 */
export function recadoDoErroDeSenha(mensagem: string): string {
  const m = mensagem ?? ''

  // A sessão sumiu no meio do caminho. Até a rodada 87 isto acontecia
  // porque a própria conferência da senha atual derrubava a sessão de
  // quem estava trocando. Com aquilo consertado, sobra o caso honesto:
  // a pessoa deixou a tela aberta por mais de uma hora.
  if (/session missing|session_not_found|session from session_id|refresh token/i.test(m)) {
    return 'A sua sessão expirou enquanto esta tela estava aberta. Entre de novo e troque a senha logo em seguida.'
  }
  if (/weak|short|at least|characters/i.test(m)) {
    return 'O Supabase recusou a senha por ser fraca. Use letras, números e pelo menos 8 caracteres.'
  }
  if (/same|different from the old/i.test(m)) {
    return 'A senha nova é igual à atual.'
  }
  if (/reauth/i.test(m)) {
    return 'O Supabase está pedindo confirmação extra para trocar senha. Saia, entre de novo e tente logo em seguida.'
  }
  if (/rate limit|too many/i.test(m)) {
    return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
  }
  return 'Não consegui trocar a senha: ' + m
}
