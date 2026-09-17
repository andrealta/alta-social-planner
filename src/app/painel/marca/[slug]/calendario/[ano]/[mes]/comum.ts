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

/**
 * A pílula de situação. Fundo pastel, tinta escura, ponto colorido.
 *
 * O ponto é um elemento separado porque a cor precisa aparecer em
 * pouca área: seis pixels dizem tanto quanto um bloco chapado, e não
 * competem com o resto da tela.
 */
export function pilula(wash: string, pequena = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: pequena ? '3px 9px' : '4px 11px',
    borderRadius: 99,
    background: wash,
    color: 'var(--text)',
    fontSize: pequena ? 10 : 11.5,
    fontWeight: 600,
    lineHeight: 1.45,
    whiteSpace: 'nowrap',
  }
}

export function ponto(cor: string, tamanho = 6): React.CSSProperties {
  return {
    width: tamanho,
    height: tamanho,
    borderRadius: 99,
    background: cor,
    display: 'inline-block',
    flex: '0 0 auto',
  }
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

/**
 * Os dois botões do sistema.
 *
 * Uma ação forte por área, no azul da marca — é a regra que segura o
 * desenho inteiro. O secundário é branco com sombra, sem contorno
 * cinza: contorno em tudo é o que fazia a tela parecer antiga.
 */
export function botao(forte: boolean, desligado = false): React.CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 13.5,
    fontWeight: forte ? 700 : 600,
    padding: '10px 18px',
    border: 'none',
    borderRadius: 99,
    background: forte ? 'var(--accent)' : 'var(--surface)',
    color: forte ? '#fff' : 'var(--text)',
    boxShadow: desligado
      ? 'none'
      : forte
        ? 'var(--shadow-botao)'
        : '0 1px 2px rgba(29, 37, 48, .06), 0 6px 14px -10px rgba(29, 37, 48, .2)',
    cursor: desligado ? 'not-allowed' : 'pointer',
    opacity: desligado ? 0.45 : 1,
  }
}

/** Campo preenchido em vez de contornado: menos linha na tela. */
export const caixaTexto: React.CSSProperties = {
  width: '100%',
  resize: 'vertical',
  padding: '11px 13px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  lineHeight: 1.55,
  color: 'var(--text)',
  background: 'var(--surface-2)',
  border: '1px solid transparent',
  borderRadius: 'var(--r-sm)',
  outline: 'none',
}

/** O cartão padrão: branco, sem moldura, sombra macia. */
export const cartao: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--r-lg)',
  boxShadow: 'var(--shadow)',
}
