/**
 * O plano de mídia de uma publicação.
 *
 * Duas perguntas, e as duas do cliente que paga tráfego: com que
 * objetivo esta peça vai ao ar na Meta, e quanto da verba do mês vai
 * nela. A IA propõe na geração, a equipe revisa e muda o que quiser, e
 * o cliente vê o resultado dessa conversa.
 *
 * Este arquivo é o vocabulário comum dos três lados. A lista de
 * objetivos em si mora em `lib/prompt.ts` (OBJETIVOS_META), junto do
 * prompt que a usa, e na tabela `objetivos_meta` do banco (migração
 * 0026). São três cópias da mesma lista, de propósito: o prompt
 * precisa dela em texto, o banco precisa dela como chave estrangeira,
 * e a tela precisa explicá-la a quem nunca abriu o gerenciador.
 */

import { OBJETIVOS_META } from './prompt'

export type Midia = {
  /** Um dos OBJETIVOS_META, ou nulo enquanto ninguém decidiu. */
  objetivo: string | null
  /** Em reais. Nulo ou zero: a peça fica no orgânico. */
  investimento: number | null
  /** Uma frase dizendo por que este objetivo e este valor. */
  justificativa: string | null
}

export const MIDIA_VAZIA: Midia = { objetivo: null, investimento: null, justificativa: null }

/**
 * O que cada objetivo faz, em português de quem não vive no
 * gerenciador de anúncios. É o mesmo texto da coluna `ajuda` da
 * tabela `objetivos_meta`: se mudar lá, mude aqui.
 */
export const AJUDA_OBJETIVO: Record<string, string> = {
  'Sem impulsionamento': 'A peça fica só no orgânico, sem verba.',
  Reconhecimento: 'Alcançar o máximo de pessoas do público e ser lembrado.',
  Tráfego: 'Levar gente para o site, a loja ou o WhatsApp.',
  Engajamento:
    'Buscar interação: comentário, salvamento, mensagem, visualização de vídeo.',
  Cadastros: 'Coletar contatos por formulário dentro da própria Meta.',
  'Promoção do aplicativo': 'Instalações e eventos dentro de um aplicativo.',
  Vendas: 'Conversão: compra no site ou no catálogo.',
}

export { OBJETIVOS_META }

/** Os objetivos que valem para uma peça impulsionada de verdade. */
export const OBJETIVOS_COM_VERBA = OBJETIVOS_META.filter((o) => o !== 'Sem impulsionamento')

/**
 * Dinheiro escrito como brasileiro escreve.
 *
 * `R$ 1.200,00`. Sem centavos quando o valor é redondo, porque verba
 * de mídia quase nunca tem centavo e "R$ 1.200" lê mais rápido que
 * "R$ 1.200,00" numa lista de quinze publicações.
 */
export function reais(v: number | null | undefined, comCentavos = false): string {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return 'R$ 0'
  const inteiro = Math.abs(n % 1) < 0.005
  const texto = n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: comCentavos || !inteiro ? 2 : 0,
    maximumFractionDigits: comCentavos || !inteiro ? 2 : 0,
  })
  // O navegador separa "R$" do número com espaço não quebrável. Ele é
  // invisível até alguém comparar duas strings ou colar o valor num
  // e-mail e ver um quadradinho. Vira espaço normal.
  return texto.replace(/\u00A0/g, ' ')
}

/**
 * Lê o que a pessoa digitou no campo de dinheiro.
 *
 * Aceita "1200", "1.200", "1200,50" e "R$ 1.200,50", porque é assim
 * que se digita em português e não é trabalho de quem usa a tela
 * adivinhar o formato que o programa quer. Devolve nulo para vazio e
 * para qualquer coisa que não vire número.
 */
export function lerDinheiro(texto: string): number | null {
  const limpo = (texto ?? '').replace(/[^\d,.-]/g, '').trim()
  if (!limpo) return null
  // Com vírgula, ela é o separador decimal e o ponto é de milhar:
  // "1.200,50". Sem vírgula, o ponto pode ser as duas coisas, e quem
  // decide é o formato: "1.200" e "1.200.000" são milhares (grupos de
  // três), "1200.5" é decimal. Errar isto é transformar mil e duzentos
  // reais em um real e vinte centavos.
  const milhar = /^\d{1,3}(\.\d{3})+$/.test(limpo)
  const normal = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : milhar
      ? limpo.replace(/\./g, '')
      : limpo
  const n = Number(normal)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

/** Soma o que já está distribuído entre as publicações. */
export function somarInvestimento(pautas: { midia?: Midia | null }[]): number {
  let total = 0
  for (const p of pautas) {
    const v = Number(p.midia?.investimento ?? 0)
    if (Number.isFinite(v) && v > 0) total += v
  }
  return Math.round(total * 100) / 100
}

/**
 * Como está a distribuição do mês, em uma frase que serve de aviso.
 *
 * `sobra` negativa quer dizer que passou do total — o banco recusa
 * gravar nesse caso (migração 0026), mas a tela avisa antes para a
 * pessoa não descobrir pelo erro.
 */
export function resumoDoMes(total: number | null, distribuido: number) {
  if (total === null || total <= 0) {
    return {
      temVerba: false,
      total: 0,
      distribuido,
      sobra: 0,
      frase:
        distribuido > 0
          ? `Este mês não tem verba informada, mas há ${reais(distribuido)} distribuídos entre as publicações.`
          : 'Este mês não tem verba de mídia informada.',
    }
  }
  const sobra = Math.round((total - distribuido) * 100) / 100
  const frase =
    sobra < -0.005
      ? `Passou ${reais(-sobra)} do total do mês.`
      : sobra < 0.005
        ? 'A verba do mês está toda distribuída.'
        : `Ainda sobram ${reais(sobra)} para distribuir.`
  return { temVerba: true, total, distribuido, sobra, frase }
}
