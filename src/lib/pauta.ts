/**
 * Uma pauta avulsa, escrita por encomenda.
 *
 * Diferente da geração do mês em uma coisa que muda tudo: aqui já
 * existe um mês. A IA não está propondo um conjunto, está encaixando
 * uma peça num conjunto que alguém já aprovou — às vezes um conjunto
 * que o CLIENTE já aprovou. Então o trabalho dela é menor e mais
 * exigente ao mesmo tempo: uma ideia só, que não repita nenhuma das
 * que já estão lá e que caiba no que a marca vinha dizendo naquele mês.
 *
 * Por isso o mês inteiro entra no prompt como restrição, e não como
 * exemplo. Dar as pautas existentes como exemplo faria a IA escrever a
 * décima sexta variação da mesma ideia — que é exatamente o que a
 * equipe não precisa de ajuda para fazer.
 */

import { contextoDaMarca, mesTitulado, PLATAFORMAS, type Entrada, type Achado } from './prompt'

export const VERSAO_PROMPT_PAUTA = '2026-10-pauta-avulsa-1'

export const SISTEMA_PAUTA =
  'Você é o agente de planejamento de conteúdo da Alta Comunicazione, agência de ' +
  'publicidade de Ribeirão Preto/SP. Desta vez você não cria um mês inteiro: cria UMA ' +
  'pauta, para entrar num mês que já existe. Escreve em português do Brasil. Responde ' +
  'somente com o JSON pedido, sem comentário antes ou depois.'

/** Uma pauta que já está no mês. O que basta para não repeti-la. */
export type PautaNoMes = {
  titulo: string
  pilar: string | null
  tema: string | null
  dia: number | null
  plataforma: string | null
}

export type Rascunho = {
  titulo?: string
  conceito?: string
  descricao?: string
  pilar?: string
  cta?: string
  tema?: string
  objetivo?: string
  justificativa?: string
  dia?: number
  plataforma?: string
  formato?: string
}

export type EntradaPauta = {
  marca: Entrada['marca']
  base: Entrada['base']
  mes: number
  ano: number
  dias: number
  /** O que a equipe escreveu na caixa: uma linha dizendo o que quer. */
  pedido: string
  /** As pautas que já estão no mês, para a nova não repetir nenhuma. */
  noMes: PautaNoMes[]
  /** As linhas contratadas da marca, se houver. */
  linhas: string[]
  /** Dias que já têm publicação, para a IA não empilhar tudo num só. */
  ocupados: number[]
  /** A leitura do mês que a IA escreveu na geração, quando existe. */
  leitura?: string | null
}

function listaDoMes(p: PautaNoMes[]): string {
  if (p.length === 0) return 'O mês ainda não tem nenhuma pauta.'
  return p
    .map((x) => {
      const partes = [x.dia ? `dia ${x.dia}` : 'sem data', x.titulo]
      if (x.pilar) partes.push(`pilar: ${x.pilar}`)
      if (x.tema) partes.push(`tema: ${x.tema}`)
      if (x.plataforma) partes.push(x.plataforma)
      return '- ' + partes.join(' · ')
    })
    .join('\n')
}

export function montarPromptPauta(e: EntradaPauta): string {
  const livres = Array.from({ length: e.dias }, (_, i) => i + 1).filter(
    (d) => !e.ocupados.includes(d),
  )

  return `${contextoDaMarca(e.marca, e.base)}

# O QUE ESTÁ SENDO PEDIDO

${e.pedido.trim()}

Escreva UMA pauta para ${mesTitulado(e.mes)} de ${e.ano}, atendendo a esse pedido.

# O MÊS COMO ELE ESTÁ HOJE

Estas pautas já existem e já foram trabalhadas pela equipe. Algumas podem já ter sido
aprovadas pelo cliente. Você NÃO está reescrevendo nenhuma delas.

${listaDoMes(e.noMes)}

Elas entram aqui como RESTRIÇÃO, não como exemplo:

NÃO REPITA. Se a ideia que você ia propor já está nessa lista com outras palavras, é a
ideia errada. Proponha outra.

NÃO IMITE O TOM DA LISTA. Os títulos acima estão resumidos; a sua pauta precisa estar
escrita por inteiro.

ENCAIXE. A pauta nova divide o mês com elas. Se o mês inteiro já é promocional, uma
décima sexta peça promocional desequilibra; diga isso na justificativa e proponha o que
falta.${
    e.linhas.length > 0
      ? `

# LINHAS CONTRATADAS

${e.linhas.map((l) => `- ${l}`).join('\n')}

O campo "pilar" deve ser uma delas, escrita exatamente assim. Se nenhuma servir ao
pedido, use a mais próxima e explique na justificativa.`
      : ''
  }${
    e.leitura
      ? `

# A LEITURA DO MÊS, COMO A AGÊNCIA ESCREVEU

${e.leitura.trim()}

Isto é o raciocínio por trás do mês. A pauta nova precisa caber nele ou dizer, na
justificativa, por que foge.`
      : ''
  }

# A DATA

Dias do mês sem nenhuma publicação: ${livres.length > 0 ? livres.join(', ') : 'nenhum'}.
Prefira um deles. Dia já ocupado só se o pedido exigir.

# RESPONDA ASSIM

{
  "titulo": "",
  "conceito": "uma frase: a ideia central da peça",
  "descricao": "o que a peça mostra e diz, em dois ou três parágrafos",
  "pilar": "",
  "cta": "a chamada para ação",
  "tema": "duas ou três palavras que classificam o assunto",
  "objetivo": "o que esta peça quer que aconteça",
  "justificativa": "por que esta pauta, neste mês, para esta marca",
  "dia": 0,
  "plataforma": "instagram",
  "formato": "Feed"
}

Plataformas possíveis: ${PLATAFORMAS.join(', ')}.
Nada de travessão (—) em nenhum texto.`
}

/**
 * Confere o que voltou.
 *
 * Erro trava a gravação; aviso aparece ao lado do campo e a pessoa
 * decide. A divisão segue a regra do resto do sistema: trava o que
 * quebraria o banco ou a tela, avisa o que é juízo.
 */
export function conferirRascunho(
  r: Rascunho,
  e: { dias: number; linhas: string[]; noMes: PautaNoMes[] },
): Achado[] {
  const a: Achado[] = []
  const texto = (v: unknown) => String(v ?? '').trim()

  if (!texto(r.titulo)) a.push({ gravidade: 'erro', texto: 'A pauta voltou sem título.' })
  if (!texto(r.conceito) && !texto(r.descricao)) {
    a.push({ gravidade: 'erro', texto: 'A pauta voltou sem conceito e sem descrição.' })
  }

  const dia = Number(r.dia ?? 0)
  if (!Number.isInteger(dia) || dia < 1 || dia > e.dias) {
    a.push({ gravidade: 'erro', texto: `O dia ${r.dia ?? '(vazio)'} não existe neste mês.` })
  }

  const plat = texto(r.plataforma).toLowerCase()
  if (plat && !PLATAFORMAS.includes(plat)) {
    a.push({ gravidade: 'erro', texto: `Plataforma desconhecida: ${plat}.` })
  }

  if (e.linhas.length > 0) {
    const pilar = texto(r.pilar)
    if (pilar && !e.linhas.some((l) => l.toLowerCase() === pilar.toLowerCase())) {
      a.push({
        gravidade: 'aviso',
        texto: `"${pilar}" não é uma das linhas contratadas desta marca.`,
      })
    }
  }

  // Título repetido é o defeito mais provável desta chamada, porque é
  // exatamente o que a IA tende a fazer quando recebe uma lista: ela
  // completa o padrão. Aviso, e não erro, porque às vezes o pedido é
  // justamente uma segunda peça do mesmo assunto.
  const novo = texto(r.titulo).toLowerCase()
  if (novo && e.noMes.some((p) => p.titulo.trim().toLowerCase() === novo)) {
    a.push({ gravidade: 'aviso', texto: 'Já existe uma pauta com este título no mês.' })
  }

  if (texto(r.descricao).includes('—') || texto(r.conceito).includes('—')) {
    a.push({ gravidade: 'aviso', texto: 'O texto veio com travessão; troque antes de salvar.' })
  }

  return a
}

/** O rascunho como a tela precisa dele: tudo texto, nada indefinido. */
export function paraFormulario(
  r: Rascunho,
  e: { dias: number },
): {
  title: string
  concept: string
  description: string
  editorial_line: string
  cta: string
  theme: string
  objective: string
  rationale: string
  dia: number
  plataforma: string
  formato: string
} {
  const t = (v: unknown) => String(v ?? '').trim()
  const dia = Number(r.dia ?? 0)
  const plat = t(r.plataforma).toLowerCase()
  return {
    title: t(r.titulo),
    concept: t(r.conceito),
    description: t(r.descricao),
    editorial_line: t(r.pilar),
    cta: t(r.cta),
    theme: t(r.tema),
    objective: t(r.objetivo),
    rationale: t(r.justificativa),
    dia: Number.isInteger(dia) && dia >= 1 && dia <= e.dias ? dia : 1,
    plataforma: PLATAFORMAS.includes(plat) ? plat : 'instagram',
    formato: t(r.formato) || 'Feed',
  }
}
