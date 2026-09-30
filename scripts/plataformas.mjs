/**
 * O estado das plataformas: o que mudou no Meta, no TikTok e nos
 * outros, buscado nas fontes de primeira mão.
 *
 * POR QUE FORA DA GERAÇÃO
 *
 * A pesquisa que roda dentro do planejamento responde uma pergunta que
 * muda a cada marca e a cada mês. Esta responde uma que muda algumas
 * vezes por ano e é a mesma para todo mundo. Rodar por geração seria
 * pagar cinco vezes para receber cinco respostas ligeiramente
 * diferentes sobre o mesmo fato, e nenhuma delas revisável.
 *
 * POR QUE AQUI TEM LISTA DE DOMÍNIOS E NA PESQUISA NÃO
 *
 * Parece contradição e não é. Lá a pergunta é aberta: o que é sazonal
 * neste setor, o que está circulando. O conjunto de boas fontes para
 * isso não dá para escrever de antemão, e uma lista branca envelhece e
 * passa a esconder o que ninguém lembrou de listar.
 *
 * Aqui a pergunta é fechada: o que a plataforma anunciou. Existe
 * exatamente uma fonte autorizada por plataforma, e é a plataforma.
 * A lista não é um palpite sobre qualidade, é a própria definição da
 * pergunta. Tudo que está fora dela é, por construção, alguém contando
 * o que a plataforma disse.
 *
 * E É JUSTAMENTE ISSO QUE A LISTA EVITA
 *
 * "Boas práticas Meta Ads" é uma das buscas mais spamadas da internet.
 * O que volta é blog de agência e texto escrito por IA reciclando uns
 * aos outros, quase sempre desatualizado. Jogar isso no prompt deixa a
 * sugestão mais confiante sem deixar mais correta, que é pior que não
 * ter nada: sem nada, ela pelo menos não finge.
 *
 * O QUE A NOTA PODE DIZER
 *
 * O que mudou, com data e link. Formato novo, formato aposentado,
 * objetivo novo, limite que mudou, especificação. Isso muda COMO uma
 * peça é feita.
 *
 * O QUE ELA NÃO PODE DIZER
 *
 * O que performa melhor. Não é fato sobre o mundo: depende da oferta,
 * da conta e do público. Quem responde performance é o dado da própria
 * conta, e o sistema ainda não tem esse dado. Enquanto não tiver, a
 * resposta honesta é não responder.
 *
 * A NOTA NASCE PENDENTE
 *
 * Ela entra no prompt de todos os planejamentos de todas as marcas: é
 * o texto de maior alcance do sistema. Nota errada não estraga uma
 * peça, estraga o mês de todo mundo. Por isso alguém lê antes.
 *
 * Uso:
 *   node scripts/plataformas.mjs ver          a nota valendo e a pendente
 *   node scripts/plataformas.mjs gerar [dias] busca e grava, pendente
 *   node scripts/plataformas.mjs aprovar      passa a valer
 *   node scripts/plataformas.mjs descartar [motivo]
 *   node scripts/plataformas.mjs historico
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { lerNota, divergencia } from './plataformas-nota.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const caminhoEnv = join(raiz, '.env.local')

function lerEnvLocal() {
  if (!existsSync(caminhoEnv)) return {}
  const out = {}
  for (const linha of readFileSync(caminhoEnv, 'utf8').split(/\r?\n/)) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue
    const i = linha.indexOf('=')
    if (i < 0) continue
    let v = linha.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[linha.slice(0, i).trim()] = v
  }
  return out
}

const env = { ...lerEnvLocal(), ...process.env }
const URL_BANCO = env.DATABASE_URL
const CHAVE = env.ANTHROPIC_API_KEY
const MODELO = env.MODELO_PLATAFORMAS || 'claude-opus-5'

const ENDERECO = 'https://api.anthropic.com/v1/messages'
const VERSAO_API = '2023-06-01'
/** Dez dolares por mil pesquisas. */
const CUSTO_POR_BUSCA_USD = 0.01
const PRECO = {
  'claude-opus-5': { entrada: 5, saida: 25 },
  'claude-sonnet-5': { entrada: 2, saida: 10 },
}

function erroFatal(mensagem, ajuda) {
  console.error('\n  ' + mensagem)
  if (ajuda) console.error('  ' + ajuda)
  console.error('')
  process.exit(1)
}

if (!URL_BANCO) {
  erroFatal(
    'Nao achei DATABASE_URL no .env.local.',
    'Ela e a conexao direta com o Supabase e nunca vai para a Vercel.',
  )
}

const sql = postgres(URL_BANCO, { prepare: false, idle_timeout: 5 })

/**
 * As fontes de primeira mao, por plataforma.
 *
 * Subdominio escrito inteiro restringe AQUELE subdominio. Escrever
 * `fb.com` pegaria o site inteiro do Meta, inclusive pagina de produto
 * e ajuda ao consumidor, que nao e o que se procura aqui.
 *
 * Se uma plataforma mudar de endereco, a busca dela volta vazia em vez
 * de voltar errada, e o relatorio no fim mostra quantas leituras
 * vieram de cada dominio. Silencio que aparece e melhor que silencio.
 */
const FONTES = {
  instagram: ['about.fb.com', 'business.instagram.com', 'creators.instagram.com'],
  facebook: ['about.fb.com', 'developers.facebook.com'],
  tiktok: ['newsroom.tiktok.com', 'ads.tiktok.com'],
  youtube: ['blog.youtube', 'support.google.com'],
  linkedin: ['blog.linkedin.com', 'business.linkedin.com'],
  pinterest: ['newsroom.pinterest.com', 'business.pinterest.com'],
}

/**
 * Quais plataformas a agencia usa de verdade.
 *
 * Pergunta ao proprio dado em vez de buscar as seis sempre. Buscar
 * Pinterest para uma agencia que nunca publicou no Pinterest gasta
 * pesquisa e enche a nota de coisa que ninguem vai usar.
 */
async function plataformasEmUso() {
  // O que a agencia PUBLICA, primeiro. `brand_platforms` e declaracao,
  // e declaracao envelhece: uma marca que um dia pensou em LinkedIn
  // deixa a linha la para sempre. `content_channels` e o que foi de
  // fato planejado, e so ele responde onde o trabalho acontece.
  //
  // Isso tem consequencia direta no custo: a primeira corrida leu 71
  // paginas e cobrou US$ 1,32, sendo 19 delas de LinkedIn para uma
  // agencia cujo trabalho e quase todo Instagram.
  const publicadas = await sql`
    select platform::text as p, count(*)::int as n
    from public.content_channels where platform is not null
    group by 1 order by 2 desc
  `
  const boas = publicadas.filter((l) => FONTES[l.p])
  if (boas.length > 0) {
    console.log('  Plataformas, pelo que ja foi planejado:')
    for (const l of boas) console.log('    ' + String(l.n).padStart(5) + '  ' + l.p)
    return boas.map((l) => l.p)
  }

  // Sem nada planejado ainda, vale a declaracao.
  const declaradas = await sql`
    select distinct platform::text as p from public.brand_platforms where platform is not null
  `
  const outras = declaradas.map((l) => l.p).filter((p) => FONTES[p])
  if (outras.length > 0) {
    console.log('  Nenhuma publicacao planejada ainda. Usando o que a base declara.')
    return outras.sort()
  }
  // Nem uma coisa nem outra: o padrao e onde a verba vai.
  console.log('  Nada gravado. Usando o padrao: Meta.')
  return ['instagram', 'facebook']
}

/** Em que setores os clientes atuam. Serve para cortar regra que nao e deles. */
async function setores() {
  const linhas = await sql`
    select distinct segment from public.brands
    where arquivada_em is null and segment is not null and btrim(segment) <> ''
  `
  return linhas.map((l) => String(l.segment).trim()).sort()
}

function pergunta(plataformas, dias, ondeAtuam) {
  const nomes = plataformas.join(', ')
  const setoresTexto =
    ondeAtuam.length > 0
      ? `\n\nOs clientes desta agencia atuam em: ${ondeAtuam.join(', ')}. Regra de publicidade de
categoria que nenhum deles toca (cassino, apostas, adulto, horoscopo, farmaceutico,
politica e afins) NAO interessa e nao deve entrar.`
      : ''

  return `Voce e o pesquisador de uma agencia de comunicacao brasileira. Sua tarefa e uma so:
dizer o que MUDOU nestas plataformas nos ultimos ${dias} dias, lendo apenas o que a
propria plataforma publicou.

Plataformas: ${nomes}.${setoresTexto}

A PERGUNTA, EXATA

"O que mudou no que a agencia PODE ENTREGAR?" Ou seja: o que muda o arquivo que sai
daqui, o texto que o acompanha, ou a campanha que o impulsiona.

ENTRA

- formato novo, aposentado ou renomeado
- objetivo de campanha novo ou removido
- limite que mudou: duracao, proporcao, caracteres, tamanho de arquivo
- recurso de PUBLICACAO que a agencia passa a poder usar (link em post organico,
  agendamento, um tipo de peca que antes nao existia)
- regra de direitos, publicidade ou rotulagem que muda o que pode ir na peca

NAO ENTRA, E ESTA E A PARTE QUE MAIS ERRA

- qualquer afirmacao sobre o que performa melhor, rende mais ou alcanca mais
- "boas praticas", dicas, melhores horarios, numero ideal de hashtags
- recurso de quem CONSOME: modo de assistir, tela de TV, tradução para o espectador,
  legenda automatica para quem ve. Nada disso muda o que a agencia entrega.
- assinatura, plano pago e preco, a menos que o recurso preso no plano seja de
  publicacao. Nesse caso diga QUAL recurso e que ele esta dentro de plano pago.
- evento, programa e acao de marketing da propria plataforma
- ferramenta de IA da plataforma que nao muda o arquivo entregue
- previsao sobre o que vai acontecer
- qualquer coisa sem data e sem link

NO MAXIMO 8 ITENS, somando todas as plataformas. Se achar mais, escolha os que mais
mudam o trabalho e deixe o resto de fora. Nota longa nao e nota melhor: ela entra no
prompt de todos os planejamentos, e o que sobra ali empurra para fora o que importa.

Se nao houve mudanca relevante no periodo, DIGA ISSO. "Nada relevante mudou" e uma
resposta certa e util, e acontece na maioria das semanas. Encher a nota para parecer
produtiva e o pior resultado possivel.

COMO ESCREVER

Portugues do Brasil. Nao use travessao (o sinal comprido) em lugar nenhum: use virgula,
dois-pontos ou parenteses. Uma plataforma por paragrafo, comecando pelo nome dela. Cada
item em UMA frase, com a data entre parenteses. Os links nao vao no texto: vao so na
lista de fontes. Sem adjetivo de propaganda.

RESPONDA SOMENTE COM JSON, nesta forma, e nada alem dele:

{
  "mudou": true ou false,
  "texto": "A nota inteira, pronta para uma pessoa ler. No maximo 1500 caracteres.",
  "fontes": [{"titulo": "titulo da pagina", "url": "endereco exato"}]
}

Em "fontes" liste apenas paginas que voce realmente leu e usou no texto.`
}

async function buscar(plataformas, dias, ondeAtuam) {
  if (!CHAVE) {
    erroFatal(
      'Nao achei ANTHROPIC_API_KEY no .env.local.',
      'E a mesma chave que o site usa para gerar planejamento.',
    )
  }

  const dominios = [...new Set(plataformas.flatMap((p) => FONTES[p] ?? []))]
  console.log('  Fontes travadas em: ' + dominios.join(', '))
  console.log('  Periodo: ultimos ' + dias + ' dias')
  console.log('  Modelo: ' + MODELO)
  console.log('\n  Buscando. Isso leva de trinta segundos a dois minutos.\n')

  const resposta = await fetch(ENDERECO, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': CHAVE,
      'anthropic-version': VERSAO_API,
    },
    body: JSON.stringify({
      model: MODELO,
      // Oito mil, e nao quatro. A primeira corrida de verdade bateu no
      // teto de quatro mil e voltou cortada no meio de uma palavra, com
      // o JSON sem fechar. O teto existe para o custo nao escapar, mas
      // teto que corta a resposta nao economiza nada: paga a busca
      // inteira e joga o resultado fora.
      max_tokens: 8000,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          // Oito cobre as seis plataformas com folga. O teto existe
          // para uma busca nao virar uma sessao de navegacao.
          max_uses: 8,
          allowed_domains: dominios,
        },
      ],
      messages: [{ role: 'user', content: pergunta(plataformas, dias, ondeAtuam) }],
    }),
  })

  if (!resposta.ok) {
    const corpo = await resposta.text()
    erroFatal(
      'A API recusou: ' + resposta.status,
      corpo.slice(0, 400).replace(/\s+/g, ' '),
    )
  }

  const dado = await resposta.json()

  // O que a API diz que leu de verdade. E a outra metade da
  // conferencia: uma lista so, escrita pelo proprio modelo, nao e
  // conferivel por ninguem.
  const lidas = []
  let ultimoTexto = ''
  for (const bloco of dado.content ?? []) {
    if (bloco.type === 'text') ultimoTexto = bloco.text
    if (bloco.type === 'web_search_tool_result') {
      for (const r of bloco.content ?? []) {
        if (r?.url) lidas.push({ titulo: r.title ?? '', url: r.url })
      }
    }
  }

  // Resposta cortada nao e resposta. Sem esta checagem, o pedaco que
  // chegou vira nota, e a unica pista seria o JSON aparecendo cru na
  // tela, duas linhas acima de onde ninguem olha.
  const cortada = dado.stop_reason === 'max_tokens'

  const buscas = Number(dado.usage?.server_tool_use?.web_search_requests ?? 0)
  const p = PRECO[MODELO] ?? PRECO['claude-opus-5']
  const custo =
    (Number(dado.usage?.input_tokens ?? 0) / 1e6) * p.entrada +
    (Number(dado.usage?.output_tokens ?? 0) / 1e6) * p.saida +
    buscas * CUSTO_POR_BUSCA_USD

  return { texto: ultimoTexto, lidas, buscas, custo, cortada }
}

function moldura(titulo) {
  console.log('\n  ' + '-'.repeat(66))
  console.log('  ' + titulo)
  console.log('  ' + '-'.repeat(66) + '\n')
}

function mostrarNota(n) {
  const situacao = n.descartada_em
    ? 'DESCARTADA em ' + quando(n.descartada_em)
    : n.problema
      ? 'QUEBRADA, nao pode ser aprovada'
      : n.aprovada_em
        ? 'VALENDO desde ' + quando(n.aprovada_em) + (n.aprovada_nome ? ' por ' + n.aprovada_nome : '')
        : 'PENDENTE, ainda nao vale para a geracao'
  moldura('Nota ' + n.id + '  ' + quando(n.quando) + '   [' + situacao + ']')
  for (const linha of String(n.texto).split('\n')) console.log('  ' + linha)

  const fontes = Array.isArray(n.fontes) ? n.fontes : []
  if (fontes.length > 0) {
    console.log('\n  Fontes citadas na nota:')
    for (const f of fontes) console.log('    ' + (f.titulo || '(sem titulo)') + '\n      ' + f.url)
  }

  const d = divergencia(fontes, Array.isArray(n.lidas) ? n.lidas : [])
  if (d.lidas > 0) {
    console.log('\n  Paginas que a API diz que foram lidas, por fonte:')
    for (const [dom, quantas] of d.porDominio) {
      console.log('    ' + String(quantas).padStart(3) + '  ' + dom)
    }
    if (d.citadas > 0) {
      console.log(
        '    ' +
          (d.naoCitadas === 0
            ? 'Tudo que foi lido esta citado.'
            : d.naoCitadas + ' pagina(s) lida(s) nao entraram na nota, o que e normal.'),
      )
      if (d.inventadas.length > 0) {
        console.log('\n  [atencao]  A nota cita ' + d.inventadas.length + ' endereco(s) que nao')
        console.log('             aparecem na lista de leituras da API:')
        for (const f of d.inventadas) console.log('               ' + f.url)
        console.log('             Confira antes de aprovar.')
      }
    }
  }

  if (n.buscas) {
    console.log(
      '\n  ' + n.buscas + ' pesquisa(s), custo ' + dolar(n.custo_usd) + '. Modelo: ' + (n.modelo ?? '?'),
    )
  }
  console.log('')
}

function quando(v) {
  if (!v) return '?'
  return new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function dolar(v) {
  const n = Number(v ?? 0)
  return 'US$ ' + (Number.isFinite(n) ? n.toFixed(4) : '0')
}

async function aValendo() {
  const [n] = await sql`
    select * from public.plataforma_nota
    where aprovada_em is not null and descartada_em is null
    order by aprovada_em desc limit 1
  `
  return n ?? null
}

async function aPendente() {
  const [n] = await sql`
    select * from public.plataforma_nota
    where aprovada_em is null and descartada_em is null
    order by quando desc limit 1
  `
  return n ?? null
}

/** Nota velha demais para continuar valendo sozinha. */
const DIAS_ATE_ENVELHECER = 45

/* ---------------------------------------------------------------- */

async function ver() {
  const valendo = await aValendo()
  const pendente = await aPendente()

  if (!valendo && !pendente) {
    console.log('\n  Nenhuma nota ainda. Rode a opcao de gerar.\n')
    return
  }

  if (valendo) {
    const dias = Math.floor((Date.now() - new Date(valendo.quando).getTime()) / 86400000)
    mostrarNota(valendo)
    if (dias > DIAS_ATE_ENVELHECER) {
      console.log('  [atencao]  Esta nota tem ' + dias + ' dias. Ela continua entrando em')
      console.log('             todo planejamento. Gere uma nova.\n')
    }
  } else {
    console.log('\n  Nenhuma nota aprovada. A geracao esta rodando sem esta fonte,')
    console.log('  que e o estado normal de antes desta funcionalidade existir.\n')
  }

  if (pendente) {
    console.log('  Ha uma nota pendente, esperando leitura:')
    mostrarNota(pendente)
    console.log('  Se concordar com ela, use a opcao de aprovar.\n')
  }
}

async function gerar(diasTexto) {
  const dias = Number(diasTexto) > 0 ? Math.min(365, Math.floor(Number(diasTexto))) : 30
  const plataformas = await plataformasEmUso()
  const ondeAtuam = await setores()
  if (ondeAtuam.length > 0) console.log('  Setores dos clientes: ' + ondeAtuam.join(', '))
  const r = await buscar(plataformas, dias, ondeAtuam)
  const nota = lerNota(r.texto)

  // Guardar mesmo quebrada, e marcar. Jogar fora perderia o que ja foi
  // pago; deixar sem marca deixaria aprovar. O banco recusa aprovar
  // nota com problema (migracao 0039), entao a marca e a trava.
  const problema = r.cortada
    ? 'a resposta foi cortada no teto de tokens'
    : nota.cru
      ? 'a resposta nao veio no formato esperado'
      : null

  const [gravada] = await sql`
    insert into public.plataforma_nota
      (periodo_dias, texto, fontes, lidas, buscas, custo_usd, modelo, problema)
    values (${dias}, ${nota.texto}, ${sql.json(nota.fontes)}, ${sql.json(r.lidas)},
            ${r.buscas}, ${r.custo}, ${MODELO}, ${problema})
    returning *
  `

  mostrarNota(gravada)

  if (problema) {
    console.log('  [PROBLEMA]  ' + problema + '.')
    console.log('              Esta nota NAO pode ser aprovada, e o banco recusa se voce')
    console.log('              tentar. Descarte (opcao 4) e gere outra.')
    if (r.cortada) {
      console.log('              Se repetir, peca um periodo menor: ' + dias + ' dias em')
      console.log('              ' + plataformas.length + ' plataforma(s) pode ser muito texto.')
    }
    console.log('')
    return
  }

  console.log('  A nota esta PENDENTE: ela ainda nao entra em planejamento nenhum.')
  console.log('  Leia o texto acima. Se concordar, use a opcao de aprovar.')
  console.log('  Se nao concordar, descarte e gere outra.\n')
}

async function aprovar() {
  const pendente = await aPendente()
  if (!pendente) {
    console.log('\n  Nao ha nota pendente para aprovar.\n')
    return
  }
  if (pendente.problema) {
    console.log('\n  A nota ' + pendente.id + ' chegou quebrada: ' + pendente.problema + '.')
    console.log('  Ela nao pode ser aprovada. Descarte (opcao 4) e gere outra.\n')
    return
  }
  await sql`
    update public.plataforma_nota
    set aprovada_em = now(), aprovada_nome = 'linha de comando (24-plataformas.cmd)'
    where id = ${pendente.id}
  `
  console.log('\n  Nota ' + pendente.id + ' aprovada. A partir de agora ela entra no')
  console.log('  prompt de todo planejamento novo, de todas as marcas.')
  console.log('  Os meses ja gerados nao mudam.\n')
}

async function descartar(motivo) {
  const pendente = await aPendente()
  if (!pendente) {
    console.log('\n  Nao ha nota pendente para descartar.\n')
    return
  }
  await sql`
    update public.plataforma_nota
    set descartada_em = now(), motivo = ${String(motivo ?? '').trim() || null}
    where id = ${pendente.id}
  `
  const valendo = await aValendo()
  console.log('\n  Nota ' + pendente.id + ' descartada. Ela fica gravada, para a proxima')
  console.log('  nao repetir o mesmo erro.')
  console.log(
    valendo
      ? '  Continua valendo a nota ' + valendo.id + ', de ' + quando(valendo.quando) + '.\n'
      : '  Nenhuma nota esta valendo agora.\n',
  )
}

async function historico() {
  const linhas = await sql`
    select id, quando, aprovada_em, descartada_em, buscas, custo_usd,
           left(texto, 90) as inicio
    from public.plataforma_nota order by quando desc limit 20
  `
  if (linhas.length === 0) {
    console.log('\n  Nenhuma nota ainda.\n')
    return
  }
  moldura('As ultimas ' + linhas.length + ' notas')
  let total = 0
  for (const l of linhas) {
    total += Number(l.custo_usd ?? 0)
    const situacao = l.descartada_em ? 'descartada' : l.aprovada_em ? 'aprovada  ' : 'pendente  '
    console.log('  ' + String(l.id).padStart(4) + '  ' + situacao + '  ' + quando(l.quando))
    console.log('        ' + String(l.inicio).replace(/\s+/g, ' ') + '...')
  }
  console.log('\n  Custo somado destas: ' + dolar(total) + '\n')
}

/* ---------------------------------------------------------------- */

const [, , comando, a, b] = process.argv

try {
  if (!comando || comando === 'ver') await ver()
  else if (comando === 'gerar') await gerar(a)
  else if (comando === 'aprovar') await aprovar()
  else if (comando === 'descartar') await descartar([a, b].filter(Boolean).join(' '))
  else if (comando === 'historico') await historico()
  else erroFatal('Nao conheco o comando "' + comando + '".', 'Use: ver, gerar, aprovar, descartar, historico.')
} catch (e) {
  erroFatal('Falhou: ' + (e && e.message ? e.message : String(e)))
} finally {
  await sql.end({ timeout: 5 })
}
