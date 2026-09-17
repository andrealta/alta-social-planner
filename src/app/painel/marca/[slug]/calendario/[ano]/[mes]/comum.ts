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
  historico: Versao[]
  /** O que o cliente escreveu sobre esta pauta, do mais novo ao mais velho. */
  recados: Recado[]
  /** Quem decidiu o quê, e quando. */
  decisoes: Decisao[]
}

export type Decisao = {
  id: string
  decisao: string
  autor: string | null
  email: string | null
  created_at: string
  version: number
  lado: string
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
 * `curto` é o que cabe no cartão do calendário; `rotulo` é o do
 * painel e da legenda.
 */
export const ESTADO: Record<
  string,
  { rotulo: string; curto: string; cor: string; simbolo: string }
> = {
  ai_generated: { rotulo: 'Em avaliação', curto: 'avaliação', cor: 'var(--st-avaliacao)', simbolo: '○' },
  internal_review: { rotulo: 'Em avaliação', curto: 'avaliação', cor: 'var(--st-avaliacao)', simbolo: '○' },
  internal_changes: { rotulo: 'Precisa ajuste', curto: 'ajuste', cor: 'var(--st-ajuste)', simbolo: '!' },
  internally_approved: { rotulo: 'Aprovada', curto: 'aprovada', cor: 'var(--st-aprovado)', simbolo: '✓' },
  sent_to_client: { rotulo: 'Com o cliente', curto: 'cliente', cor: 'var(--st-cliente)', simbolo: '→' },
  client_changes_requested: { rotulo: 'Cliente pediu ajuste', curto: 'ajuste', cor: 'var(--st-ajuste)', simbolo: '!' },
  client_approved: { rotulo: 'Aprovada pelo cliente', curto: 'final', cor: 'var(--st-aprovado)', simbolo: '✓✓' },
}

/** A ordem em que a legenda apresenta as situações. */
export const SITUACOES = [
  'ai_generated',
  'internal_changes',
  'internally_approved',
  'sent_to_client',
  'client_approved',
]

/**
 * A cor da linha de produto.
 *
 * Fixa por linha, nunca por ordem de aparição: se a Diet sumir de um
 * mês, a Gourmet não pode herdar a cor dela. O índice vem da posição
 * cadastrada no escopo do contrato, que não muda.
 *
 * Passando de quatro linhas, as demais entram em cinza. Uma quinta
 * cor inventada aqui quebraria a separação que as quatro têm hoje.
 */
export function corDaLinha(indice: number | null | undefined): string {
  if (indice === null || indice === undefined || indice < 0 || indice > 3) {
    return 'var(--linha-outra)'
  }
  return `var(--linha-${indice + 1})`
}

/** Que tipo de peça é, a partir do formato que a equipe escreveu. */
export function tipoDaPeca(formato: string | null | undefined): string {
  const f = formato ?? ''
  if (/v[ií]deo|reel|reels|tiktok|shorts|filme|motion|anima/i.test(f)) return 'Vídeo'
  if (/carrossel|carousel/i.test(f)) return 'Carrossel'
  if (/story|stories/i.test(f)) return 'Story'
  return 'Imagem'
}

export const ICONE_PECA: Record<string, string> = {
  'Vídeo': '▶',
  Carrossel: '❑',
  Story: '▭',
  Imagem: '▣',
}

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

/** Os campos principais, na ordem em que a equipe lê a pauta. */
export const CAMPOS: { id: keyof Editaveis; rotulo: string; linhas: number }[] = [
  { id: 'editorial_line', rotulo: 'Pilar editorial', linhas: 1 },
  { id: 'concept', rotulo: 'Conceito', linhas: 2 },
  { id: 'title', rotulo: 'Título', linhas: 2 },
  { id: 'description', rotulo: 'Descrição do conteúdo', linhas: 5 },
  { id: 'cta', rotulo: 'Chamada para ação', linhas: 1 },
]

/**
 * Os dois que ficam recolhidos.
 *
 * Não saem da tela porque o sistema depende deles: o TEMA alimenta a
 * regra que impede repetir o mesmo assunto três meses seguidos, e a
 * JUSTIFICATIVA é a âncora que explica por que a pauta existe. Se
 * sumissem daqui, a equipe editaria o título e deixaria o tema velho
 * para trás sem perceber.
 */
export const CAMPOS_EXTRAS: { id: keyof Editaveis; rotulo: string; linhas: number }[] = [
  { id: 'theme', rotulo: 'Tema', linhas: 1 },
  { id: 'objective', rotulo: 'Objetivo', linhas: 1 },
  { id: 'rationale', rotulo: 'Justificativa', linhas: 4 },
]

export const TODOS_CAMPOS = [...CAMPOS, ...CAMPOS_EXTRAS]

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

export function botao(forte: boolean, desligado = false): React.CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 13.5,
    fontWeight: forte ? 700 : 600,
    padding: '9px 16px',
    border: forte ? 'none' : '1px solid var(--line-2)',
    borderRadius: 8,
    background: forte ? 'var(--text)' : 'var(--surface)',
    color: forte ? 'var(--paper)' : 'var(--text)',
    cursor: desligado ? 'not-allowed' : 'pointer',
    opacity: desligado ? 0.45 : 1,
  }
}

export const caixaTexto: React.CSSProperties = {
  width: '100%',
  resize: 'vertical',
  padding: '9px 11px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  lineHeight: 1.55,
  color: 'var(--text)',
  background: 'var(--surface)',
  border: '1px solid var(--line-2)',
  borderRadius: 8,
  outline: 'none',
}
