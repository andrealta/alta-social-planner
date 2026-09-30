/**
 * O estado das plataformas, dentro do prompt.
 *
 * A nota vem do `24-plataformas.cmd`, que busca nas fontes de primeira
 * mão de cada plataforma, grava pendente e espera alguém ler. Aqui ela
 * só é lida e emoldurada.
 *
 * POR QUE ELA PRECISA DE MOLDURA
 *
 * Sem moldura, um texto que diz "o Meta passou a aceitar Reels de até
 * três minutos" chega ao modelo com a mesma autoridade da base da
 * marca, e a diferença entre as duas é justamente o que importa: a
 * base diz por que a marca existe, a nota diz o que a ferramenta
 * aceita. Confundir as duas é como se produz um mês inteiro decidido
 * por uma novidade de plataforma.
 *
 * A IDADE ENTRA NO TEXTO
 *
 * Uma nota de oito meses continua entrando em todo planejamento, e
 * nada nela denunciaria isso. Dizer a idade em português dentro do
 * próprio bloco é mais barato que qualquer regra de validade, e deixa
 * o modelo pesar: "isto foi apurado há 4 dias" e "isto foi apurado há
 * 210 dias" são afirmações diferentes sobre o mesmo texto.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type NotaDePlataforma = {
  id: number
  quando: string
  texto: string
  fontes: { titulo?: string; url: string }[]
  dias: number
}

/** A partir de quantos dias a nota passa a se anunciar como velha. */
export const DIAS_ATE_ENVELHECER = 45

/**
 * A nota que está valendo, ou nula.
 *
 * Nula é o estado normal: antes da primeira aprovação, e sempre que a
 * agência descarta a nota da semana. A geração roda igual sem ela, que
 * é como rodava antes desta fonte existir.
 */
export async function lerNotaDePlataformas(
  supabase: SupabaseClient,
): Promise<NotaDePlataforma | null> {
  // Pela função do banco, não por consulta solta: a definição de "está
  // valendo" tem três condições, e três cópias dela seriam três
  // chances de divergirem.
  const { data, error } = await supabase.rpc('plataforma_nota_valendo')
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null
  const n = Array.isArray(data) ? data[0] : data
  if (!n?.texto) return null
  return {
    id: Number(n.id),
    quando: String(n.quando),
    texto: String(n.texto),
    fontes: Array.isArray(n.fontes) ? n.fontes : [],
    dias: Number(n.dias ?? 0),
  }
}

/** Como a idade da nota se lê em português. */
export function idadeEmTexto(dias: number): string {
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 14) return `há ${dias} dias`
  if (dias < 60) return `há ${Math.round(dias / 7)} semanas`
  return `há ${Math.round(dias / 30)} meses`
}

export function blocoDePlataformas(nota: NotaDePlataforma | null): string {
  if (!nota || !nota.texto.trim()) return ''

  const velha =
    nota.dias > DIAS_ATE_ENVELHECER
      ? `\n\nATENÇÃO: esta apuração tem ${nota.dias} dias, e o normal é ela ser refeita toda semana. Trate o que está aqui como provavelmente ainda válido, mas não como recente, e não afirme que algo é novidade com base nela.`
      : ''

  return `# O QUE MUDOU NAS PLATAFORMAS

Apurado ${idadeEmTexto(nota.dias)} nas páginas das próprias plataformas, não em
publicações de terceiros. Uma pessoa da agência leu e aprovou este texto antes de ele
entrar aqui.

${nota.texto.trim()}${velha}

Como usar:

MUDA O COMO, NÃO O POR QUÊ. Isto pode mudar o formato de uma peça, a duração, a
proporção, o objetivo de campanha disponível. Não pode ser a razão de a peça existir.
A razão continua vindo da base da marca, e a regra de justificativa com âncora nomeada
continua valendo sem exceção. "A plataforma lançou isso" não é âncora.

NÃO DIZ NADA SOBRE DESEMPENHO. Este texto foi apurado para responder o que a
ferramenta aceita, e só isso. Ele não afirma, e você não pode concluir a partir dele,
que um formato rende mais, alcança mais ou converte melhor. Quem responde desempenho é
o dado da própria conta, e ele não está aqui.

NOVIDADE NÃO É OBRIGAÇÃO. Um recurso novo não precisa entrar no mês. Se entrar, precisa
da mesma justificativa que qualquer outra peça teria, e a justificativa não pode ser
que o recurso é novo.

O SILÊNCIO É RESPOSTA. Se o texto acima diz que nada relevante mudou, isso é um
resultado, não uma falha. Planeje o mês normalmente e não force menção a plataforma
nenhuma.`
}
