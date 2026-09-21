/**
 * Monta o prompt do planejamento mensal.
 *
 * Este arquivo é a parte mais valiosa do sistema e a mais fácil de
 * estragar. As regras abaixo não são enfeite de prompt: cada uma
 * nasceu de um erro real que o piloto produziu. Antes de afrouxar
 * qualquer uma, vale reler por que ela existe.
 *
 * `VERSAO_PROMPT` é gravada em ai_runs a cada geração. Quando o
 * resultado piorar, é ela que diz o que mudou.
 */

import { SECOES } from './base'

export const VERSAO_PROMPT = '2026-09-planejamento-1'

export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/**
 * "Dezembro de 2026" — com o "de" minúsculo.
 *
 * Existe porque o CSS não sabe português: `text-transform: capitalize`
 * sobe a primeira letra de CADA palavra, e devolvia "Dezembro De 2026".
 * Em português só o nome do mês leva maiúscula aqui.
 */
export function mesTitulado(mes: number): string {
  const m = MESES[mes - 1] ?? ''
  return m.charAt(0).toUpperCase() + m.slice(1)
}

export type Linha = { label: string; quota: number }
export type MesAnterior = { mes: number; ano: number; temas: string[] }

export type Entrada = {
  marca: { nome: string; segmento?: string | null }
  base: Record<string, Record<string, string>>
  /** Exemplos reais de como esta marca escreve. Ver `lib/estilo.ts`. */
  estilo?: string
  /**
   * O que os concorrentes andam publicando. Ver `lib/concorrencia.ts`.
   * Entra como restrição — "não repita isto" —, nunca como exemplo.
   */
  concorrencia?: string
  escopo: Linha[]
  mes: number
  ano: number
  briefing: string
  historico: MesAnterior[]
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate()
}

/** A base da marca, em texto, só com o que foi de fato preenchido. */
export function contextoDaMarca(
  marca: Entrada['marca'],
  base: Entrada['base'],
): string {
  const partes = [`# MARCA: ${marca.nome}`]
  if (marca.segmento) partes.push(`Segmento: ${marca.segmento}`)

  for (const secao of SECOES) {
    const valores = base[secao.chave]
    if (!valores) continue

    const linhas = secao.campos
      .map((campo) => {
        const v = (valores[campo.id] ?? '').trim()
        // Campo de uma palavra solta é ruído: não descreve nada e
        // ainda faz o modelo achar que aquilo é a resposta completa.
        return v.length > 8 ? `### ${campo.rotulo}\n${v}` : null
      })
      .filter((x): x is string => x !== null)

    if (linhas.length > 0) {
      partes.push(`## ${secao.titulo.toUpperCase()}\n${linhas.join('\n\n')}`)
    }
  }

  return partes.join('\n\n')
}

export const SISTEMA =
  'Você é o agente de planejamento de conteúdo da Alta Comunicazione, agência de ' +
  'publicidade de Ribeirão Preto/SP. Você cria as pautas de um mês para uma marca, ' +
  'a partir da base de conhecimento dela. Você não redefine a estratégia da marca. ' +
  'Escreve em português do Brasil. Responde somente com o JSON pedido, sem comentário antes ou depois.'

export function montarPromptPautas(e: Entrada): string {
  const total = e.escopo.reduce((a, c) => a + (Number(c.quota) || 0), 0)
  const nomeMes = MESES[e.mes - 1]
  const dias = diasNoMes(e.ano, e.mes)

  const hist =
    e.historico.length > 0
      ? e.historico
          .map(
            (h) =>
              `- ${MESES[h.mes - 1]}/${h.ano}: ` +
              (h.temas.length > 0 ? h.temas.join(' · ') : 'sem pautas registradas'),
          )
          .join('\n')
      : 'Nenhum planejamento anterior registrado no sistema.'

  return `${contextoDaMarca(e.marca, e.base)}${e.estilo ? '\n\n' + e.estilo : ''}${e.concorrencia ? '\n\n' + e.concorrencia : ''}

# HISTÓRICO RECENTE

${hist}

# O MÊS

Planejamento de ${nomeMes} de ${e.ano}.

Escopo contratado (restrição dura, feche exatamente):
${e.escopo.map((c) => `- ${c.label || '(sem nome)'}: ${c.quota} publicações`).join('\n')}
Total: ${total} publicações.

Obrigatoriedades do mês:
${e.briefing.trim() || 'Nenhuma declarada.'}

# REGRAS

ESCOPO: restrição dura. Feche a cota de cada linha exatamente. Ao final preencha
"conferencia" com a contagem, usando as mesmas chaves do escopo acima.

RECURSOS: restrição dura. Ideia que dependa de recurso marcado como indisponível na
base deve ser descartada, não adaptada.

DATAS SENSÍVEIS: restrição dura. Datas de significado histórico, religioso ou social
não podem ser usadas como gancho de conveniência, nem mencionadas de passagem como
"feriadão" ou pretexto de promoção. Ou a marca tem algo substantivo a dizer e diz com
profundidade, ou a data é ocupada por conteúdo comum que não a menciona.

ROTAÇÃO DE TERRITÓRIO: território que dominou os meses anteriores entra com no máximo
metade do peso. Território com zero ocupação no histórico precisa ser considerado
explicitamente; se for recusado, escreva o motivo.

ROTAÇÃO DE TEMA: regra própria, independente da de território: tema que apareceu em
dois meses consecutivos NÃO pode ser o assunto principal de nenhuma pauta no terceiro.
Pode seguir presente como elemento de apoio. Se for obrigatoriedade que atravessa o ano,
diga isso e proponha um ÂNGULO novo, nunca o mesmo recorte.

JUSTIFICATIVA: toda pauta precisa citar ao menos uma ÂNCORA NOMEADA: um trecho do
posicionamento, um campo da base, uma obrigatoriedade, uma persona ou um item do
histórico. Cite pelo nome. Justificativa sem âncora será rejeitada.

EXPRESSÕES PROIBIDAS: as declaradas na base, mais qualquer sinônimo próximo. Verifique
título, descrição e tema antes de devolver. Se a base não declarar nenhuma, registre
isso em "alertas".

TRAVESSÃO: não use travessão (—) em nenhum campo que você devolver: título, conceito,
descrição, CTA, legenda, leitura do mês, territórios, justificativas e alertas. É uma das marcas mais evidentes de texto escrito por IA.
Use vírgula, ponto, dois-pontos ou parênteses.

MEMÓRIA É CONTEXTO, NÃO LEI. Uma ideia forte pode contrariar o padrão histórico se a
justificativa sustentar. Nesse caso, diga na justificativa que está contrariando.

COMECE PELA TENSÃO. Antes das pautas, escreva a leitura do mês: qual é o problema ou a
oportunidade real deste mês para esta marca. Um mês sem tensão identificada vira uma
lista de posts.

# SAÍDA

Responda SOMENTE com JSON válido, nesta forma:

{
  "leitura": "A tensão real do mês para esta marca, em até 120 palavras.",
  "territorios": [{"nome":"", "peso":00, "cobre":"", "posts":0}],
  "pautas": [{
    "dia": 3,
    "linha": "nome exato de uma das linhas do escopo",
    "plataforma": "instagram",
    "formato": "",
    "objetivo": "",
    "pilar": "",
    "tema": "",
    "titulo": "",
    "conceito": "A ideia central em uma frase.",
    "descricao": "O que é a peça, com direção de arte.",
    "cta": "",
    "justificativa": "Começa com a âncora nomeada."
  }],
  "conferencia": {${e.escopo.map((c) => `"${c.label || 'linha'}":0`).join(', ')}},
  "nao_fazer": ["O que a estratégia decidiu NÃO fazer, e por quê."],
  "alertas": ["Lacunas da base que limitaram o resultado."]
}

Os pesos dos territórios somam 100. "dia" é o número do dia no mês de ${nomeMes} de ${e.ano},
que tem ${dias} dias. Respeite intervalo mínimo de dois dias entre publicações
e evite concentrar em fim de semana sem motivo.
"plataforma" é uma destas, exatamente: instagram, linkedin, tiktok, youtube, facebook, pinterest.`
}

// -------------------------------------------------------------
// Conferência do que voltou
//
// O prompt PEDE que a cota feche. Isso não é o mesmo que a cota
// fechar. O que a IA devolve é uma proposta; quem confere é o código.
// -------------------------------------------------------------

export type Pauta = {
  dia: number
  linha: string
  plataforma?: string
  formato?: string
  objetivo?: string
  pilar?: string
  tema?: string
  titulo: string
  conceito?: string
  descricao?: string
  cta?: string
  justificativa?: string
}

export type Planejamento = {
  leitura?: string
  territorios?: { nome: string; peso: number; cobre?: string; posts?: number; novo?: boolean }[]
  pautas: Pauta[]
  conferencia?: Record<string, number>
  nao_fazer?: string[]
  alertas?: string[]
}

export const PLATAFORMAS = ['instagram', 'linkedin', 'tiktok', 'youtube', 'facebook', 'pinterest']

export type Achado = { gravidade: 'erro' | 'aviso'; texto: string }

export function conferir(p: Planejamento, e: Entrada): Achado[] {
  const achados: Achado[] = []
  const dias = diasNoMes(e.ano, e.mes)

  if (!Array.isArray(p.pautas) || p.pautas.length === 0) {
    achados.push({ gravidade: 'erro', texto: 'A resposta não trouxe pauta nenhuma.' })
    return achados
  }

  // 1. Cota por linha — a restrição que mais escapa.
  const porLinha = new Map<string, number>()
  for (const pauta of p.pautas) {
    const linha = (pauta.linha ?? '').trim()
    porLinha.set(linha, (porLinha.get(linha) ?? 0) + 1)
  }
  for (const linha of e.escopo) {
    const feito = porLinha.get(linha.label) ?? 0
    if (feito !== linha.quota) {
      achados.push({
        gravidade: 'erro',
        texto: `${linha.label}: vieram ${feito} pautas, o contrato pede ${linha.quota}.`,
      })
    }
  }
  const conhecidas = new Set(e.escopo.map((l) => l.label))
  for (const [linha, quantas] of porLinha) {
    if (!conhecidas.has(linha)) {
      achados.push({
        gravidade: 'erro',
        texto: `${quantas} pauta(s) vieram na linha "${linha}", que não existe no escopo contratado.`,
      })
    }
  }

  // 2. Datas dentro do mês.
  for (const pauta of p.pautas) {
    const dia = Number(pauta.dia)
    if (!Number.isInteger(dia) || dia < 1 || dia > dias) {
      achados.push({
        gravidade: 'erro',
        texto: `"${pauta.titulo}" caiu no dia ${pauta.dia}, que não existe em ${MESES[e.mes - 1]}.`,
      })
    }
  }

  // 3. Expressões proibidas — a verificação em código que a base promete.
  const proibidas = (e.base['voice']?.['v_nao'] ?? '')
    .split(/[,;\n]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 2 && !x.startsWith('['))

  if (proibidas.length === 0) {
    achados.push({
      gravidade: 'aviso',
      texto: 'A base não declara expressões proibidas, então não houve o que verificar.',
    })
  } else {
    for (const pauta of p.pautas) {
      const alvo = [pauta.titulo, pauta.tema, pauta.conceito, pauta.descricao, pauta.cta]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const achou = proibidas.filter((x) => alvo.includes(x))
      if (achou.length > 0) {
        achados.push({
          gravidade: 'erro',
          texto: `"${pauta.titulo}" usa expressão proibida: ${achou.join(', ')}.`,
        })
      }
    }
  }

  // 4. Âncora na justificativa.
  for (const pauta of p.pautas) {
    if ((pauta.justificativa ?? '').trim().length < 25) {
      achados.push({
        gravidade: 'aviso',
        texto: `"${pauta.titulo}" veio sem justificativa de verdade.`,
      })
    }
  }

  // 5. Plataforma dentro do que o banco aceita.
  for (const pauta of p.pautas) {
    const plat = (pauta.plataforma ?? 'instagram').toLowerCase()
    if (!PLATAFORMAS.includes(plat)) {
      achados.push({
        gravidade: 'aviso',
        texto: `"${pauta.titulo}" veio na plataforma "${pauta.plataforma}", que o sistema não conhece. Entrou como instagram.`,
      })
    }
  }

  // 6. Peso dos territórios.
  if (Array.isArray(p.territorios) && p.territorios.length > 0) {
    const soma = p.territorios.reduce((a, t) => a + (Number(t.peso) || 0), 0)
    if (Math.abs(soma - 100) > 2) {
      achados.push({
        gravidade: 'aviso',
        texto: `Os pesos dos territórios somam ${soma}, não 100.`,
      })
    }
  }

  return achados
}

// -------------------------------------------------------------
// Refino de uma pauta
//
// A equipe pede uma mudança em linguagem de gente — "menos
// comercial", "troque o produto" — e a IA reescreve só o que foi
// pedido. O resto fica. É a diferença entre refinar e regerar.
// -------------------------------------------------------------

export const COMANDOS = [
  'Gerar outra ideia',
  'Tornar mais criativo',
  'Tornar menos comercial',
  'Tornar mais institucional',
  'Tornar mais educativo',
  'Deixar mais ousado',
  'Abordagem menos óbvia',
  'Trocar o produto',
  'Trocar o formato',
  'Encurtar a descrição',
  'Deixar mais concreto',
  'Evitar repetir o histórico',
]

export type PautaAtual = {
  dia: number | null
  linha: string | null
  formato: string | null
  objetivo: string | null
  pilar: string | null
  tema: string | null
  titulo: string
  conceito: string | null
  descricao: string | null
  cta: string | null
  justificativa: string | null
}

export type Refino = {
  titulo: string
  conceito: string
  descricao: string
  cta: string
  formato: string
  pilar: string
  tema: string
  justificativa: string
  o_que_mudou: string
}

export const SISTEMA_REFINO =
  'Você é o agente de planejamento de conteúdo da Alta Comunicazione. Refina uma pauta ' +
  'que já existe, a pedido da equipe da agência. Escreve em português do Brasil e responde ' +
  'somente com o JSON pedido, sem comentário antes ou depois.'

export function montarPromptRefino(e: {
  marca: Entrada['marca']
  base: Entrada['base']
  estilo?: string
  mes: number
  ano: number
  leitura?: string | null
  territorios?: { nome: string; peso: number }[]
  pauta: PautaAtual
  comando: string
}): string {
  const p = e.pauta
  return `Você refina uma pauta de conteúdo já existente, a pedido da equipe da agência.
Mantenha o que não foi pedido para mudar. Não invente produto, recurso ou dado que não
esteja na base da marca.

${contextoDaMarca(e.marca, e.base)}${e.estilo ? '\n\n' + e.estilo : ''}

# CONTEXTO DO MÊS
${MESES[e.mes - 1]} de ${e.ano}.
${e.leitura ? 'Leitura do mês: ' + e.leitura : ''}
Territórios: ${(e.territorios ?? []).map((t) => `${t.nome} (${t.peso}%)`).join(', ') || 'não informado'}

# PAUTA ATUAL
Dia: ${p.dia ?? 'não informado'}
Linha: ${p.linha ?? 'não informado'}
Formato: ${p.formato ?? 'não informado'}
Objetivo: ${p.objetivo ?? 'não informado'}
Pilar: ${p.pilar ?? 'não informado'}
Tema: ${p.tema ?? 'não informado'}
Título: ${p.titulo}
Conceito: ${p.conceito ?? 'não informado'}
Descrição: ${p.descricao ?? 'não informado'}
CTA: ${p.cta ?? 'não informado'}
Justificativa: ${p.justificativa ?? 'não informado'}

# O QUE A EQUIPE PEDIU
${e.comando}

# REGRAS
Mantenha a linha de produto e o dia, a menos que o pedido diga o contrário.
Respeite as expressões proibidas e os recursos indisponíveis declarados na base.
A justificativa precisa citar uma âncora nomeada da base ou do contexto do mês.
Não use travessão (—) no título, conceito, descrição ou CTA: é marca de texto de IA. Use vírgula, ponto ou dois-pontos.

# SAÍDA
Responda SOMENTE com JSON:
{"titulo":"","conceito":"","descricao":"","cta":"","formato":"","pilar":"","tema":"","justificativa":"","o_que_mudou":"Uma frase dizendo o que você mudou e por quê."}`
}

/** Confere o refino: as mesmas travas duras, aplicadas a uma pauta só. */
export function conferirRefino(
  r: Refino,
  base: Entrada['base'],
): Achado[] {
  const achados: Achado[] = []

  if (!r.titulo || r.titulo.trim().length < 3) {
    achados.push({ gravidade: 'erro', texto: 'A IA devolveu a pauta sem título.' })
  }

  const proibidas = (base['voice']?.['v_nao'] ?? '')
    .split(/[,;\n]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 2 && !x.startsWith('['))

  if (proibidas.length > 0) {
    const alvo = [r.titulo, r.tema, r.conceito, r.descricao, r.cta].filter(Boolean).join(' ').toLowerCase()
    const achou = proibidas.filter((x) => alvo.includes(x))
    if (achou.length > 0) {
      achados.push({
        gravidade: 'erro',
        texto: `O texto novo usa expressão proibida: ${achou.join(', ')}.`,
      })
    }
  }

  if ((r.justificativa ?? '').trim().length < 25) {
    achados.push({ gravidade: 'aviso', texto: 'A justificativa voltou fraca.' })
  }

  return achados
}

// -------------------------------------------------------------
// Criação do conteúdo
//
// A pauta diz o que a peça É. O conteúdo é a peça: a legenda que vai
// no post, as hashtags, o texto alternativo, a direção de arte e o
// prompt da imagem. Para vídeo, mais a decupagem em cenas.
// -------------------------------------------------------------

export const SISTEMA_CONTEUDO =
  'Você é redator e diretor de arte da Alta Comunicazione, agência de publicidade de ' +
  'Ribeirão Preto/SP. Escreve em português do Brasil e responde somente com o JSON pedido, ' +
  'sem comentário antes ou depois.'

/** O formato indica vídeo? A decupagem só faz sentido para audiovisual. */
export function ehVideo(formato: string | null | undefined): boolean {
  return /v[ií]deo|reel|reels|tiktok|shorts|filme|motion|anima/i.test(formato ?? '')
}

export type Conteudo = {
  peca?: { tipo?: string; proporcao?: string; canal?: string }
  legenda?: {
    principal?: string
    cta?: string
    hashtags?: string[]
    alt?: string
    variantes?: { canal?: string; texto?: string }[]
  }
  arte?: { conceito?: string; direcao?: string; prompt?: string }
  cenas?: { t?: string; descricao?: string; fala?: string; chave?: boolean }[]
  mockup?: Record<string, string>
}

export function montarPromptConteudo(e: {
  marca: Entrada['marca']
  base: Entrada['base']
  estilo?: string
  mes: number
  ano: number
  leitura?: string | null
  pauta: PautaAtual
  video: boolean
}): string {
  const p = e.pauta
  const v = e.video

  return `Você é redator e diretor de arte da Alta Comunicazione, agência de publicidade de
Ribeirão Preto/SP. Uma pauta já foi aprovada internamente. Sua tarefa é produzir o
conteúdo dessa peça: a legenda que vai no post e a direção da imagem.

${contextoDaMarca(e.marca, e.base)}${e.estilo ? '\n\n' + e.estilo : ''}

# CONTEXTO DO MÊS
${MESES[e.mes - 1]} de ${e.ano}.${e.leitura ? '\nLeitura do mês: ' + e.leitura : ''}

# A PAUTA
Data: ${p.dia ?? 'não informado'}/${e.mes}/${e.ano}
Linha: ${p.linha ?? 'não informado'}
Formato: ${p.formato ?? 'não informado'}
Objetivo: ${p.objetivo ?? 'não informado'}
Pilar: ${p.pilar ?? 'não informado'}
Tema: ${p.tema ?? 'não informado'}
Título: ${p.titulo}
Conceito: ${p.conceito ?? 'não informado'}
Descrição: ${p.descricao ?? 'não informado'}
CTA sugerido: ${p.cta ?? 'não informado'}

# REGRAS

VOZ: a legenda precisa soar como a marca, não como uma agência falando dela. Quando
houver exemplos reais desta marca acima, eles mandam mais que a descrição de tom de voz:
imite o ritmo, o tamanho das frases e o vocabulário deles. Nenhuma expressão proibida,
nem sinônimo próximo. Se a base declarar restrição legal ou regulatória, obedeça.

RECURSOS: restrição dura. Não descreva imagem que dependa de recurso marcado como
indisponível na base.

LEGENDA: escreva para ler no celular. Primeira linha é o gancho e precisa funcionar
sozinha, porque é o que aparece antes do "mais". Sem emoji, a menos que a base mostre que
a marca usa. Sem frase de efeito genérica de publicidade.

TRAVESSÃO: não use travessão (—) em nenhum campo que você devolver: título, conceito,
descrição, CTA, legenda, leitura do mês, territórios, justificativas e alertas. É uma das marcas mais evidentes de texto escrito por IA.
Use vírgula, ponto, dois-pontos ou parênteses.

HASHTAGS: de seis a dez, misturando marca, categoria e alcance. Só as que fazem sentido
para esta marca e este tema.

PROMPT DE IMAGEM: escreva em inglês, descritivo e concreto: assunto, enquadramento,
lente, luz, paleta, textura, clima. NÃO inclua nome de marca, logotipo, embalagem com
rótulo legível, nem texto na imagem: geradores erram tudo isso, e o texto entra na arte
depois. Diga também o que NÃO deve aparecer.

MOCKUP: é o layout da peça, não a foto. Devolva as cores em hexadecimal de 6 dígitos,
coerentes com a marca, e o texto que vai SOBRE a arte: curto, de leitura imediata. O
título do mockup não é o título da pauta: é a frase que aparece na peça.
${v ? `
DECUPAGEM: esta peça é audiovisual. Quebre em quatro a seis cenas com marcação de tempo.
Marque UMA delas como cena-chave ("chave": true): a que melhor representa o filme num
frame parado. O prompt de imagem deve descrever exatamente essa cena.` : ''}

# SAÍDA

Responda SOMENTE com JSON válido, nesta forma:

{
  "peca": {"tipo": "${v ? 'video' : 'imagem'}", "proporcao": "1:1" ou "4:5" ou "9:16", "canal": ""},
  "legenda": {
    "principal": "A legenda completa, com quebras de linha reais.",
    "cta": "A chamada final, uma linha.",
    "hashtags": ["#exemplo"],
    "alt": "Descrição objetiva da imagem para leitor de tela.",
    "variantes": [{"canal": "LinkedIn", "texto": ""}]
  },
  "arte": {
    "conceito": "A ideia visual em uma frase.",
    "direcao": "Enquadramento, luz, paleta, styling e o que não pode aparecer.",
    "prompt": "Prompt em inglês, pronto para colar no gerador."
  },${v ? `
  "cenas": [{"t": "0-3s", "descricao": "", "fala": "", "chave": false}],` : ''}
  "mockup": {
    "fundo": "foto" ou "cor" ou "gradiente",
    "foto_descricao": "O que a foto mostra, uma frase curta.",
    "cor1": "#RRGGBB",
    "cor2": "#RRGGBB",
    "cor_texto": "#RRGGBB",
    "ancora": "topo" ou "centro" ou "rodape",
    "kicker": "Rótulo curto em caixa alta, até 4 palavras.",
    "titulo": "A frase que aparece grande na peça, até 8 palavras.",
    "apoio": "Uma linha de apoio, opcional.",
    "selo": "Selo curto, opcional."
  }
}

Em "variantes" inclua apenas canais que a base declara que a marca opera, e só se o texto
precisar mudar de verdade. Se não houver, devolva lista vazia.`
}

/**
 * Confere o conteúdo antes de gravar.
 *
 * O mesmo princípio da geração: o prompt PEDE, o código VERIFICA. Aqui
 * a verificação mais importante é a das expressões proibidas — porque
 * a legenda é o texto que vai publicado, com o nome do cliente.
 */
export function conferirConteudo(c: Conteudo, base: Entrada['base'], video: boolean): Achado[] {
  const achados: Achado[] = []

  const legenda = (c.legenda?.principal ?? '').trim()
  if (legenda.length < 40) {
    achados.push({ gravidade: 'erro', texto: 'A legenda voltou vazia ou curta demais.' })
  }

  const proibidas = (base['voice']?.['v_nao'] ?? '')
    .split(/[,;\n]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 2 && !x.startsWith('['))

  if (proibidas.length === 0) {
    achados.push({
      gravidade: 'aviso',
      texto: 'A base não declara expressões proibidas, então não houve o que verificar na legenda.',
    })
  } else {
    const alvo = [legenda, c.legenda?.cta, c.legenda?.alt, (c.legenda?.hashtags ?? []).join(' ')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    const achou = proibidas.filter((x) => alvo.includes(x))
    if (achou.length > 0) {
      achados.push({
        gravidade: 'erro',
        texto: `A legenda usa expressão proibida: ${achou.join(', ')}.`,
      })
    }
  }

  const hashtags = c.legenda?.hashtags ?? []
  if (hashtags.length < 4) {
    achados.push({ gravidade: 'aviso', texto: `Vieram só ${hashtags.length} hashtags.` })
  }

  if (!(c.arte?.prompt ?? '').trim()) {
    achados.push({ gravidade: 'aviso', texto: 'A direção de arte voltou sem prompt de imagem.' })
  }

  // O texto alternativo continua sendo pedido e gravado — serve para
  // acessibilidade no dia em que a publicação for automática — mas
  // saiu da tela, então avisar sobre ele só geraria ruído.

  if (video) {
    const cenas = c.cenas ?? []
    if (cenas.length < 3) {
      achados.push({ gravidade: 'aviso', texto: 'A decupagem voltou com menos de três cenas.' })
    } else if (!cenas.some((x) => x.chave)) {
      achados.push({
        gravidade: 'aviso',
        texto: 'Nenhuma cena foi marcada como cena-chave.',
      })
    }
  }

  const proporcao = c.peca?.proporcao ?? ''
  if (proporcao && !['1:1', '4:5', '9:16', '16:9'].includes(proporcao)) {
    achados.push({
      gravidade: 'aviso',
      texto: `Proporção "${proporcao}" não é uma das que o sistema guarda. Entrou como 4:5.`,
    })
  }

  return achados
}

// =============================================================
// O CRÍTICO
//
// A conferência que já existe (`conferir`) é de regra: cota por linha,
// dia dentro do mês, tema repetido, expressão proibida. Ela pega o que
// é conferível em código — e não pega o problema mais comum de todos,
// que é a pauta correta e genérica. "Mostre o produto no café da
// manhã" passa em todas as regras e podia ser de qualquer marca de
// alimentos do Brasil.
//
// Isso não se confere com regex. Precisa de leitura. Então é um segundo
// passe de IA, que lê o mês inteiro contra a base da marca e responde
// uma pergunta por pauta: esta peça só funciona para ESTA marca, ou
// funcionaria para qualquer concorrente dela?
//
// O crítico não reescreve nada. Diz o que está fraco e o que fazer —
// reescrever é trabalho do refino, a pedido de gente.
// =============================================================

export const SISTEMA_CRITICA =
  'Você é o revisor crítico da Alta Comunicazione, agência de publicidade de Ribeirão ' +
  'Preto/SP. Você avalia o planejamento de conteúdo que outro agente escreveu, contra a ' +
  'base de conhecimento da marca. Você é específico e direto: cita o texto ao criticar e ' +
  'nunca elogia por educação. Escreve em português do Brasil, sem usar travessão (—): ' +
  'use vírgula, ponto ou dois-pontos no lugar. Responde somente com o ' +
  'JSON pedido, sem comentário antes ou depois.'

export type ItemCritica = {
  id: string
  nota: number
  veredito: 'boa' | 'revisar' | 'fraca'
  porque: string
  arrume: string
}

export type Critica = {
  veredito_do_mes: string
  pautas: ItemCritica[]
}

export type PautaParaCritica = {
  id: string
  dia: number | null
  linha: string | null
  formato: string | null
  pilar: string | null
  tema: string | null
  titulo: string
  conceito: string | null
  descricao: string | null
  cta: string | null
}

export function montarPromptCritica(e: {
  marca: Entrada['marca']
  base: Entrada['base']
  estilo?: string
  concorrencia?: string
  mes: number
  ano: number
  leitura?: string | null
  territorios?: { nome: string; peso: number }[]
  escopo: Linha[]
  pautas: PautaParaCritica[]
}): string {
  const lista = e.pautas
    .map(
      (p) =>
        `--- id: ${p.id}\n` +
        `Dia ${p.dia ?? 'não informado'} · ${p.linha ?? 'sem linha'} · ${p.formato ?? 'sem formato'}\n` +
        `Pilar: ${p.pilar ?? 'não informado'} · Tema: ${p.tema ?? 'não informado'}\n` +
        `Título: ${p.titulo}\n` +
        `Conceito: ${p.conceito ?? 'não informado'}\n` +
        `Descrição: ${p.descricao ?? 'não informado'}\n` +
        `CTA: ${p.cta ?? 'não informado'}`,
    )
    .join('\n\n')

  return `Avalie o planejamento de ${MESES[e.mes - 1]} de ${e.ano} da marca abaixo, pauta por pauta.

${contextoDaMarca(e.marca, e.base)}${e.estilo ? '\n\n' + e.estilo : ''}${e.concorrencia ? '\n\n' + e.concorrencia : ''}

# ESCOPO CONTRATADO
${e.escopo.map((l) => `${l.label}: ${l.quota} peça(s)/mês`).join('\n')}

# LEITURA DO MÊS, FEITA POR QUEM PLANEJOU
${e.leitura ?? 'não informado'}
Territórios: ${(e.territorios ?? []).map((t) => `${t.nome} (${t.peso}%)`).join(', ') || 'não informado'}

# AS PAUTAS
${lista}

# COMO AVALIAR

A pergunta central, em cada pauta: isto só funciona para ESTA marca, ou funcionaria
igual para qualquer concorrente dela? Pauta que serve para qualquer um é pauta fraca,
mesmo escrita sem erro.

Dê nota FRACA (0 a 4) quando:
- a pauta poderia ser de qualquer marca do mesmo segmento, sem trocar uma palavra;
- o conceito é uma categoria, não uma ideia ("falar sobre qualidade", "mostrar o produto");
- promete recurso que a base declara indisponível, ou contraria uma obrigatoriedade;
- repete, com outras palavras, uma pauta do mesmo mês.

Dê REVISAR (5 a 7) quando a ideia existe mas está morna: o título não segura, o conceito
depende de uma execução que a descrição não explica, ou o CTA é genérico.

Dê BOA (8 a 10) quando a pauta se apoia em algo que só esta marca tem (um produto, uma
história, um jeito de falar) e a descrição explica o que aparece na peça.

Ao criticar, CITE o trecho. "O título é genérico" não ajuda ninguém; "o título 'Sabor que
conquista' serve para qualquer geleia do mercado" ajuda.

Não reescreva a pauta. Diga o que está errado e o que fazer.
"porque": no máximo duas frases. "arrume": uma frase, no imperativo.

Use os ids exatamente como vieram, sem inventar nem omitir nenhum.

Responda SOMENTE com JSON válido, nesta forma:

{
  "veredito_do_mes": "O que este mês tem de bom e o que tem de frouxo, em até 80 palavras.",
  "pautas": [
    {"id": "", "nota": 0, "veredito": "boa|revisar|fraca", "porque": "", "arrume": ""}
  ]
}`
}

/**
 * Confere a crítica antes de gravar.
 *
 * O crítico é IA avaliando IA; se ele inventar id, trocar nota por
 * texto ou esquecer metade das pautas, a tela mostra sinal errado — e
 * sinal errado é pior que sinal nenhum, porque a equipe passa a
 * confiar nele.
 */
export function conferirCritica(
  c: Critica,
  idsEsperados: string[],
): { achados: Achado[]; itens: ItemCritica[] } {
  const achados: Achado[] = []
  const validos = new Set(idsEsperados)
  const vistos = new Set<string>()
  const itens: ItemCritica[] = []

  for (const p of c.pautas ?? []) {
    const id = String(p.id ?? '')
    if (!validos.has(id)) {
      achados.push({ gravidade: 'aviso', texto: `A crítica citou um id que não existe: ${id}.` })
      continue
    }
    if (vistos.has(id)) continue
    vistos.add(id)

    const nota = Number(p.nota)
    const notaOk = Number.isFinite(nota) && nota >= 0 && nota <= 10
    const veredito =
      p.veredito === 'boa' || p.veredito === 'revisar' || p.veredito === 'fraca'
        ? p.veredito
        : notaOk
          ? nota >= 8
            ? 'boa'
            : nota >= 5
              ? 'revisar'
              : 'fraca'
          : 'revisar'

    itens.push({
      id,
      nota: notaOk ? Math.round(nota) : 5,
      veredito,
      porque: String(p.porque ?? '').trim(),
      arrume: String(p.arrume ?? '').trim(),
    })
  }

  const faltando = idsEsperados.filter((id) => !vistos.has(id))
  if (faltando.length > 0) {
    achados.push({
      gravidade: 'aviso',
      texto: `${faltando.length} pauta(s) ficaram sem avaliação.`,
    })
  }

  return { achados, itens }
}
