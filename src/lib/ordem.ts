/**
 * A ordem dos meses nas listas.
 *
 * 1. Primeiro os meses que ainda pedem alguma coisa; os já aprovados
 *    por inteiro vão para o fim da fila — estão resolvidos.
 * 2. Dentro de cada grupo, do mais próximo para o mais distante.
 *    "Próximo" é próximo de HOJE: o mês corrente e os que estão
 *    chegando, do mais perto para o mais longe; depois os que já
 *    passaram, do mais recente para o mais antigo.
 *
 * Existe num arquivo só porque são duas telas mostrando meses (portal
 * do cliente e lista de planejamentos da equipe), e cada uma ordenando
 * do seu jeito foi como a lista chegou a mostrar dezembro antes de
 * outubro.
 */
export function ordenarMeses<T>(
  itens: T[],
  anoDe: (x: T) => number,
  mesDe: (x: T) => number,
  opcoes: { hoje?: Date; concluido?: (x: T) => boolean } = {},
): T[] {
  const hoje = opcoes.hoje ?? new Date()
  const concluido = opcoes.concluido ?? (() => false)
  const agora = hoje.getFullYear() * 12 + hoje.getMonth()
  const chave = (x: T) => anoDe(x) * 12 + (mesDe(x) - 1)
  const porProximidade = (lista: T[]) => [
    ...lista.filter((x) => chave(x) >= agora).sort((a, b) => chave(a) - chave(b)),
    ...lista.filter((x) => chave(x) < agora).sort((a, b) => chave(b) - chave(a)),
  ]
  return [
    ...porProximidade(itens.filter((x) => !concluido(x))),
    ...porProximidade(itens.filter((x) => concluido(x))),
  ]
}
