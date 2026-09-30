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
    teste: /wobbler|moldura|\bframe\b|tampa|embalagem|rotulo|\bbanner\b|\bkv\b|flyer|cartaz|adesivo|\bdisplay\b|\bm?pdv\b|\bplacas?\b|\bfachada\b|\boutdoor\b|\bletreiro\b|\bstopper\b|\bgondola\b|\btesteira\b|\bclip ?strip\b/,
  },
  // Daqui para baixo vieram da Habiarte, uma construtora. As regras
  // originais foram escritas lendo titulos de uma marca de alimentos, e
  // 89% das pecas dela cairam em "outros". Vocabulario de formato e da
  // AGENCIA, nao da industria: cada conta chama o trabalho do seu
  // jeito, e esta lista cresce quando uma conta nova mostra que cresce.
  { chave: 'layout', rotulo: 'layout de arte', teste: /\blayout\b|\bdiagramacao\b|\barte final\b/ },
  { chave: 'marca', rotulo: 'identidade e naming', teste: /\bnaming\b|identidade visual|\blogo(tipo)?\b|rebranding|manual da marca|\bbranding\b/ },
  { chave: 'apresentacao', rotulo: 'apresentação', teste: /\bppt\b|apresentacao|\bslides?\b|\btelao\b/ },
  { chave: 'blog', rotulo: 'blog e artigo', teste: /\bblog\b|\bartigo\b/ },
  { chave: 'seo', rotulo: 'SEO', teste: /\bseo\b|palavras?-?chave|busca organica/ },
  { chave: 'midia', rotulo: 'mídia paga', teste: /\bads\b|\bmidia\b|impulsiona|trafego pago/ },
  // "Acao" sozinho conta. Na Habiarte os titulos sao do tipo
  // "Outubro Rosa - Acao Use Rosa - LinkedIn": e campanha, e a palavra
  // que diz isso e uma so.
  { chave: 'campanha', rotulo: 'ação e campanha', teste: /\bacoes?\b|campanha|\bpromo|outubro rosa|novembro azul|\bserie\b/ },
  // "Redes sociais" fica por ultimo de proposito: e o rotulo mais
  // generico que a agencia usa, e quase toda peca de social poderia
  // cair nele. So pega o que nao disse nada mais especifico.
  { chave: 'redessociais', rotulo: 'redes sociais', teste: /redes sociais|\bsociais\b|social media/ },
  { chave: 'post', rotulo: 'post de feed', teste: /\bpost\b|publicacao|\bfeed\b|\bcapa/ },
]

/** O que é trabalho de bastidor e não peça de conteúdo. */
// `\bnf\b` entrou porque a Habiarte escreve "Institucional | NF de
// Junho", e isso e nota fiscal com outro nome.
const ADMINISTRATIVO =
  /relatorio|timesheet|nota fiscal|\bnf\b|calculos de verba|orcamento|\bboletos?\b|contrato|reuniao|simulacoes|faturamento/

/**
 * Anúncio de vaga, não conteúdo de marca.
 *
 * A Canto de Minas publica vaga no LinkedIn pela agência: "Vendedor
 * Sênior BH", "Analista de Suprimentos SR", "Vendedor Jr". É trabalho
 * de verdade, consome horas de verdade, e não tem nada a ver com o que
 * a marca fala para quem compra iogurte.
 *
 * Fica separado do endomarketing porque é o contrário dele: a
 * comunicação interna fala com quem já trabalha lá, a vaga fala com
 * quem ainda não. As duas só têm em comum não serem conteúdo de marca.
 *
 * O risco aqui é o inverso do de sempre: nome de cargo é palavra comum,
 * e uma regra larga classificaria peça de conteúdo como vaga. Por isso
 * a lista é de cargos, e não de palavras que aparecem perto de cargos.
 */
const RECRUTAMENTO =
  /\bvagas?\b|recrutamento|contratacao|\bestagi|\btrainee\b|banco de talentos|\bvendedor(a|es|as)?\b|\bpromotor(a|es|as)?\b|\banalista\b|\bassistente\b|\bauxiliar\b|\bcoordenador|\bsupervis(or|ao)|\boperador|\brepositor|\bmanutencao eletrica\b/

/**
 * Comunicação para DENTRO da empresa do cliente, não para o público.
 *
 * SIPAT, aniversariantes do mês, convite de confraternização, telão do
 * refeitório. É trabalho de verdade e consome horas de verdade, mas
 * não é conteúdo de marca, e misturar os dois faria a IA propor pauta
 * de rede social inspirada na semana de prevenção de acidentes.
 *
 * Uma construtora com centenas de funcionários gera muito disso, e
 * quem não separa acha que a marca fala de um assunto que ela nunca
 * falou em público.
 */
const ENDOMARKETING =
  /\bsipat\b|aniversariantes|endomarketing|comunicado interno|\bconvites?\b|integracao de|colaboradores|\bcracha\b|uniforme|confraternizacao|semana interna|tv corp/
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
    : RECRUTAMENTO.test(t)
      ? 'recrutamento'
      : ENDOMARKETING.test(t)
        ? 'endomarketing'
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
    // Segunda tentativa no titulo INTEIRO, incluindo o pedaco antes da
    // primeira barra.
    //
    // O padrao normal e "linha | formato | assunto", e por isso a
    // primeira tentativa usa so o que vem depois da linha: sem isso, o
    // nome do cliente entraria na classificacao. Mas a Habiarte
    // escreve tambem "Habiarte - Redes Sociais - SEO | Areas de Lazer
    // Cidade de Ouro Preto", com o formato DENTRO da linha, e esses
    // caiam todos em "sem formato".
    //
    // A ordem importa: o pedaco depois da barra ganha sempre, porque e
    // onde o formato esta quando esta declarado. O titulo inteiro so e
    // consultado quando a primeira tentativa nao achou nada, e ai um
    // acerto vale mais que a duvida.
    if (formato === 'outros') {
      const inteiro = achatar(String(titulo ?? ''))
      for (const f of FORMATOS) {
        if (f.teste.test(inteiro)) {
          formato = f.chave
          break
        }
      }
    }
  }

  const canais = CANAIS.filter((c) => c.teste.test(t)).map((c) => c.chave)
  return { formato, natureza, canais, limpo }
}

/** O rótulo em português de um formato. */
export function rotuloDoFormato(chave) {
  // "outros" lido numa lista de formatos parece uma categoria, e com
  // ele em primeiro lugar a leitura vira "esta agencia faz sobretudo
  // outros". Nao e categoria: e a ausencia de formato no titulo, que
  // numa conta cujo contrato e "redes sociais" acontece o tempo todo,
  // porque o titulo nomeia o ASSUNTO.
  if (chave === 'outros') return 'sem formato no título'
  return FORMATOS.find((f) => f.chave === chave)?.rotulo ?? 'sem formato no título'
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
  // De "influenciadores pagos" e "influenciadores organicos": e o tipo
  // de contratacao, nao gente.
  'pago', 'paga', 'pagos', 'pagas', 'organico', 'organica', 'organicos',
  'organicas', 'digital', 'digitais', 'local', 'locais', 'nacional',
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
      if (c === curto || c.startsWith(curto + ' ')) return true
      // "Rayane" e "Rayanne" sao a mesma pessoa com uma letra a mais.
      // Nome proprio digitado a mao ao longo de anos varia assim, e
      // contar as duas grafias separadas diria que a marca trabalhou
      // com duas pessoas quando trabalhou com uma.
      //
      // So a partir de seis letras: em nome curto, uma letra de
      // diferenca e outra pessoa ("Ana" e "Ane").
      return c.length >= 6 && curto.length >= 6 && umaLetraDeDiferenca(c, curto)
    })
    const alvo = maior ?? nome
    destino.set(alvo, (destino.get(alvo) ?? 0) + (contagem.get(nome) ?? 0))
  }
  return destino
}

/** Dois nomes que diferem por uma letra a mais, a menos ou trocada. */
export function umaLetraDeDiferenca(a, b) {
  if (a === b) return false
  if (Math.abs(a.length - b.length) > 1) return false
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a]
  let i = 0
  let j = 0
  let erros = 0
  while (i < curto.length && j < longo.length) {
    if (curto[i] === longo[j]) {
      i++
      j++
      continue
    }
    if (++erros > 1) return false
    if (curto.length === longo.length) i++
    j++
  }
  return erros + (longo.length - j) <= 1
}

/** Palavras que não dizem nada sobre o assunto. */
const VAZIAS = new Set(
  ('de da do das dos e ou a o as os um uma no na nos nas para por com sem em ao aos que se sobre ' +
    'novo nova novos novas mais menos ate apos antes sem dia mes ano semana ' +
    'conteudo post posts foto fotos video videos reels story stories carrossel email mkt ' +
    'influ influenciador influenciadora arte peca pecas material ' +
    'layout capa capas destaque destaques mpdv pdv wobbler moldura frame banner ' +
    'planejamento relatorio timesheet pauta briefing collab colab trend data mail ' +
    // Mes no titulo e organizacao de entrega, nao assunto da marca.
    'janeiro fevereiro marco abril maio junho julho agosto setembro outubro ' +
    'novembro dezembro mes mensal semana semanal')
    .split(' ')
    .filter(Boolean),
)

/**
 * A peça é de data comemorativa?
 *
 * Não vira formato: data comemorativa é ASSUNTO, e misturar com forma
 * estragaria as duas listas. Mas vale contar à parte, porque é uma
 * decisão de estratégia visível: uma marca que faz trinta datas por ano
 * tem um calendário editorial preso ao almanaque, e quem for planejar
 * o mês seguinte precisa saber disso antes de propor.
 */
const DATA_COMEMORATIVA =
  /\bdia (mundial|nacional|internacional|d[oa])\b|\bnatal\b|\bano novo\b|\bpascoa\b|\bcarnaval\b|black friday|dia das criancas|dia das maes|dia dos pais|\bnamorados\b|\bconsumidor\b/

export function ehDataComemorativa(titulo) {
  return DATA_COMEMORATIVA.test(achatar(limparTitulo(titulo)))
}

/**
 * Os assuntos que voltam.
 *
 * Conta palavras dos títulos limpos, tirando as vazias e as que só
 * dizem o formato. Não é análise semântica, é contagem: o que a marca
 * repete aparece, e o que apareceu uma vez some. Serve para a IA saber
 * que "geleia", "receita" e "40 anos" são o vocabulário desta conta.
 */
export function temasRecorrentes(titulos, { minimo = 3, teto = 20, ignorar = [] } = {}) {
  // Nome de marca e de empreendimento e IDENTIDADE, nao assunto. Numa
  // construtora com trinta empreendimentos, o nome de cada um aparece
  // dezenas de vezes e empurra para fora da lista os assuntos de
  // verdade. Quem sao esses nomes o proprio dado diz: sao as linhas
  // dos titulos.
  const fora = new Set([...VAZIAS, ...ignorar.map((t) => achatar(t)).filter(Boolean)])
  const conta = new Map()
  for (const titulo of titulos) {
    const limpo = limparTitulo(titulo)
    const palavras = achatar(limpo)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/u)
      .filter((p) => p.length >= 3 && !fora.has(p) && !/^\d+$/.test(p))
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
    linha: j.linha ?? null,
    minutos: Number(j.tempo_trabalhado ?? j.tempoTrabalhado ?? 0) || 0,
    quando: comoData(j.prazo) ?? comoData(j.criado_em) ?? comoData(j.criadoEm),
    ...classificar(j.titulo),
  }))

  const datas = limpos.map((j) => j.quando).filter(Boolean).sort()
  const soma = (lista) => lista.reduce((t, j) => t + j.minutos, 0)

  const porNatureza = {}
  for (const nat of ['conteudo', 'endomarketing', 'recrutamento', 'planejamento', 'administrativo']) {
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
  // Segunda passada: uma vez que se sabe QUEM sao os influenciadores da
  // marca, da para contar as pecas que citam o nome deles sem escrever
  // "influ". "Rayane Campea Olimpica" e "Rayane - Training Camp" sao
  // conteudo com a mesma pessoa, e sem isso a conta ficava pela metade.
  //
  // So nomes de cinco letras ou mais, e so palavra inteira: nome curto
  // casaria com pedaco de outra palavra e inflaria tudo.
  const influ = juntarInfluenciadores(influBruto)
  for (const [nome, quantos] of influ) {
    const primeiro = achatar(nome).split(' ')[0]
    if (!primeiro || primeiro.length < 5) continue
    const procura = new RegExp(`\\b${primeiro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    let extras = 0
    for (const j of limpos) {
      if (influenciadorDoTitulo(j.titulo)) continue // ja contado na primeira passada
      if (procura.test(achatar(j.titulo))) extras++
    }
    if (extras > 0) influ.set(nome, quantos + extras)
  }

  // As frentes: quando a marca reune varios cadastros do Operand, a
  // linha do titulo diz de qual empreendimento, produto ou unidade e
  // cada trabalho. Numa construtora isso e a informacao mais util do
  // retrato inteiro, porque diz onde o esforco esta concentrado.
  //
  // Agrupa ignorando caixa e acento, e guarda a escrita mais usada. A
  // mesma frente aparece como "NovaTero", "Novatero" e "NOVATERO" ao
  // longo dos anos, e sao a mesma coisa: sem isto o retrato inventava
  // tres frentes onde ha uma, e ainda tirava 12 jobs da maior delas.
  //
  // Caixa e acento so, e nada alem disso. Nao vale juntar nomes
  // parecidos como se faz com influenciador: "Torre 1" e "Torre 2"
  // tambem estao a uma letra de distancia e sao dois predios
  // diferentes. Numa construtora, juntar os dois apagaria justamente a
  // informacao mais util do retrato.
  const porFrente = new Map()
  for (const j of limpos) {
    if (!j.linha) continue
    const chave = achatar(j.linha)
    const f = porFrente.get(chave) ?? { nome: j.linha, jobs: 0, minutos: 0, escritas: new Map() }
    f.jobs++
    f.minutos += j.minutos
    f.escritas.set(j.linha, (f.escritas.get(j.linha) ?? 0) + 1)
    porFrente.set(chave, f)
  }
  for (const f of porFrente.values()) {
    // A escrita mais usada vence. Empate fica com a que apareceu
    // primeiro, que e a ordem em que o Map guardou.
    let melhor = 0
    for (const [escrita, n] of f.escritas) {
      if (n > melhor) {
        melhor = n
        f.nome = escrita
      }
    }
    delete f.escritas
  }
  const frentes = [...porFrente.values()].sort((a, b) => b.jobs - a.jobs)

  const palavrasDaIdentidade = []
  for (const f of frentes) {
    for (const p of achatar(f.nome).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/u)) {
      if (p.length >= 3) palavrasDaIdentidade.push(p)
    }
  }

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
    // As linhas viram tanto a lista de frentes quanto a lista de
    // palavras a ignorar nos assuntos.
    frentes,
    datas: (() => {
      const daData = conteudo.filter((j) => ehDataComemorativa(j.titulo))
      return {
        jobs: daData.length,
        exemplos: [...new Set(daData.map((j) => limparTitulo(j.titulo)))].slice(0, 6),
      }
    })(),
    temas: temasRecorrentes(conteudo.map((j) => j.titulo), { ignorar: palavrasDaIdentidade }),
    // Titulos que nao encaixaram em formato nenhum. Existem para a
    // proxima correcao das regras ser feita com prova na mao, e nao
    // por adivinhacao: foi adivinhando que eu escrevi regras de
    // alimentos e apliquei numa construtora.
    exemplosSemFormato: conteudo
      .filter((j) => j.formato === 'outros')
      .slice(0, 12)
      .map((j) => j.titulo),
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
  const en = p.natureza.endomarketing ?? { jobs: 0, minutos: 0 }
  const re = p.natureza.recrutamento ?? { jobs: 0, minutos: 0 }
  const pl = p.natureza.planejamento
  const ad = p.natureza.administrativo
  linhas.push(
    `Desses, ${c.jobs} são peças de conteúdo para o público (${horas(c.minutos)}), ` +
      (en.jobs > 0
        ? `${en.jobs} são comunicação interna do cliente, como SIPAT e aniversariantes ` +
          `(${horas(en.minutos)}), `
        : '') +
      (re.jobs > 0 ? `${re.jobs} são anúncio de vaga (${horas(re.minutos)}), ` : '') +
      `${pl.jobs} são planejamento (${horas(pl.minutos)}) e ` +
      `${ad.jobs} são administrativo, como relatório e nota fiscal (${horas(ad.minutos)}).` +
      (en.jobs > 0 || re.jobs > 0
        ? ' Nada disso deve inspirar pauta de rede social: a comunicação interna fala com ' +
          'os funcionários do cliente e o anúncio de vaga fala com candidatos, não com o ' +
          'público da marca.'
        : ''),
  )

  if (p.formatos.length) {
    const partes = p.formatos.map(
      (f) =>
        `${f.rotulo}: ${f.jobs}` +
        (f.medianaMinutos ? ` (tipicamente ${horas(f.medianaMinutos)} cada)` : ''),
    )
    linhas.push(`Formatos produzidos, do mais frequente ao menos: ${partes.join('; ')}.`)
    const semFormato = p.formatos.find((f) => f.chave === 'outros')
    if (semFormato && semFormato.jobs > p.natureza.conteudo.jobs * 0.2) {
      linhas.push(
        `"Sem formato no título" não é um tipo de peça: são ${semFormato.jobs} trabalhos ` +
          'cujo título nomeia o assunto e não o formato. Não conclua nada sobre formato a ' +
          'partir desse número.',
      )
    }
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

  if (p.datas && p.datas.jobs > 0) {
    const fatia = Math.round((p.datas.jobs / Math.max(1, p.natureza.conteudo.jobs)) * 100)
    linhas.push(
      `${p.datas.jobs} peças (${fatia}% do conteúdo) são de data comemorativa: ` +
        p.datas.exemplos.join(', ') +
        (p.datas.exemplos.length >= 6 ? ', entre outras.' : '.') +
        ' Isso diz o quanto o calendário desta conta depende do almanaque, e é uma ' +
        'decisão de estratégia, não um acaso.',
    )
  }

  if (p.frentes && p.frentes.length > 1) {
    const topo = p.frentes.slice(0, 10)
    linhas.push(
      `O trabalho se divide em ${p.frentes.length} frentes. As maiores: ` +
        topo.map((f) => `${f.nome} (${f.jobs})`).join(', ') +
        (p.frentes.length > 10 ? ', entre outras.' : '.'),
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
