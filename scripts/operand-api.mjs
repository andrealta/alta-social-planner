/**
 * O Operand, lido de fora.
 *
 * Este arquivo mora em `scripts/` e não em `src/` de propósito: no
 * desenho de leitura, o SITE nunca fala com o Operand. Quem fala é a
 * rotina de sincronização, que roda fora do site, com conexão direta
 * ao banco. O site só lê a cópia local. Um segredo a menos viajando
 * para a Vercel, e uma dependência a menos entre o mês do cliente e um
 * sistema de terceiro estar no ar.
 *
 * O planner sabe o que foi planejado e aprovado; o Operand sabe o que
 * está sendo produzido. Este arquivo é a ponte, e ela é de mão única:
 * daqui só saem perguntas. Criar job automaticamente quando o cliente
 * aprova é a metade seguinte, e só faz sentido depois desta rodar sem
 * susto por umas semanas.
 *
 * COMO A AUTENTICAÇÃO FUNCIONA
 *
 * São dois tokens, e confundi-los é o erro mais fácil de cometer. O
 * PRIMEIRO é gerado dentro do Operand, em Módulos e Funções, seção API
 * Operand: é o segredo, mora no .env.local e nunca aparece em log. Ele
 * não serve para chamar nada: serve para pedir o SEGUNDO, em /login,
 * que é o que vai no cabeçalho `Op-Auth-Token` de cada requisição.
 *
 * A documentação não diz quanto o segundo dura. Enquanto não souber, o
 * código trata isso como desconhecido: guarda o token em memória, e se
 * uma chamada voltar 401 ou 403, entra de novo uma vez e repete. É
 * mais barato que renovar a cada chamada e mais honesto que supor uma
 * validade que ninguém me disse.
 *
 * POR QUE `busca` É UM PARÂMETRO
 *
 * Toda função recebe a função de rede em vez de chamar `fetch` direto.
 * É o que torna este arquivo testável sem internet e sem conta no
 * Operand: o teste passa uma função que devolve o que ele quiser,
 * inclusive respostas malformadas, que é justamente o caso que quebra
 * cliente de API na primeira semana.
 *
 * O QUE A API NÃO TEM
 *
 * Não há apontamento de horas em lugar nenhum da documentação, então
 * não dá para medir esforço real por peça. E não há webhook: nada
 * avisa quando algo muda. Por isso a leitura é por consulta, e a tela
 * mostra a hora em que perguntou em vez de fingir que é agora.
 */

export const OPERAND_BASE = 'https://api.operand.app'

/** A função de rede. `fetch` na vida real, outra coisa no teste. */
export class ErroOperand extends Error {
  constructor(status, mensagem, caminho) {
    super(mensagem)
    this.name = 'ErroOperand'
    this.status = status
    this.caminho = caminho
  }
}

/**
 * O motivo de verdade de uma falha de conexão.
 *
 * O `fetch` do Node devolve sempre a mesma frase, "fetch failed", e
 * esconde o motivo real dentro de `cause`, às vezes com mais de um
 * nível. Sem abrir essa cadeia, DNS errado, firewall bloqueando e
 * certificado recusado viram todos a mesma mensagem inútil.
 */
export function causaDeRede(e) {
  let atual = e
  const vistos = new Set()
  while (atual && typeof atual === 'object' && !vistos.has(atual)) {
    vistos.add(atual)
    const codigo = atual.code ?? atual.errno
    if (codigo) {
      return {
        codigo: String(codigo),
        mensagem: atual.message ? String(atual.message) : '',
        host: atual.hostname ?? atual.host ?? null,
        porta: atual.port ?? null,
      }
    }
    atual = atual.cause
  }
  return null
}

/**
 * Traduz o código para uma frase que diz o que fazer.
 *
 * Fica aqui, e não na tela, porque o mesmo código aparece no
 * `conferir`, no `sincronizar` e no diagnóstico de rede, e três
 * explicações diferentes para a mesma falha confundem mais do que
 * ajudam.
 */
export function explicarRede(codigo) {
  const c = String(codigo || '').toUpperCase()
  if (c === 'ENOTFOUND' || c === 'EAI_AGAIN') {
    return 'Esse endereço não existe no DNS daqui. Ou o endereço da API está errado, ou a rede não deixa resolver nomes de fora.'
  }
  if (c === 'ECONNREFUSED') {
    return 'O endereço existe, mas ninguém atendeu na porta. Costuma ser endereço certo e porta errada.'
  }
  if (c === 'ETIMEDOUT' || c === 'UND_ERR_CONNECT_TIMEOUT' || c === 'UND_ERR_HEADERS_TIMEOUT') {
    return 'A conexão ficou pendurada até estourar o tempo. Quase sempre é firewall ou antivírus segurando a saída.'
  }
  if (c === 'ECONNRESET' || c === 'EPIPE') {
    return 'Alguém cortou a conexão no meio. Em rede de empresa costuma ser o antivírus ou o proxy inspecionando o tráfego.'
  }
  if (
    c === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    c === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    c === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    c === 'CERT_HAS_EXPIRED' ||
    c === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    c === 'EPROTO'
  ) {
    return 'O certificado do site não foi aceito. Isso acontece quando um antivírus ou firewall abre o tráfego seguro no meio do caminho.'
  }
  if (c === 'ERR_INVALID_URL') {
    return 'O endereço configurado não é uma URL válida.'
  }
  return 'Não foi o Operand que recusou: a conexão nem chegou lá.'
}

/**
 * Chama a rede e transforma falha de conexão em erro legível.
 *
 * Toda saída para fora passa por aqui de propósito: é o único lugar
 * onde "fetch failed" vira uma frase que diz o que houve.
 */
async function tentarRede(busca, url, opcoes, caminho) {
  try {
    return await busca(url, opcoes)
  } catch (e) {
    if (e instanceof ErroOperand) throw e
    const causa = causaDeRede(e)
    const erro = new ErroOperand(
      0,
      causa
        ? `Não deu para chegar no Operand (${causa.codigo}). ${explicarRede(causa.codigo)}`
        : `Não deu para chegar no Operand: ${e && e.message ? e.message : String(e)}`,
      caminho,
    )
    erro.rede = causa
    throw erro
  }
}

/**
 * Acha a lista de registros dentro da resposta.
 *
 * A documentação mostra pelo menos três formatos diferentes: um array
 * direto, `{records: [...]}` e `{records: {alguma_coisa: [...]}}`. Em
 * vez de escolher um e quebrar quando vier outro, procura o primeiro
 * array que encontrar nesses lugares. Se não achar nenhum, devolve
 * vazio em vez de explodir: página sem resultado é resposta legítima.
 */
export function extrairRegistros(corpo) {
  const soObjetos = (v) =>
    Array.isArray(v) ? v.filter((x) => !!x && typeof x === 'object') : []

  if (Array.isArray(corpo)) return soObjetos(corpo)
  if (!corpo || typeof corpo !== 'object') return []

  const c = corpo
  if (Array.isArray(c.records)) return soObjetos(c.records)

  if (c.records && typeof c.records === 'object') {
    for (const v of Object.values(c.records)) {
      if (Array.isArray(v)) return soObjetos(v)
    }
  }

  for (const chave of ['data', 'jobs', 'clients', 'projects', 'tasks']) {
    if (Array.isArray(c[chave])) return soObjetos(c[chave])
  }
  return []
}

/** O token autenticado, dentro de qualquer embrulho que venha. */
export function extrairToken(corpo) {
  if (typeof corpo === 'string' && corpo.trim()) return corpo.trim()
  if (!corpo || typeof corpo !== 'object') return null

  const procurar = (o, fundo = 0) => {
    if (fundo > 3) return null
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && v.length > 20 && /token|auth|hash/i.test(k)) return v
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const achou = procurar(v, fundo + 1)
        if (achou) return achou
      }
    }
    return null
  }
  return procurar(corpo)
}

async function corpoDaResposta(r) {
  const texto = await r.text()
  if (!texto.trim()) return null
  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

/**
 * Troca o token do painel pelo token autenticado.
 *
 * O token do painel NÃO pode ser logado nem devolvido em mensagem de
 * erro. Por isso a mensagem de falha aqui fala do status e do caminho,
 * nunca do que foi enviado.
 */
export async function entrar(tokenAccess, busca, base = OPERAND_BASE) {
  if (!tokenAccess || tokenAccess.length < 8) {
    throw new ErroOperand(0, 'O token do Operand não foi informado, ou é curto demais para ser válido.')
  }
  const r = await tentarRede(
    busca,
    `${base}/login?tokenAccess=${encodeURIComponent(tokenAccess)}`,
    { headers: { accept: 'application/json' } },
    '/login',
  )
  if (!r.ok) {
    throw new ErroOperand(
      r.status,
      r.status === 401 || r.status === 403
        ? 'O Operand recusou o token. Gere outro em Módulos e Funções, seção API Operand.'
        : `O Operand respondeu ${r.status} no login.`,
      '/login',
    )
  }
  const token = extrairToken(await corpoDaResposta(r))
  if (!token) {
    throw new ErroOperand(r.status, 'O login respondeu, mas não veio token nenhum no corpo.', '/login')
  }
  return token
}

/**
 * Uma sessão: guarda o token autenticado e entra de novo quando ele
 * cai. `entrouDeNovo` existe para o script poder contar, porque
 * reautenticação em toda chamada é sintoma de token com vida curta e
 * vale saber.
 */
export function abrirSessao(tokenAccess, busca, base = OPERAND_BASE) {
  let token = null
  let renovacoes = 0

  const endereco = (caminho, query) => {
    const url = new URL(base + caminho)
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v === undefined || v === null) continue
      // Array vira `chave[]=a&chave[]=b`, que é o formato que a
      // documentação usa em situations[], statusIds[] e afins.
      if (Array.isArray(v)) for (const item of v) url.searchParams.append(`${k}[]`, String(item))
      else url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
    return url.toString()
  }

  async function uma(caminho, opcoes) {
    const query = opcoes?.query
    if (!token) token = await entrar(tokenAccess, busca, base)

    const chamar = () =>
      tentarRede(
        busca,
        endereco(caminho, query),
        { headers: { 'Op-Auth-Token': token, accept: 'application/json' } },
        caminho,
      )

    let r = await chamar()
    if (r.status === 401 || r.status === 403) {
      // Uma segunda chance, e só uma: se o token novo também for
      // recusado, o problema não é validade, é permissão.
      renovacoes++
      token = await entrar(tokenAccess, busca, base)
      r = await chamar()
    }
    if (!r.ok) {
      throw new ErroOperand(r.status, `O Operand respondeu ${r.status}.`, caminho)
    }
    return corpoDaResposta(r)
  }

  return { pedir: uma, entrouDeNovo: () => renovacoes }
}

/**
 * Percorre todas as páginas de uma listagem.
 *
 * O padrão da API é 100 registros por página, com offset e limit. Sem
 * isto, uma agência com 150 jobs veria 100 e acharia que são todos, o
 * que é pior que ver zero: erro que não parece erro.
 *
 * `teto` existe para o script não rodar para sempre se a API devolver
 * a mesma página repetida, que é o modo mais comum de paginação quebrar.
 */
export async function listarTudo(sessao, caminho, query = {}, { porPagina = 100, teto = 50 } = {}) {
  const tudo = []
  const vistos = new Set()

  for (let pagina = 0; pagina < teto; pagina++) {
    const corpo = await sessao.pedir(caminho, {
      query: { ...query, limit: porPagina, offset: pagina * porPagina },
    })
    const registros = extrairRegistros(corpo)
    if (registros.length === 0) break

    // Página repetida quer dizer paginação ignorada. Para aqui em vez
    // de acumular a mesma coisa cinquenta vezes.
    const assinatura = JSON.stringify(registros[0])
    if (vistos.has(assinatura)) break
    vistos.add(assinatura)

    tudo.push(...registros)
    if (registros.length < porPagina) break
  }
  return tudo
}

// -------------------------------------------------------------
// O que interessa ao planner
// -------------------------------------------------------------

/** Os clientes cadastrados no Operand, para ligar às marcas daqui. */
export async function listarClientes(sessao) {
  const brutos = await listarTudo(sessao, '/beta/entity/clients')
  return brutos
    .map((c) => ({
      id: Number(primeiro(c, ['idClient', 'idPerson', 'id', 'clientId']) ?? 0),
      // O nome do cliente vem em `person`. Os outros nomes ficam como
      // reserva: a documentação usa `namePerson` em um exemplo e
      // `oficialPerson` em outro, e trocar isso de versão em versão é
      // o tipo de coisa que quebra sem avisar.
      nome: String(
        primeiro(c, ['person', 'namePerson', 'oficialPerson', 'name', 'nome']) ?? '',
      ).trim(),
      documento: primeiro(c, ['nationalDocument', 'cnpj', 'cpf']) ?? null,
      situacao: String(primeiro(c, ['situation', 'situacao']) ?? '').trim() || null,
      jobs: Number(primeiro(c, ['totalJobs', 'jobs']) ?? 0),
      atrasados: Number(primeiro(c, ['lateJobs']) ?? 0),
    }))
    .filter((c) => c.id > 0 && c.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * Compara nomes do jeito que uma pessoa procuraria: sem acento, sem
 * caixa. O cadastro do Operand tem 522 clientes escritos ao longo de
 * anos por gente diferente, então "Queensberry" e "queensberry"
 * precisam ser a mesma busca.
 */
export function pareceCom(nome, termo) {
  const limpar = (t) =>
    String(t ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  const t = limpar(termo)
  if (!t) return true
  return limpar(nome).includes(t)
}

/**
 * Os jobs de um cliente.
 *
 * `situations[]` é obrigatório segundo a documentação, e o padrão aqui
 * é só `active`: arquivado e cancelado não interessam à tela de quem
 * está tocando o mês, e trazê-los dobraria o volume por nada.
 */
export async function listarJobs(sessao, clienteId, { mesesParaTras = 12 } = {}) {
  // Sem filtro de situação de propósito. A API aceita `situations[]`,
  // mas em lugar nenhum da documentação estão os valores válidos, e
  // filtro com valor inventado ou volta vazio ou volta tudo, sem
  // avisar qual dos dois. Filtrar aqui é lento por um instante e certo
  // sempre.
  const brutos = await listarTudo(sessao, '/beta/jobs', { clientIds: [clienteId] })
  return filtrarJobs(brutos, { mesesParaTras })
}

/**
 * Separa o que entra do que fica de fora, e diz por quê.
 *
 * Devolve a contagem de cada motivo junto com os jobs. Isso não é
 * enfeite: a primeira listagem real trouxe 584 linhas onde eu esperava
 * dezenas, e sem saber quantas caíram por data em branco, quantas por
 * idade e quantas por repetição, a única saída seria adivinhar. Um
 * filtro que não sabe explicar o que descartou é um filtro em que não
 * dá para confiar.
 */
export function filtrarJobs(brutos, { mesesParaTras = 12 } = {}) {
  const corte = new Date()
  corte.setMonth(corte.getMonth() - mesesParaTras)

  const descartes = { naoJob: 0, semId: 0, apagado: 0, semData: 0, velho: 0, repetido: 0 }
  const porId = new Map()

  for (const bruto of brutos) {
    // `taskType` diz o que a linha representa. Quando ele existe e não
    // é 'job', a linha é outra coisa e não vira trabalho no
    // calendário. Quando não vem, a linha passa: recusar por um campo
    // ausente jogaria fora dado bom.
    const tipo = bruto && typeof bruto.taskType === 'string' ? bruto.taskType.trim() : null
    if (tipo && tipo !== 'job') {
      descartes.naoJob++
      continue
    }

    const j = paraJob(bruto)
    if (j.jobId <= 0) {
      descartes.semId++
      continue
    }
    if (j.apagado) {
      descartes.apagado++
      continue
    }
    if (!j.prazo && !j.atualizadoEm && !j.criadoEm && !j.inicio) {
      descartes.semData++
      continue
    }
    if (!recente(j, corte)) {
      descartes.velho++
      continue
    }
    if (porId.has(j.jobId)) {
      descartes.repetido++
      continue
    }
    porId.set(j.jobId, j)
  }

  return { jobs: [...porId.values()], descartes, recebidos: brutos.length }
}

/**
 * A linha do job: o que vem antes da primeira barra do título.
 *
 * "Queens | E-mail MKT 3 | Linha Diet" é da Queens. "Hero Geleias |
 * Relatório Julho" é da Hero Geleias. É assim que a equipe escreve há
 * anos, e é a única coisa no job que diz de qual marca ele é: o
 * `clientId` é o mesmo para todas, porque no Operand elas dividem a
 * conta da fabricante.
 */
export function linhaDoTitulo(titulo) {
  const t = String(titulo ?? '')
  const corte = t.indexOf('|')
  const nome = (corte > 0 ? t.slice(0, corte) : t).trim()
  return nome || null
}

/** Sem acento e sem caixa, que é como dois nomes se comparam. */
function achatar(t) {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Esta linha pertence a esta marca?
 *
 * Um termo casa quando a linha é ele, ou começa com ele seguido de
 * espaço. A diferença é o que separa "Queens" de "Queensberry": os
 * dois começam igual, mas só o primeiro é prefixo com fronteira, e
 * confundir os dois misturaria as contas.
 *
 * Termo começando com ! exclui. Existe por um caso concreto: a Hero
 * Brasil é a FABRICANTE da Hero, então "Hero Brasil | Nota fiscal"
 * começa com "Hero" e não é trabalho da marca Hero. Sem a exclusão, o
 * jeito de evitar isso seria não usar "Hero" como termo, e aí os jobs
 * da marca ficariam de fora.
 *
 * Devolve o comprimento do termo que casou, ou 0. O comprimento é o
 * que decide quando duas marcas disputam: "Hero Geleias" ganha de
 * "Hero" porque é mais específico.
 */
export function forcaDaLinha(linha, termos) {
  if (!termos || termos.length === 0) return 1 // marca sem termo pega tudo
  const alvo = achatar(linha)
  if (!alvo) return 0

  const casa = (termo) => {
    const t = achatar(termo)
    if (!t) return 0
    if (alvo === t) return t.length
    return alvo.startsWith(t + ' ') ? t.length : 0
  }

  for (const termo of termos) {
    if (String(termo ?? '').trim().startsWith('!') && casa(String(termo).trim().slice(1))) {
      return 0
    }
  }
  let melhor = 0
  for (const termo of termos) {
    if (String(termo ?? '').trim().startsWith('!')) continue
    melhor = Math.max(melhor, casa(termo))
  }
  return melhor
}

/**
 * De todas as marcas ligadas ao mesmo cliente, qual fica com este job.
 *
 * Ganha a que casar com o termo mais específico. Empate não acontece
 * na prática, e se acontecer fica a primeira: repetir o mesmo termo em
 * duas marcas é erro de cadastro, e escolher em silêncio é menos
 * pior que espalhar o job nas duas.
 */
export function marcaDoJob(linha, marcas) {
  let escolhida = null
  let melhor = 0
  for (const m of marcas) {
    const forca = forcaDaLinha(linha, m.linhas)
    if (forca > melhor) {
      melhor = forca
      escolhida = m
    }
  }
  return escolhida
}

/**
 * Isso é uma data, ou um campo vazio disfarçado?
 *
 * O banco por trás do Operand guarda "data em branco" como
 * `0000-00-00 00:00:00`, que passa em qualquer teste de formato e não
 * existe no calendário. Se ela chegar até o banco daqui, o driver
 * tenta transformar em data de verdade e derruba a sincronização
 * inteira com "Invalid time value". Foi exatamente o que aconteceu.
 *
 * Então data em branco vira nulo aqui, na entrada, e não vira problema
 * lá na frente. Ano antes de 1990 também cai: o Operand não existia, e
 * um job de 1970 é sempre lixo de importação.
 */
export function ehDataDeVerdade(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t ?? ''))
  if (!m) return false
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (ano < 1990 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  return (
    d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  )
}

/**
 * O job interessa à agência hoje?
 *
 * O cadastro tem job de 2020 ainda pendurado. Copiar isso para dentro
 * do planner só enche a tela de trabalho que ninguém está fazendo. A
 * régua é a data mais recente que o job tiver: prazo, atualização ou
 * criação. Job sem data nenhuma fica, porque pode ser recém-aberto.
 */
export function recente(j, corte) {
  const datas = [j.prazo, j.atualizadoEm, j.criadoEm, j.inicio]
    .map((d) => (d ? new Date(String(d).slice(0, 10)) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()))
  // Antes, job sem data nenhuma ficava, com a ideia de que podia ser
  // recém-aberto. Com o cadastro real na frente isso se mostrou
  // errado: são centenas de jobs antigos com a data em branco, e todos
  // entravam. Job que não sabe dizer quando é não tem lugar num
  // calendário, então sai.
  if (datas.length === 0) return false
  const maior = new Date(Math.max(...datas.map((d) => d.getTime())))
  return maior >= corte
}

/**
 * Traduz um job do Operand para o que a tela precisa.
 *
 * Cada campo é procurado em mais de um nome possível. Não é
 * preguiça: a documentação nomeia a mesma coisa de formas diferentes
 * em seções diferentes, e a API está em /beta. Guardar o corpo inteiro
 * em `bruto` é a rede embaixo disso: quando um campo mudar de nome, dá
 * para ver o que veio sem pedir de novo.
 */
export function paraJob(j) {
  const texto = (v) => {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
    if (v && typeof v === 'object') {
      const n = primeiro(v, ['name', 'nome', 'title', 'namePerson', 'statusName'])
      if (typeof n === 'string' && n.trim()) return n.trim()
    }
    return null
  }
  const inteiro = (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  // Contador é diferente de identificador: aqui zero é resposta, não
  // ausência. "Nenhuma tarefa aberta" é um fato sobre o job.
  const contador = (v) => {
    if (v === undefined || v === null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
  }
  // O Operand manda o tempo duas vezes: em minutos (`estimatedTime`) e
  // como texto "HH:MM" (`estimated`). Os dois são aceitos aqui porque
  // o texto é o que sobra se um dia o numérico sumir.
  const minutos = (v) => {
    if (v === undefined || v === null || v === '') return null
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v)
    const t = texto(v)
    const m = t && t.match(/^(\d+):([0-5]\d)$/)
    if (m) return Number(m[1]) * 60 + Number(m[2])
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
  }
  const verdade = (v) => v === true || v === 1 || v === '1' || v === 'true'
  const data = (v) => {
    const t = texto(v)
    if (!t) return null
    const m = t.match(/^(\d{4}-\d{2}-\d{2})/)
    return m && ehDataDeVerdade(m[1]) ? m[1] : null
  }
  // Data e hora viram texto ISO. Sem fuso na origem, então fica a hora
  // como veio: inventar fuso aqui erraria por três horas todo dia.
  const momento = (v) => {
    const t = texto(v)
    if (!t) return null
    const m = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/)
    if (m && ehDataDeVerdade(m[1])) return `${m[1]}T${m[2].length === 5 ? m[2] + ':00' : m[2]}`
    return data(t)
  }

  // Quem é o job: o campo `id`. Isso foi medido, não lido.
  //
  // A resposta traz dois números por linha, `id` e `itemId`, e a
  // documentação não diz qual é qual. O teste foi perguntar ao próprio
  // Operand: cada job declara quantas tarefas tem, e a rota
  // /beta/jobs/<n>/tasks devolve as tarefas de <n>. O número certo é o
  // que faz as duas contas baterem. Em cinco jobs da Queensberry, o
  // `id` bateu quatro vezes e o `itemId` nenhuma.
  //
  // O `itemId` é pequeno e vai de 1 até a quantidade de jobs do
  // cliente, então é a numeração que a equipe vê dentro da conta.
  // Guardo porque é o número pelo qual as pessoas se referem ao
  // trabalho, mas ele não identifica nada fora do cliente.
  return {
    jobId: inteiro(primeiro(j, ['id', 'jobId', 'idJob'])) ?? 0,
    linha: linhaDoTitulo(texto(primeiro(j, ['title', 'titulo', 'jobTitle']))),
    itemId: inteiro(primeiro(j, ['itemId'])),
    titulo: texto(primeiro(j, ['title', 'titulo', 'jobTitle'])) ?? '(sem título)',
    descricao: texto(primeiro(j, ['description', 'descricao', 'briefing'])),
    situacao: texto(primeiro(j, ['situation', 'situacao'])),
    statusId: inteiro(primeiro(j, ['statusId', 'idStatus'])),
    statusNome: texto(primeiro(j, ['statusName', 'status'])),
    statusCor: texto(primeiro(j, ['statusColor'])),
    responsavelId: inteiro(primeiro(j, ['jobResponsibleId', 'responsibleId'])),
    responsavel: texto(primeiro(j, ['responsibleName', 'responsible', 'responsavel'])),
    clienteId: inteiro(primeiro(j, ['clientId', 'idClient'])),
    clienteNome: texto(primeiro(j, ['clientName', 'client'])),
    projetoId: inteiro(primeiro(j, ['projectId', 'idProject'])),
    projetoNome: texto(primeiro(j, ['projectTitle', 'projectName', 'project'])),
    sequencia: inteiro(primeiro(j, ['sequenceId', 'orderId'])),
    inicio: data(primeiro(j, ['initialDate', 'startDate', 'inicio'])),
    prazo: data(primeiro(j, ['deadline', 'dueDate', 'prazo'])),
    criadoEm: momento(primeiro(j, ['createdAt', 'createdDate'])),
    atualizadoEm: momento(primeiro(j, ['updatedAt', 'updatedDate'])),
    // Os dois tempos são o achado que faltava: dá para comparar o que
    // foi orçado com o que foi gasto, por peça.
    tempoEstimado: minutos(j.estimatedTime ?? j.estimated),
    tempoTrabalhado: minutos(j.workedTime ?? j.worked),
    tarefasAbertas: contador(j.openedTasks),
    tarefasFechadas: contador(j.closedTasks),
    tarefasCanceladas: contador(j.canceledTasks),
    apagado: verdade(j.isDeleted),
    bruto: j,
  }
}

/** O primeiro desses nomes que existir no objeto, com valor. */
function primeiro(o, nomes) {
  for (const n of nomes) {
    const v = o[n]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}
