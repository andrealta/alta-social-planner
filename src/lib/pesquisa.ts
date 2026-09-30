/**
 * A busca na internet durante a geração do planejamento.
 *
 * O QUE ELA RESOLVE
 *
 * Todas as outras fontes do prompt olham para dentro: a base descreve
 * a marca, o estilo mostra como ela escreve, o Operand conta o que já
 * foi produzido, o histórico lembra os meses anteriores. Nenhuma delas
 * sabe que semana que vem tem uma feira do setor, ou que o mês tem uma
 * data que faz sentido para aquele produto.
 *
 * O QUE ELA PODE ESTRAGAR
 *
 * Uma agência vende o contrário da média do setor. Deixar um modelo
 * pesquisar "tendências" e planejar a partir do que achou é a maneira
 * mais rápida de produzir o mês que qualquer concorrente produziria, e
 * com ar de fundamentado, porque veio com link.
 *
 * Daí a regra central deste arquivo, e ela é uma só: o que vem da
 * internet pode mudar COMO uma peça é feita, nunca POR QUE ela existe.
 * A razão de existir continua vindo da base da marca, e a regra de
 * justificativa com âncora nomeada, que já existe, continua valendo
 * sem exceção. "Está em alta" não é âncora.
 *
 * DUAS COISAS, E SÓ DUAS
 *
 * A agência escolheu dois assuntos de busca: datas e sazonalidade do
 * setor, e referência de formato. Notícia recente e movimento de
 * concorrente ficaram de fora por decisão dela. A lista é curta de
 * propósito: cada assunto a mais é uma porta a mais para o mês ser
 * decidido por algo que não é a marca.
 */

/**
 * A ferramenta, como a API espera receber.
 *
 * `max_uses` em cinco: é o suficiente para cobrir os dois assuntos com
 * folga, e é o teto que impede uma geração de virar uma sessão de
 * navegação. Cada pesquisa custa, e pesquisa demais também enche o
 * contexto de resultado que ninguém pediu.
 *
 * Sem `allowed_domains`: restringir a domínio parece prudente e não é.
 * Uma lista branca escrita hoje envelhece, e o modelo passaria a citar
 * só as fontes que alguém lembrou de listar em 2026, o que é pior que
 * ler uma fonte fraca sabendo que ela é fraca.
 */
export const BUSCA_NA_INTERNET = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
  user_location: {
    type: 'approximate',
    city: 'Ribeirão Preto',
    region: 'São Paulo',
    country: 'BR',
    timezone: 'America/Sao_Paulo',
  },
} as const

/** Dez dólares por mil pesquisas. Repetido aqui para a tela poder estimar. */
export const CUSTO_POR_BUSCA_USD = 10 / 1000

/**
 * O bloco de regras que acompanha a ferramenta no prompt.
 *
 * Recebe o mês porque "sazonalidade" sem mês é conversa: a IA precisa
 * procurar o que acontece NAQUELE mês, e não o que acontece em geral.
 */
export function blocoDePesquisa(e: {
  nomeDaMarca: string
  segmento?: string | null
  nomeDoMes: string
  ano: number
}): string {
  const setor = e.segmento?.trim()
    ? `${e.segmento.trim()}`
    : 'o segmento em que a marca atua, deduzido da base'

  return `# PESQUISA NA INTERNET

Você tem busca na internet disponível e deve usá-la antes de planejar. No máximo cinco
pesquisas. Duas coisas, e somente estas duas:

1. DATAS E SAZONALIDADE de ${setor}, especificamente em ${e.nomeDoMes} de ${e.ano}:
   feiras, safras, ciclos de consumo, datas de calendário que façam sentido para esta
   marca. Fato com data, verificável.

2. REFERÊNCIA DE FORMATO: como peças estão sendo executadas hoje nas plataformas em que
   esta marca publica. Isto é sobre FORMA, não sobre assunto.

Não pesquise notícia do setor nem movimento de concorrente: a agência decidiu manter
essas duas fontes fora daqui, e o que os concorrentes publicam já entra por outro
caminho, quando existe varredura.

## COMO O QUE VOCÊ ACHAR PODE SER USADO

A regra é uma só, e vale para tudo que vier da internet:

O QUE VOCÊ ACHAR PODE MUDAR COMO UMA PEÇA É FEITA, NUNCA POR QUE ELA EXISTE.

A razão de existir de cada pauta continua saindo da base da marca, do escopo e das
obrigatoriedades. A regra de JUSTIFICATIVA continua valendo inteira: toda pauta cita uma
âncora nomeada da base. "Está em alta", "é tendência" e "a concorrência está fazendo" NÃO
são âncoras, e uma justificativa apoiada nisso será rejeitada.

Uma data encontrada só entra se a marca tiver algo substantivo a dizer sobre ela. A regra
de DATAS SENSÍVEIS vale igual: data usada como gancho de conveniência é pior que data
ignorada.

Um formato encontrado só entra numa pauta que já se justificava sem ele. Ele muda a
execução de uma ideia que já existia; não cria ideia.

## O QUE VOCÊ PRECISA DEVOLVER

Em "fontes", uma linha por página que influenciou alguma decisão, no formato
"o que eu tirei dali, em uma frase | url". Só o que influenciou: página que você leu e
descartou não entra. Se a pesquisa não mudou nada no planejamento, devolva "fontes" vazio
e diga isso em "alertas". Pesquisa que não muda nada é resultado legítimo, e esconder
isso faria parecer que o mês foi fundamentado quando não foi.

Na leitura do mês, se alguma coisa da internet pesou na decisão, diga em uma frase qual
foi e o que ela mudou.`
}
