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
  const linhas = await sql`
    select distinct platform::text as p from public.content_channels
    where platform is not null
    union
    select distinct platform::text from public.brand_platforms
    where platform is not null
  `
  const achadas = linhas.map((l) => l.p).filter((p) => FONTES[p])
  // Sem nenhuma gravada, o padrao e onde a verba vai: Meta.
  return achadas.length > 0 ? achadas.sort() : ['instagram', 'facebook']
}

function pergunta(plataformas, dias) {
  const nomes = plataformas.join(', ')
  return `Voce e o pesquisador de uma agencia de comunicacao brasileira. Sua tarefa e uma so:
dizer o que MUDOU nestas plataformas nos ultimos ${dias} dias, lendo apenas o que a
propria plataforma publicou.

Plataformas: ${nomes}.

O QUE INTERESSA

Mudanca que afeta COMO uma peca e feita ou QUAL formato e objetivo existem:

- formato novo, formato aposentado, formato renomeado
- objetivo de campanha novo ou removido
- limite que mudou: duracao, proporcao, numero de caracteres, tamanho de arquivo
- recurso novo de publicacao ou de edicao
- regra de publicidade ou de rotulagem que muda o que pode ir na peca

O QUE NAO INTERESSA, E VOCE NAO DEVE ESCREVER

- qualquer afirmacao sobre o que performa melhor, rende mais ou tem mais alcance
- "boas praticas", dicas, melhores horarios, numero ideal de hashtags
- previsao sobre o que vai acontecer
- lancamento de produto que nao muda o trabalho de quem publica
- qualquer coisa sem data e sem link

Se nao houve mudanca relevante no periodo, DIGA ISSO. "Nada relevante mudou" e uma
resposta certa e util, e acontece na maioria das semanas. Encher a nota para parecer
produtiva e o pior resultado possivel: ela entra no planejamento de todas as marcas.

COMO ESCREVER

Portugues do Brasil. Nao use travessao (o sinal comprido) em lugar nenhum: use virgula,
dois-pontos ou parenteses. Seja curto. Cada item em uma ou duas frases, com a data entre
parenteses e o link. Sem adjetivo de propaganda.

RESPONDA SOMENTE COM JSON, nesta forma, e nada alem dele:

{
  "mudou": true ou false,
  "texto": "A nota inteira, ja pronta para ser lida por uma pessoa. Se mudou for false, uma frase dizendo que nada relevante mudou no periodo e nas plataformas olhadas.",
  "fontes": [{"titulo": "titulo da pagina", "url": "endereco exato"}]
}

Em "fontes" liste apenas paginas que voce realmente leu e usou no texto.`
}

async function buscar(plataformas, dias) {
  if (!CHAVE) {
    erroFatal(
      'Nao achei ANTHROPIC_API_KEY no .env.local.',
      'E a mesma chave que o site usa para gerar planejamento.',
    )
  }

  const dominios = [...new Set(plataformas.flatMap((p) => FONTES[p] ?? []))]
  console.log('  Plataformas: ' + plataformas.join(', '))
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
      max_tokens: 4000,
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
      messages: [{ role: 'user', content: pergunta(plataformas, dias) }],
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

  const buscas = Number(dado.usage?.server_tool_use?.web_search_requests ?? 0)
  const p = PRECO[MODELO] ?? PRECO['claude-opus-5']
  const custo =
    (Number(dado.usage?.input_tokens ?? 0) / 1e6) * p.entrada +
    (Number(dado.usage?.output_tokens ?? 0) / 1e6) * p.saida +
    buscas * CUSTO_POR_BUSCA_USD

  return { texto: ultimoTexto, lidas, buscas, custo, bruto: dado }
}

function moldura(titulo) {
  console.log('\n  ' + '-'.repeat(66))
  console.log('  ' + titulo)
  console.log('  ' + '-'.repeat(66) + '\n')
}

function mostrarNota(n) {
  const situacao = n.descartada_em
    ? 'DESCARTADA em ' + quando(n.descartada_em)
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
    if (dias > 45) {
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
  const r = await buscar(plataformas, dias)
  const nota = lerNota(r.texto)

  if (nota.cru) {
    console.log('  [atencao]  A resposta nao veio no formato esperado. Gravei o texto')
    console.log('             cru, sem lista de fontes. Leia com mais cuidado.\n')
  }

  const [gravada] = await sql`
    insert into public.plataforma_nota
      (periodo_dias, texto, fontes, lidas, buscas, custo_usd, modelo)
    values (${dias}, ${nota.texto}, ${sql.json(nota.fontes)}, ${sql.json(r.lidas)},
            ${r.buscas}, ${r.custo}, ${MODELO})
    returning *
  `

  mostrarNota(gravada)
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
