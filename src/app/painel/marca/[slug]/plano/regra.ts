/**
 * Quem pode excluir um planejamento — o espelho, para a tela, da
 * função `pode_apagar_plano` do banco (migração 0018).
 *
 * Quem DECIDE é o banco: política e gatilho recusam qualquer exclusão
 * fora desta regra, venha de onde vier. Isto aqui só decide se o botão
 * aparece, e o que dizer quando ele não aparece. Se um dia as duas
 * versões divergirem, o pior que acontece é a tela oferecer um botão
 * que o banco recusa com uma frase clara — nunca o contrário.
 *
 *   administração                  exclui sempre
 *   equipe que edita a marca       exclui até o envio ao cliente
 *   equipe que só lê, e cliente    não exclui
 */
export type Exclusao = {
  pode: boolean
  /** Quando não pode mas vale explicar por quê. Nulo: não mostra nada. */
  motivo: string | null
}

export const MOTIVO_ENVIADO =
  'Este mês já foi enviado ao cliente. Depois do envio, só a administração pode excluir.'

export function exclusaoDoPlano(
  papel: string | null | undefined,
  nivel: string | null | undefined,
  liberado: boolean,
): Exclusao {
  if (papel === 'admin') return { pode: true, motivo: null }
  const edita = papel === 'staff' && (nivel === 'owner' || nivel === 'editor')
  if (!edita) return { pode: false, motivo: null }
  if (liberado) return { pode: false, motivo: MOTIVO_ENVIADO }
  return { pode: true, motivo: null }
}
