/**
 * O que a agência REALMENTE produziu para uma marca.
 *
 * Este arquivo não fala com o Operand nem com o banco. Ele recebe os
 * jobs já copiados e devolve um retrato: quais formatos aparecem, com
 * que frequência, quanto trabalho cada tipo custa, quais temas voltam,
 * quais influenciadores são recorrentes.
 *
 * PARA QUE ISSO EXISTE
 *
 * Hoje a IA planeja a partir do que foi escrito sobre a marca. Isso é
 * uma descrição de intenção. O Operand guarda outra coisa: o que
 * aconteceu. As duas quase nunca são iguais, e a diferença é onde mora
 * o erro caro. Sugerir três vídeos por semana para uma marca que
 * produziu quatro vídeos no ano inteiro não é ambição, é uma proposta
 * que a equipe não consegue entregar e que o cliente vai cobrar.
 *
 * COMO O TÍTULO É LIDO
 *
 * A equipe escreve assim há anos, e o padrão é estável o bastante para
 * ler por palavra-chave: "Queens | VÍDEO | Decoração para ambientes –
 * 23/01". Linha, formato, assunto, data. Não é um formato garantido,
 * então tudo aqui é tolerante: título que não encaixa em nada vira
 * "outros" em vez de virar erro, e "outros" grande é sinal de que as
 * regras precisam de revisão, não de que o dado está ruim.
 *
 * O QUE NÃO ESTÁ AQUI, E POR QUÊ
 *
 * Nada de adivinhar qualidade ou resultado. O Operand sabe quanto
 * tempo custou e o que foi feito; não sabe se funcionou. Misturar as
 * duas coisas daria ao planejamento uma confiança que o dado não
 * sustenta.
 */

/**
 * Tira do título o que não é assunto: a linha na frente, a data no
 * fim, o asterisco que a equipe usa para marcar alguma coisa.
 */
export function limparTitulo(titulo) {
  let t = String(titulo ?? '').trim()
  const corte = t.indexOf('|')
  if (corte > 0) t = t.slice(corte + 1)
  return t
    .replace(/[–—-]\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*\*?\s*$/u, '')
    // "– Sem data" é anotação de processo, não assunto. Sem tirar, a
    // palavra "data" virava um dos temas mais frequentes da marca.
    .replace(/[–—-]?\s*sem\s+data\s*\*?\s*$/iu, '')
    .replace(/\*+\s*$/u, '')
    .replace(/\s{2,}/gu, ' ')
    .trim()
}

/**
 * A data como texto "2026-04-10", venha ela de onde vier.
 *
 * O banco devolve coluna `date` como objeto Date do JavaScript, e
 * `String(umDate)` vira "Fri Apr 10 2026...". Cortar os dez primeiros
 * caracteres disso dá "Fri Apr 10", que ordena por dia da semana e
 * agrupa por mês errado. Foi exatamente o que aconteceu no primeiro
 * retrato da Queensberry: o período saiu como "entre Fri Apr 10 e Wed
 * Sep 30" e a média mensal saiu por cinco quando era trinta e três.
 *
 * O erro é pequeno de escrever e grande de consequência, porque o
 * resultado continua parecendo um número. Por isso a conversão é uma
 * função só, com teste, e não um slice espalhado pelo arquivo.
 */
export function comoData(v) {
  if (!v) return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    const dd = (n) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${dd(v.getMonth() + 1)}-${dd(v.getDate())}`
  }
  const t = String(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

/** Sem acento e sem caixa, para as buscas por palavra. */
export function achatar(t) {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
}

/**
 * Os formatos, em ordem de especificidade.
 *
 * A ordem importa: "Carrossel de Fotos" tem as duas palavras, e é um
 * carrossel. Quem vem primeiro ganha.
 */
export const FORMATOS = [
  { chave: 'carrossel', rotulo: 'carrossel', teste: /carrossel/ },
  { chave: 'video', rotulo: 'vídeo', teste: /\bvideo\b|\breels?\b|\bteaser\b|animacao|stop ?motion|\btrend\b/ },
  { chave: 'story', rotulo: 'story e destaque', teste: /\bstor(y|ies)\b|destaque/ },
  { chave: 'email', rotulo: 'e-mail marketing', teste: /e-?mail/ },
  { chave: 'influenciador', rotulo: 'influenciador', teste: /\binflu|\bcol+ab\b|parceria/ },
  { chave: 'foto', rotulo: 'foto', teste: /\bfotos?\b|\bensaio\b|\bimagens?\b|\bclique\b/ },
  {
    chave: 'materialdeponto',
    rotulo: 'material de ponto de venda',
    // MPDV e como a casa escreve "material de ponto de venda". Sem
    // essa sigla, vinte e seis pecas caiam em "outros".
    teste: /wobbler|moldura|\bframe\b|tampa|embalagem|rotulo|\bbanner\b|\bkv\b|flyer|cartaz|adesivo|\bdisplay\b|\bm?pdv\b/,
  },
  { chave: 'campanha', rotulo: 'ação e campanha', teste: /acao promocional|campanha|\bpromo/ },
  { chave: 'post', rotulo: 'post de feed', teste: /\bpost\b|publicacao|\bfeed\b|\bcapa/ },
]

/** O que é trabalho de bastidor e não peça de conteúdo. */
const ADMINISTRATIVO =
  /relatorio|timesheet|nota fiscal|calculos de verba|orcamento|\bboleto\b|contrato|reuniao|simulacoes|faturamento/
const PLANEJAMENTO = /planejamento|\bpauta\b|estrategia|posicionamento|\bplano\b|briefing|cronograma/

const CANAIS = [
  { chave: 'instagram', rotulo: 'Instagram', teste: /instagram|\big\b|\breels?\b|\bstor(y|ies)\b/ },
  { chave: 'tiktok', rotulo: 'TikTok', teste: /tiktok|tik tok/ },
  { chave: 'facebook', rotulo: 'Facebook', teste: /facebook|\bfb\b/ },
  { chave: 'youtube', rotulo: 'YouTube', teste: /youtube|\byt\b/ },
  { chave: 'email', rotulo: 'e-mail', teste: /e-?mail/ },
  { chave: 'midiapaga', rotulo: 'mídia paga', teste: /\bads\b|impulsiona|\bmeta\b|google/ },
]

/**
 * Classifica um job pelo título.
 *
 * Devolve sempre alguma coisa. Um job que não encaixa em formato
 * nenhum vira 'outros', porque um retrato com uma fatia honesta de
 * "não sei" vale mais do que um retrato onde tudo foi forçado a caber.
 */
export function classificar(titulo) {
  const limpo = limparTitulo(titulo)
  const t = achatar(limpo)

  const natureza = ADMINISTRATIVO.test(t)
    ? 'administrativo'
    : PLANEJAMENTO.test(t)
      ? 'planejamento'
      : 'conteudo'

  let formato = 'outros'
  if (natureza === 'conteudo') {
    for (const f of FORMATOS) {
      if (f.teste.test(t)) {
        formato = f.chave
        break
      }
    }
  }

  const canais = CANAIS.filter((c) => c.teste.test(t)).map((c) => c.chave)
  return { formato, natureza, canais, limpo }
}

/** O rótulo em português de um formato. */
export function rotuloDoFormato(chave) {
  return FORMATOS.find((f) => f.chave === chave)?.rotulo ?? 'outros'
}

/** O rótulo de um canal. */
export function rotuloDoCanal(chave) {
  return CANAIS.find((c) => c.chave === chave)?.rotulo ?? chave
}

/**
 * O nome do influenciador, quando o título traz um.
 *
 * "Queens | Conteúdo influ Gean Uai | Lombo Suíno" devolve "Gean Uai".
 * Nome próprio depois de "influ" é o padrão da casa, e essa lista é
 * das coisas mais úteis que saem daqui: quem já trabalhou com a marca
 * é informação que nenhum documento de briefing costuma ter.
 */
export function influenciadorDoTitulo(titulo) {
  const t = String(titulo ?? '')
  const m = /\binflu(?:enciador[ae]?)?\s+([^|–—\-\d]{2,40})/iu.exec(t)
  if (!m) return null
  const nome = m[1].replace(/\s{2,}/gu, ' ').trim()
  if (!nome || nome.length < 3) return null
  // Uma palavra genérica depois de "influ" não é nome de ninguém.
  if (/^(de|do|da|para|com|no|na|em)\b/iu.test(nome)) return null
  return nome
}

/**
 * Coisas que aparecem depois de "influ" e não são gente.
 *
 * "Conteúdo influ Carnaval" é o tema da ação, não o nome de ninguém.
 * A lista é curta de propósito: filtrar demais apagaria nome próprio
 * incomum, e um nome a mais na lista custa pouco, um nome a menos
 * custa uma informação que ninguém mais tem.
 */
const NAO_SAO_NOMES = new Set([
  'carnaval', 'natal', 'pascoa', 'festas', 'fim de ano', 'dia das maes',
  'dia dos pais', 'black friday', 'verao', 'inverno', 'receita', 'receitas',
])

/**
 * Junta os nomes que são a mesma pessoa escrita de dois jeitos.
 *
 * O cadastro tem "Tato" e "Tato Drink", "Vivian" e "Vivian Carvalho",
 * "Nathassia" e "Nathassia Pécorra". Contar separado diria que são
 * seis influenciadores quando são três, e a lista serve justamente
 * para alguém olhar e reconhecer quem já trabalhou com a marca.
 *
 * Fica a escrita mais completa, porque é a que identifica a pessoa.
 */
export function juntarInfluenciadores(contagem) {
  const nomes = [...contagem.keys()].sort((a, b) => b.length - a.length)
  const destino = new Map()
  for (const nome of nomes) {
    const curto = achatar(nome)
    const maior = [...destino.keys()].find((m) => {
      const c = achatar(m)
      return c === curto || c.startsWith(curto + ' ')
    })
    const alvo = maior ?? nome
    destino.set(alvo, (destino.get(alvo) ?? 0) + (contagem.get(nome) ?? 0))
  }
  return destino
}

/** Palavras que não dizem nada sobre o assunto. */
const VAZIAS = new Set(
  ('de da do das dos e ou a o as os um uma no na nos nas para por com sem em ao aos que se sobre ' +
    'novo nova novos novas mais menos ate apos antes sem dia mes ano semana ' +
    'conteudo post posts foto fotos video videos reels story stories carrossel email mkt ' +
    'influ influenciador influenciadora arte peca pecas material ' +
    'layout capa capas destaque destaques mpdv pdv wobbler moldura frame banner ' +
    'planejamento relatorio timesheet pauta briefing collab colab trend data mail')
    .split(' ')
    .filter(Boolean),
)

/**
 * Os assuntos que voltam.
 *
 * Conta palavras dos títulos limpos, tirando as vazias e as que só
 * dizem o formato. Não é análise semântica, é contagem: o que a marca
 * repete aparece, e o que apareceu uma vez some. Serve para a IA saber
 * que "geleia", "receita" e "40 anos" são o vocabulário desta conta.
 */
export function temasRecorrentes(titulos, { minimo = 3, teto = 20 } = {}) {
  const conta = new Map()
  for (const titulo of titulos) {
    const limpo = limparTitulo(titulo)
    const palavras = achatar(limpo)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/u)
      .filter((p) => p.length >= 3 && !VAZIAS.has(p) && !/^\d+$/.test(p))
    // Uma vez por job: título que repete a palavra três vezes não vale
    // por três marcas.
    for (const p of new Set(palavras)) conta.set(p, (conta.get(p) ?? 0) + 1)
  }
  return [...conta.entries()]
    .filter(([, n]) => n >= minimo)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, teto)
    .map(([termo, jobs]) => ({ termo, jobs }))
}

/** A mediana, que é a medida certa para tempo de trabalho. */
export function mediana(numeros) {
  const n = numeros.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (n.length === 0) return null
  const meio = Math.floor(n.length / 2)
  return n.length % 2 ? n[meio] : Math.round((n[meio - 1] + n[meio]) / 2)
}

/**
 * O retrato completo.
 *
 * Recebe os jobs como estão na cópia (titulo, tempo_trabalhado, prazo,
 * criado_em, situacao) e devolve o objeto que vai para o banco.
 */
export function montarPerfil(jobs) {
  const limpos = jobs.map((j) => ({
    titulo: String(j.titulo ?? ''),
    minutos: Number(j.tempo_trabalhado ?? j.tempoTrabalhado ?? 0) || 0,
    quando: comoData(j.prazo) ?? comoData(j.criado_em) ?? comoData(j.criadoEm),
    ...classificar(j.titulo),
  }))

  const datas = limpos.map((j) => j.quando).filter(Boolean).sort()
  const soma = (lista) => lista.reduce((t, j) => t + j.minutos, 0)

  const porNatureza = {}
  for (const nat of ['conteudo', 'planejamento', 'administrativo']) {
    const q = limpos.filter((j) => j.natureza === nat)
    porNatureza[nat] = { jobs: q.length, minutos: soma(q) }
  }

  const conteudo = limpos.filter((j) => j.natureza === 'conteudo')
  const formatos = [...new Set(conteudo.map((j) => j.formato))]
    .map((chave) => {
      const q = conteudo.filter((j) => j.formato === chave)
      return {
        chave,
        rotulo: rotuloDoFormato(chave),
        jobs: q.length,
        minutos: soma(q),
        // A mediana ignora os jobs sem apontamento: zero hora quase
        // sempre quer dizer "ninguém apontou", não "não deu trabalho",
        // e deixar esses zeros dentro puxaria o custo típico para baixo.
        medianaMinutos: mediana(q.map((j) => j.minutos).filter((m) => m > 0)),
      }
    })
    .sort((a, b) => b.jobs - a.jobs)

  const porMes = new Map()
  for (const j of limpos) {
    if (!j.quando) continue
    const mes = j.quando.slice(0, 7)
    const m = porMes.get(mes) ?? { mes, jobs: 0, minutos: 0 }
    m.jobs++
    m.minutos += j.minutos
    porMes.set(mes, m)
  }

  const canais = new Map()
  for (const j of conteudo) {
    for (const c of j.canais) canais.set(c, (canais.get(c) ?? 0) + 1)
  }

  const influBruto = new Map()
  for (const j of limpos) {
    const nome = influenciadorDoTitulo(j.titulo)
    if (nome && !NAO_SAO_NOMES.has(achatar(nome))) {
      influBruto.set(nome, (influBruto.get(nome) ?? 0) + 1)
    }
  }
  const influ = juntarInfluenciadores(influBruto)

  const porMesOrdenado = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes))
  const hojeTexto = comoData(new Date())
  const aindaPorVir = limpos.filter((j) => j.quando && hojeTexto && j.quando > hojeTexto).length

  return {
    de: datas[0] ?? null,
    ate: datas[datas.length - 1] ?? null,
    jobs: limpos.length,
    minutos: soma(limpos),
    natureza: porNatureza,
    formatos,
    porMes: porMesOrdenado,
    canais: [...canais.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([chave, jobs]) => ({ chave, rotulo: rotuloDoCanal(chave), jobs })),
    influenciadores: [...influ.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
      .map(([nome, jobs]) => ({ nome, jobs })),
    // Só das peças: "relatório", "timesheet" e "planejamento" são
    // nomes de processo interno, não assunto da marca, e entupiam a
    // lista com palavras que não ensinam nada sobre o que ela fala.
    temas: temasRecorrentes(conteudo.map((j) => j.titulo)),
    tipico: volumeTipico(porMesOrdenado),
    aindaPorVir,
  }
}

/**
 * Quantos trabalhos por mês esta conta costuma dar.
 *
 * Média é a resposta errada aqui. O período coberto vai de 2025 a
 * 2027, porque job aberto hoje pode ter prazo daqui a um ano, e
 * dividir o total pelo número de meses do intervalo diluiu 33 por mês
 * em 20. Quem lê "20 por mês" e dimensiona equipe com isso erra por um
 * terço.
 *
 * A mediana dos meses já vividos responde o que interessa: num mês
 * comum, quanto entra. Meses ainda no futuro ficam de fora, porque
 * eles não estão baixos, estão incompletos.
 */
export function volumeTipico(porMes, hoje = new Date()) {
  const mesAtual = comoData(hoje)?.slice(0, 7) ?? ''
  const vividos = porMes.filter((m) => m.mes < mesAtual)
  if (vividos.length === 0) return null
  // Os doze últimos, que é o que descreve a conta hoje e não como ela
  // era há três anos.
  const ultimos = vividos.slice(-12)
  return {
    meses: ultimos.length,
    de: ultimos[0].mes,
    ate: ultimos[ultimos.length - 1].mes,
    jobsPorMes: mediana(ultimos.map((m) => m.jobs)),
    minutosPorMes: mediana(ultimos.map((m) => m.minutos)),
  }
}

/** Minutos em linguagem de gente. */
function horas(minutos) {
  const m = Math.round(Number(minutos) || 0)
  if (m <= 0) return '0h'
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}min`
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`
}

/**
 * O perfil escrito em português, que é o que vai para dentro do prompt.
 *
 * Texto, e não JSON, de propósito: é assim que a IA lê melhor, e é
 * assim que uma pessoa consegue conferir se o retrato bate com a
 * realidade da conta antes de deixar isso influenciar planejamento.
 *
 * Cada frase aqui diz de onde veio o número. Um parágrafo que afirma
 * "esta marca faz muito vídeo" sem dizer quantos em quanto tempo é
 * exatamente o tipo de resumo que faz a IA inventar com confiança.
 */
export function perfilEmTexto(p, { nomeDaMarca = 'a marca' } = {}) {
  if (!p || !p.jobs) return ''
  const linhas = []

  linhas.push(
    `A agência registrou ${p.jobs} trabalhos para ${nomeDaMarca}, com datas entre ` +
      `${p.de ?? 'início desconhecido'} e ${p.ate ?? 'hoje'}, somando ${horas(p.minutos)} ` +
      `apontadas.` +
      (p.aindaPorVir > 0 ? ` Desses, ${p.aindaPorVir} têm prazo ainda por vir.` : ''),
  )

  if (p.tipico && p.tipico.jobsPorMes) {
    linhas.push(
      `Num mês comum esta conta rende ${p.tipico.jobsPorMes} trabalhos e ` +
        `${horas(p.tipico.minutosPorMes)} de trabalho apontado. ` +
        `É a mediana dos ${p.tipico.meses} meses entre ${p.tipico.de} e ${p.tipico.ate}, ` +
        `e é essa a medida de capacidade: a média do período inteiro engana, porque ` +
        `job aberto hoje pode ter prazo daqui a um ano.`,
    )
  }

  const c = p.natureza.conteudo
  const pl = p.natureza.planejamento
  const ad = p.natureza.administrativo
  linhas.push(
    `Desses, ${c.jobs} são peças de conteúdo (${horas(c.minutos)}), ` +
      `${pl.jobs} são planejamento (${horas(pl.minutos)}) e ` +
      `${ad.jobs} são administrativo, como relatório e nota fiscal (${horas(ad.minutos)}).`,
  )

  if (p.formatos.length) {
    const partes = p.formatos.map(
      (f) =>
        `${f.rotulo}: ${f.jobs}` +
        (f.medianaMinutos ? ` (tipicamente ${horas(f.medianaMinutos)} cada)` : ''),
    )
    linhas.push(`Formatos produzidos, do mais frequente ao menos: ${partes.join('; ')}.`)
  }

  if (p.canais.length) {
    linhas.push(
      `Canais citados nos trabalhos: ` +
        p.canais.map((x) => `${x.rotulo} (${x.jobs})`).join(', ') +
        '.',
    )
  }

  if (p.influenciadores.length) {
    linhas.push(
      `Influenciadores que já trabalharam com a marca: ` +
        p.influenciadores.map((i) => `${i.nome}${i.jobs > 1 ? ` (${i.jobs}x)` : ''}`).join(', ') +
        '.',
    )
  }

  if (p.temas.length) {
    linhas.push(
      `Assuntos que mais se repetem nos títulos: ` +
        p.temas.map((t) => `${t.termo} (${t.jobs})`).join(', ') +
        '.',
    )
  }

  linhas.push(
    'Este retrato é do que foi produzido, não do que deu certo: o sistema de produção ' +
      'registra esforço e entrega, não resultado. Use como medida de capacidade e de ' +
      'vocabulário da conta, não como prova de que um formato funciona.',
  )

  return linhas.join('\n\n')
}
