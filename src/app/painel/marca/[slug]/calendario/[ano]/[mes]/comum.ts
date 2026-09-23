import type { Layout } from '@/lib/layouts'
import type { Midia } from '@/lib/midia'
import type { CampoDoGrupo } from '@/lib/grupo'

/**
 * O que o calendário e o painel da pauta compartilham.
 *
 * Existe para os dois não divergirem: um rótulo de estado que muda
 * aqui muda nos dois lugares, e não há duas listas de cores para
 * alguém esquecer de atualizar.
 */

export type ConteudoPauta = {
  piece_kind: string
  aspect_ratio: string
  caption: string | null
  cta: string | null
  hashtags: string[]
  alt_text: string | null
  caption_variants: { canal?: string; texto?: string }[]
  art_concept: string | null
  art_direction: string | null
  image_prompt: string | null
  scenes: { t?: string; descricao?: string; fala?: string; chave?: boolean }[]
  layout: Record<string, string>
  generated_for_version: number | null
}

export type Versao = {
  version: number
  reason: string | null
  trigger: string
  created_at: string
  titulo: string | null
  autor: string | null
}

export type Pauta = {
  id: string
  title: string
  theme: string | null
  concept: string | null
  description: string | null
  editorial_line: string | null
  objective: string | null
  rationale: string | null
  cta: string | null
  status: string
  current_version: number
  linha: string | null
  linhaIndice: number | null
  formato: string | null
  plataforma: string | null
  data: string | null
  conteudo: ConteudoPauta | null
  /** As imagens do layout, em ordem. A primeira é a capa. */
  layouts: Layout[]
  /**
   * O plano de mídia: objetivo de campanha na Meta, verba e por quê.
   *
   * Fica fora de `Editaveis` de propósito. Mudar o valor de mídia não
   * é mudar o conteúdo da pauta: não cria versão nova, não conta como
   * edição na medida de Precisão e não invalida a crítica. Por isso
   * tem gravação própria (`salvarMidia`) e não passa por `salvar_pauta`.
   */
  midia: Midia
  historico: Versao[]
  /** O que o cliente escreveu sobre esta pauta, do mais novo ao mais velho. */
  recados: Recado[]
  /** Quem decidiu o quê, e quando. */
  decisoes: Decisao[]
}

/**
 * O juízo do crítico sobre uma pauta.
 *
 * `vencida` quer dizer que a pauta mudou depois da avaliação. A tela
 * mostra o juízo de qualquer forma, mas avisando — é informação de
 * ontem, e quem lê precisa saber disso.
 */
export type JuizoDaPauta = {
  nota: number
  veredito: 'boa' | 'revisar' | 'fraca'
  porque: string
  arrume: string
  vencida: boolean
}

export type Critica = {
  veredito: string
  quando: string | null
  itens: Record<string, JuizoDaPauta>
}

export type Decisao = {
  id: string
  decisao: string
  autor: string | null
  email: string | null
  created_at: string
  version: number
  lado: string
  /** Quanto tempo depois do envio ao cliente a decisão veio. Nulo: não medido. */
  segundos: number | null
}

export type Recado = {
  id: string
  body: string
  created_at: string
  autor: string | null
}

/**
 * A situação da pauta, como a equipe precisa ver de relance.
 *
 * Cada uma tem cor, símbolo E palavra. Cor sozinha não diz nada a
 * quem não distingue verde de vermelho — e não diz nada a ninguém na
 * primeira vez que abre a tela.
 *
 * `cor` é o tom cheio, que vai no ponto de seis pixels. `wash` é o
 * fundo pastel da pílula, com a tinta escura de sempre em cima. Essa
 * separação existe porque cor de situação como TEXTO não funciona: o
 * amarelo da Alta tem 1,27:1 de contraste com o branco. Como ponto
 * sobre fundo pastel, funciona.
 *
 * `curto` é o que cabe no cartão do calendário; `rotulo` é o do
 * painel e da legenda.
 */
export const ESTADO: Record<
  string,
  { rotulo: string; curto: string; cor: string; wash: string; simbolo: string }
> = {
  ai_generated: { rotulo: 'Em avaliação', curto: 'em avaliação', cor: 'var(--st-avaliacao)', wash: 'var(--st-avaliacao-wash)', simbolo: '○' },
  internal_review: { rotulo: 'Em avaliação', curto: 'em avaliação', cor: 'var(--st-avaliacao)', wash: 'var(--st-avaliacao-wash)', simbolo: '○' },
  internal_changes: { rotulo: 'Precisa ajuste', curto: 'precisa ajuste', cor: 'var(--st-ajuste)', wash: 'var(--st-ajuste-wash)', simbolo: '!' },
  internally_approved: { rotulo: 'Aprovada', curto: 'aprovada', cor: 'var(--st-aprovado)', wash: 'var(--st-aprovado-wash)', simbolo: '✓' },
  sent_to_client: { rotulo: 'Com o cliente', curto: 'com o cliente', cor: 'var(--st-cliente)', wash: 'var(--st-cliente-wash)', simbolo: '→' },
  client_changes_requested: { rotulo: 'Cliente pediu ajuste', curto: 'pediu ajuste', cor: 'var(--st-ajuste)', wash: 'var(--st-ajuste-wash)', simbolo: '!' },
  client_approved: { rotulo: 'Aprovada pelo cliente', curto: 'aprovada pelo cliente', cor: 'var(--st-aprovado)', wash: 'var(--st-aprovado-wash)', simbolo: '✓✓' },
}

export const SITUACOES = [
  'ai_generated',
  'internal_changes',
  'internally_approved',
  'sent_to_client',
  'client_approved',
]

/**
 * O que a equipe faz com uma pauta.
 *
 * Eram quatro botões contando estados que só existiam no meu
 * diagrama. Na prática a pessoa abre a pauta, lê, conserta se
 * precisar, e aprova. Então é um botão: Aprovar. E, depois de
 * aprovada, um caminho de volta.
 *
 * "Precisa ajuste" continua existindo como marcador para quem quer
 * deixar pendente e voltar depois — mas é secundário, não a rota.
 */
export const ACOES: Record<string, { para: string; texto: string; forte?: boolean }[]> = {
  ai_generated: [
    { para: 'internally_approved', texto: 'Aprovar', forte: true },
    { para: 'internal_changes', texto: 'Deixar pendente' },
  ],
  internal_review: [
    { para: 'internally_approved', texto: 'Aprovar', forte: true },
    { para: 'internal_changes', texto: 'Deixar pendente' },
  ],
  internal_changes: [{ para: 'internally_approved', texto: 'Aprovar', forte: true }],
  internally_approved: [{ para: 'internal_changes', texto: 'Reabrir' }],
  client_changes_requested: [
    { para: 'internal_changes', texto: 'Assumir o ajuste', forte: true },
  ],
}

export type Editaveis = {
  title: string
  theme: string
  concept: string
  description: string
  editorial_line: string
  objective: string
  rationale: string
  cta: string
}

/** Um campo editável da pauta. A forma do grupo mora em `lib/grupo`. */
export type CampoDaPauta = CampoDoGrupo<keyof Editaveis>

/**
 * O pilar editorial, sozinho.
 *
 * Fica fora dos grupos porque não é prosa: é a classificação da peça
 * dentro da linha editorial da marca, uma palavra que a equipe troca
 * num piscar e que o calendário usa para colorir. Misturá-lo ao texto
 * corrido só atrapalharia a leitura dos dois.
 */
export const CAMPO_PILAR: CampoDaPauta = {
  id: 'editorial_line',
  rotulo: 'Pilar editorial',
  linhas: 1,
  leitura: 'rotulado',
}

/**
 * A pauta como ela se lê: um texto só.
 *
 * Eram quatro caixas empilhadas, cada uma com seu rótulo, e quem abria
 * a pauta precisava remontar mentalmente o que aquilo era. No banco
 * eles continuam quatro campos separados, porque a IA precisa saber o
 * que é título e o que é chamada para ação na hora de escrever o
 * conteúdo, e o portal do cliente separa contexto de detalhe. O que
 * mudou é a tela: lê-se como um texto, edita-se campo a campo quando
 * for preciso.
 */
export const GRUPO_CONTEUDO: CampoDaPauta[] = [
  { id: 'title', rotulo: 'Título', linhas: 2, leitura: 'titulo' },
  { id: 'concept', rotulo: 'Conceito', linhas: 2, leitura: 'texto' },
  { id: 'description', rotulo: 'Descrição', linhas: 6, leitura: 'apoio' },
  { id: 'cta', rotulo: 'Chamada para ação', linhas: 1, leitura: 'rotulado' },
]

/**
 * O bastidor, também como um texto só.
 *
 * Continua recolhido, e continua existindo porque o sistema depende
 * dos três: o TEMA alimenta a regra que impede repetir o mesmo assunto
 * três meses seguidos, e a JUSTIFICATIVA é a âncora que explica por
 * que a pauta existe. Some da primeira vista, não do trabalho.
 */
export const GRUPO_BASTIDOR: CampoDaPauta[] = [
  { id: 'theme', rotulo: 'Tema', linhas: 1, leitura: 'rotulado' },
  { id: 'objective', rotulo: 'Objetivo', linhas: 1, leitura: 'rotulado' },
  { id: 'rationale', rotulo: 'Justificativa', linhas: 4, leitura: 'texto' },
]

/** Todo campo editável da pauta, para saber se há algo por salvar. */
export const TODOS_CAMPOS: CampoDaPauta[] = [
  CAMPO_PILAR,
  ...GRUPO_CONTEUDO,
  ...GRUPO_BASTIDOR,
]

export function paraEditaveis(p: Pauta): Editaveis {
  return {
    title: p.title ?? '',
    theme: p.theme ?? '',
    concept: p.concept ?? '',
    description: p.description ?? '',
    editorial_line: p.editorial_line ?? '',
    objective: p.objective ?? '',
    rationale: p.rationale ?? '',
    cta: p.cta ?? '',
  }
}

export const ORIGEM: Record<string, string> = {
  ai: 'IA',
  internal: 'equipe',
  client_request: 'pedido do cliente',
}

/**
 * O vocabulário visual mora em `@/lib/visual`, porque o portal do
 * cliente usa as mesmas peças. Reexportado aqui para que nada que já
 * importava daqui precise mudar de endereço.
 */
export {
  corDaLinha,
  tipoDaPeca,
  ICONE_PECA,
  pilula,
  ponto,
  botao,
  caixaTexto,
  cartao,
  semanasDoMes,
  DIAS_CURTOS,
} from '@/lib/visual'
