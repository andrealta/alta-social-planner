/**
 * Varre o Instagram dos concorrentes citados na base da marca.
 *
 * POR QUE UM SEGUNDO CAMINHO NA META
 *
 * O 16-instagram.cmd usa a "API do Instagram com login do Instagram"
 * (graph.instagram.com). Ela é simples e não pede Página do Facebook —
 * mas só sabe falar da PRÓPRIA conta. Não existe, nesse caminho,
 * nenhuma forma de perguntar sobre a conta de outra pessoa.
 *
 * Quem responde isso é o Business Discovery, que só existe no caminho
 * com login do Facebook (graph.facebook.com) e exige uma Página do
 * Facebook vinculada à conta profissional. Por isso este script tem
 * token próprio (META_TOKEN) e endereço próprio. Os dois caminhos
 * convivem: cada um faz o que o outro não faz.
 *
 * O QUE ELE TRAZ, E O QUE NÃO TRAZ
 *
 * Traz, de conta PROFISSIONAL e PÚBLICA: seguidores, número de
 * publicações, bio, e das publicações recentes a legenda, curtidas,
 * comentários, data, formato e link.
 *
 * Não traz Stories, não traz anúncios, não traz o texto dos
 * comentários, e não enxerga conta pessoal nem fechada. Tudo isso é
 * limite da API, não do script — e é melhor saber antes.
 *
 * O QUE ELE NÃO FAZ DE PROPÓSITO
 *
 * Ele não interpreta. Coleta, conta e guarda. Dizer "o setor está
 * saturado de X" e "ninguém está falando de Y" é leitura, e leitura
 * é trabalho da IA na hora de gerar o mês, com a base da marca do
 * lado. Script que tenta concluir sozinho vira palpite com cara de
 * número.
 *
 * O token nunca é impresso. Só o formato e o tamanho dele.
 *
 * Uso:
 *   node scripts/concorrentes.mjs            varre a marca "alta"
 *   node scripts/concorrentes.mjs habiarte   varre outra marca
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// Quantas publicações pedir por concorrente. Vinte e cinco cobre uns
// dois meses de quem posta com frequência — o suficiente para ver
// repetição, sem pagar por um histórico que ninguém vai ler.
const POR_CONCORRENTE = 25
const MARCA_PADRAO = 'alta'
const MINIMO_CARACTERES = 40

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

/**
 * Diz o que a chave parece ser, sem nunca mostrar o valor.
 *
 * Aqui o token CERTO é o do Facebook (EAA...), ao contrário do
 * 16-instagram.cmd, onde o certo é o do Instagram (IG...). Os dois
 * arquivos ficam lado a lado no .env.local e são fáceis de trocar de
 * lugar, então vale nomear o engano.
 */
export function formatoDoToken(v) {
  if (!v) return 'ausente'
  if (/^\d{6,}\|[A-Za-z0-9_-]{10,}$/.test(v)) {
    return `token de APLICATIVO (id|segredo), ${v.length} caracteres — NAO serve`
  }
  if (v.startsWith('EA')) return `token do Facebook (EA...), ${v.length} caracteres`
  if (v.startsWith('IG')) {
    return `token do Instagram (IG...), ${v.length} caracteres — e o do 16-instagram, nao serve aqui`
  }
  return `formato desconhecido, ${v.length} caracteres`
}

/** O que fazer, em português, para os erros que a Meta mais devolve aqui. */
export function conselho(mensagem) {
  const m = String(mensagem)
  if (/does not exist|cannot be loaded|\b803\b/i.test(m)) {
    return [
      'A Meta nao achou uma das contas. Tres causas, nesta ordem de',
      'frequencia: o @ esta escrito errado; a conta e PESSOAL (so',
      'profissional aparece aqui); ou a conta e fechada.',
      'Confira o @ abrindo instagram.com/o_arroba no navegador.',
    ]
  }
  if (/expired|\b190\b/i.test(m)) {
    return [
      'O token expirou. Gere outro: developers.facebook.com/tools/explorer,',
      'depois estenda em developers.facebook.com/tools/debug/accesstoken,',
      'no botao "Estender token de acesso" no rodape da pagina.',
    ]
  }
  if (/permission|scope|\b10\b|\b200\b/i.test(m)) {
    return [
      'Falta permissao no token. Ele precisa das quatro: instagram_basic,',
      'pages_show_list, pages_read_engagement e instagram_manage_insights.',
      'No Explorer, marque as quatro ANTES de clicar em gerar.',
    ]
  }
  if (/Unsupported get request|\b100\b/i.test(m)) {
    return [
      'A Meta nao reconheceu o pedido. Quase sempre e token da outra API:',
      'token do Instagram (IG...) fala com graph.instagram.com, e este',
      'script fala com graph.facebook.com. Gere o token pelo Explorer.',
    ]
  }
  if (/current user|\b2500\b/i.test(m)) {
    return [
      'Este e o erro de token de APLICATIVO — aquele no formato id|segredo.',
      'Ele nao representa pessoa nenhuma, entao nao ha Pagina para listar.',
      'No Explorer, o menu de cima precisa estar em "Token de usuario".',
    ]
  }
  return []
}

/** Comentário pesa mais que curtida: comentário é alguém que parou para escrever. */
export function engajamento(m) {
  return Number(m.like_count ?? 0) + Number(m.comments_count ?? 0) * 3
}

/**
 * Tira os @ do texto livre do campo Concorrentes.
 *
 * O campo é texto solto de propósito — a equipe escreve "Marca X
 * (@marcax), Marca Y" sem pensar em formato. O que der para consultar,
 * consulta-se; o que sobrar é devolvido em `semArroba` para a tela
 * pedir o @ que falta, em vez de sumir em silêncio.
 */
export function extrairArrobas(texto) {
  const t = String(texto ?? '')
  const arrobas = []
  const vistos = new Set()
  for (const m of t.matchAll(/@([A-Za-z0-9._]{2,30})/g)) {
    const h = m[1].replace(/\.+$/, '').toLowerCase()
    if (h && !vistos.has(h)) {
      vistos.add(h)
      arrobas.push(h)
    }
  }
  // Linhas (ou itens separados por vírgula) que não citam nenhum @.
  const semArroba = t
    .split(/[\n,;]+/)
    .map((x) => x.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter((x) => x.length > 1 && !x.includes('@'))
  return { arrobas, semArroba }
}

/** Resume uma conta: o que dá para contar sem interpretar nada. */
export function resumirConta(conta) {
  const midias = (conta.media?.data ?? []).filter(
    (m) => typeof m.caption === 'string' && m.caption.trim().length >= MINIMO_CARACTERES,
  )
  const formatos = {}
  for (const m of conta.media?.data ?? []) {
    const f = String(m.media_type ?? 'DESCONHECIDO')
    formatos[f] = (formatos[f] ?? 0) + 1
  }
  const pesos = midias.map(engajamento).sort((a, b) => a - b)
  const mediana = pesos.length === 0 ? 0 : pesos[Math.floor(pesos.length / 2)]
  const datas = (conta.media?.data ?? []).map((m) => String(m.timestamp ?? '')).filter(Boolean).sort()
  return {
    username: conta.username ?? '',
    nome: conta.name ?? '',
    seguidores: Number(conta.followers_count ?? 0),
    publicacoes: Number(conta.media_count ?? 0),
    bio: String(conta.biography ?? '').trim(),
    lidas: (conta.media?.data ?? []).length,
    comLegenda: midias.length,
    formatos,
    mediana,
    deQuando: datas[0] ? datas[0].slice(0, 10) : null,
    ateQuando: datas.length > 0 ? datas[datas.length - 1].slice(0, 10) : null,
    posts: midias
      .map((m) => ({
        texto: m.caption.trim(),
        curtidas: Number(m.like_count ?? 0),
        comentarios: Number(m.comments_count ?? 0),
        peso: engajamento(m),
        quando: String(m.timestamp ?? '').slice(0, 10) || null,
        tipo: String(m.media_type ?? ''),
        link: String(m.permalink ?? ''),
      }))
      .sort((a, b) => b.peso - a.peso),
  }
}

// ------------------------------------------------------------------
// Daqui para baixo só roda quando o arquivo é executado, não quando é
// importado pelo teste.
// ------------------------------------------------------------------
const executando =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/concorrentes.mjs')
if (!executando) {
  // importado para teste
} else {
  await principal()
}

async function principal() {
  const env = { ...lerEnvLocal(), ...process.env }
  const token = env.META_TOKEN
  const banco = env.DATABASE_URL
  const base = env.META_API || 'https://graph.facebook.com'
  const versao = env.META_API_VERSAO || 'v25.0'
  const API = `${base}/${versao}`
  const slug = (process.argv[2] || MARCA_PADRAO).toLowerCase()

  const linha = '--------------------------------------------------------'
  console.log('')
  console.log(linha)
  console.log(' 1. O que esta configurado')
  console.log(linha)
  console.log('')
  console.log('  marca                ' + slug)
  console.log('  META_TOKEN           ' + formatoDoToken(token))
  console.log('  DATABASE_URL         ' + (banco ? 'presente' : 'AUSENTE'))
  console.log('  versao da API        ' + versao)
  console.log('')

  if (!token) {
    console.log('PARA AQUI: falta a linha META_TOKEN no .env.local.')
    console.log('')
    console.log('  1. developers.facebook.com/tools/explorer')
    console.log('  2. escolha o seu app, e em cima deixe "Token de usuario"')
    console.log('  3. marque as permissoes: instagram_basic, pages_show_list,')
    console.log('     pages_read_engagement, instagram_manage_insights')
    console.log('  4. clique em gerar, faca o login e autorize a Pagina da Alta')
    console.log('  5. developers.facebook.com/tools/debug/accesstoken, cole o')
    console.log('     token e clique em "Estender token de acesso" (vale 60 dias)')
    console.log('  6. acrescente ao .env.local:')
    console.log('')
    console.log('     META_TOKEN=cole_o_token_estendido_aqui')
    console.log('')
    process.exit(1)
  }
  if (!banco || banco.includes('[YOUR-PASSWORD]')) {
    console.log('PARA AQUI: DATABASE_URL ausente ou incompleta no .env.local.')
    process.exit(1)
  }

  async function pegar(url) {
    const r = await fetch(url)
    const texto = await r.text()
    let corpo
    try {
      corpo = JSON.parse(texto)
    } catch {
      throw new Error(`resposta ilegivel da Meta (HTTP ${r.status}): ${texto.slice(0, 200)}`)
    }
    if (!r.ok || corpo.error) {
      const e = corpo.error ?? {}
      throw new Error(
        `a Meta recusou (HTTP ${r.status}): ${e.message ?? texto.slice(0, 200)}` +
          (e.code ? ` [codigo ${e.code}]` : ''),
      )
    }
    return corpo
  }

  let falhou = false
  let sql = null

  try {
    // ---------- 2. de quem e este token ----------
    console.log(linha)
    console.log(' 2. De quem e este token')
    console.log(linha)
    console.log('')

    const contas = await pegar(
      `${API}/me/accounts?fields=id,name,instagram_business_account{id,username}` +
        `&limit=50&access_token=${encodeURIComponent(token)}`,
    )
    const paginas = contas.data ?? []
    console.log('  Paginas do Facebook  ' + paginas.length)
    for (const p of paginas) {
      const ig = p.instagram_business_account
      console.log(`    ${p.name ?? '?'} ${ig ? '→ @' + (ig.username ?? ig.id) : '(sem Instagram vinculado)'}`)
    }
    console.log('')

    const comIg = paginas.filter((p) => p.instagram_business_account?.id)
    if (comIg.length === 0) {
      console.log('PARA AQUI: nenhuma Pagina com conta do Instagram vinculada.')
      console.log('')
      console.log('  No Instagram: Configuracoes > Central de Contas > Contas.')
      console.log('  A Pagina precisa aparecer ali junto da conta @altacomunicazione.')
      console.log('  Se ja aparece, o token pode nao ter a permissao pages_show_list.')
      process.exit(1)
    }
    const escolhida = env.META_PAGE_ID
      ? comIg.find((p) => p.id === env.META_PAGE_ID) ?? comIg[0]
      : comIg[0]
    const meuIg = escolhida.instagram_business_account
    console.log(`  consultando como     @${meuIg.username ?? meuIg.id} (Pagina "${escolhida.name}")`)
    if (comIg.length > 1) {
      console.log('  (ha mais de uma; para fixar outra, ponha META_PAGE_ID no .env.local)')
    }
    console.log('')

    // ---------- 3. quem sao os concorrentes ----------
    console.log(linha)
    console.log(' 3. Quem a base manda monitorar')
    console.log(linha)
    console.log('')

    sql = postgres(banco, {
      max: 1,
      prepare: false,
      ssl: banco.includes('localhost') ? false : 'require',
    })

    const [marca] = await sql`select id, name from brands where slug = ${slug}`
    if (!marca) {
      console.log(`  Nao achei a marca "${slug}". Rode o 06-carregar.cmd primeiro.`)
      process.exit(1)
    }

    const [ident] = await sql`
      select content from brand_knowledge
      where brand_id = ${marca.id} and section = 'identity'
    `
    const campo = String(ident?.content?.i_conc ?? '')
    const { arrobas, semArroba } = extrairArrobas(campo)

    console.log('  marca                ' + marca.name)
    console.log('  arrobas encontrados  ' + arrobas.length)
    for (const a of arrobas) console.log('    @' + a)
    if (semArroba.length > 0) {
      console.log('')
      console.log('  Citados sem @ (nao da para consultar):')
      for (const s of semArroba) console.log('    ' + s.slice(0, 60))
      console.log('  Acrescente o @ de cada um no campo Concorrentes da biblioteca.')
    }
    console.log('')

    if (arrobas.length === 0) {
      console.log('PARA AQUI: nenhum @ no campo Concorrentes.')
      console.log('')
      console.log('  Abra a marca no painel, secao Identidade, campo Concorrentes,')
      console.log('  e escreva os perfis assim:  Marca X (@marcax), Marca Y (@marcay)')
      console.log('')
      process.exit(1)
    }

    // ---------- 4. a varredura ----------
    console.log(linha)
    console.log(' 4. Lendo o Instagram de cada um')
    console.log(linha)
    console.log('')

    const campos =
      `business_discovery.username(%HANDLE%){username,name,biography,followers_count,media_count,` +
      `media.limit(${POR_CONCORRENTE}){caption,like_count,comments_count,timestamp,media_type,permalink}}`

    const achados = []
    const recusados = []

    for (const handle of arrobas) {
      try {
        const r = await pegar(
          `${API}/${meuIg.id}?fields=${campos.replace('%HANDLE%', handle)}` +
            `&access_token=${encodeURIComponent(token)}`,
        )
        const conta = r.business_discovery
        if (!conta) throw new Error('a Meta respondeu sem dados desta conta')
        const resumo = resumirConta(conta)
        achados.push(resumo)
        console.log(
          `  @${handle}`.padEnd(24) +
            `${resumo.lidas} post(s), ${resumo.comLegenda} com legenda, ` +
            `${resumo.seguidores.toLocaleString('pt-BR')} seguidores`,
        )
      } catch (e) {
        // Um concorrente fora do ar não pode derrubar a varredura dos
        // outros: quase sempre é conta pessoal ou @ digitado errado.
        const motivo = e.message.replace(/\s+/g, ' ').slice(0, 120)
        recusados.push({ handle, motivo })
        console.log(`  @${handle}`.padEnd(24) + 'NAO DEU: ' + motivo)
      }
    }
    console.log('')

    if (achados.length === 0) {
      console.log('PARA AQUI: nenhuma conta respondeu.')
      console.log('')
      for (const d of conselho(recusados[0]?.motivo ?? '')) console.log('  ' + d)
      console.log('')
      process.exit(1)
    }

    // ---------- 5. gravando ----------
    console.log(linha)
    console.log(' 5. Guardando a varredura')
    console.log(linha)
    console.log('')

    const [corrida] = await sql`
      insert into research_runs (brand_id, kind, status, queries, discarded, summary, finished_at)
      values (
        ${marca.id}, 'competitors', 'done',
        ${sql.json(arrobas)}, ${sql.json(recusados)},
        ${`${achados.length} conta(s) lida(s) de ${arrobas.length} citada(s).`},
        now()
      )
      returning id
    `

    let gravados = 0
    for (const c of achados) {
      for (const p of c.posts) {
        const titulo = p.texto.replace(/\s+/g, ' ').slice(0, 120)
        await sql`
          insert into research_sources
            (brand_id, research_run_id, title, publisher, handle, url, published_at,
             excerpt, summary, enables, relevance, metrics)
          values (
            ${marca.id}, ${corrida.id}, ${titulo}, ${c.nome || '@' + c.username},
            ${'@' + c.username}, ${p.link || null}, ${p.quando},
            ${p.texto.slice(0, 2000)},
            ${null}, ${null},
            ${p.peso >= c.mediana * 2 ? 'high' : 'medium'}::relevance,
            ${sql.json({ curtidas: p.curtidas, comentarios: p.comentarios, peso: p.peso, tipo: p.tipo })}
          )
        `
        gravados++
      }
    }

    console.log(`  varredura            ${corrida.id}`)
    console.log(`  publicacoes guardadas ${gravados}`)
    console.log('')

    // ---------- 6. o que veio ----------
    console.log(linha)
    console.log(' 6. O que veio, em numeros')
    console.log(linha)
    console.log('')
    for (const c of achados) {
      const fmt = Object.entries(c.formatos)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k.toLowerCase()} ${n}`)
        .join(', ')
      console.log(`  @${c.username} — ${c.nome || 'sem nome'}`)
      console.log(`    seguidores ${c.seguidores.toLocaleString('pt-BR')} · publicacoes ${c.publicacoes}`)
      console.log(`    lidas ${c.lidas} (${c.deQuando ?? '?'} a ${c.ateQuando ?? '?'}) · formatos: ${fmt || '—'}`)
      console.log(`    engajamento mediano ${c.mediana}`)
      if (c.posts[0]) {
        console.log(`    a de maior engajamento (${c.posts[0].peso}):`)
        console.log(`    "${c.posts[0].texto.replace(/\s+/g, ' ').slice(0, 140)}…"`)
      }
      console.log('')
    }

    console.log(linha)
    console.log('  Pronto. Isto e coleta, nao leitura: quem le e a IA na')
    console.log('  hora de gerar o mes, com a base da marca do lado.')
    console.log(linha)
  } catch (e) {
    falhou = true
    const mensagem = e && e.message ? e.message : String(e)
    console.error('')
    console.error('FALHOU: ' + mensagem)
    console.error('')
    const dicas = conselho(mensagem)
    if (dicas.length > 0) {
      console.error('O QUE ISSO QUER DIZER')
      console.error('')
      for (const d of dicas) console.error('  ' + d)
      console.error('')
    }
    console.error('Me mande esta tela inteira — o token nao aparece aqui.')
  } finally {
    if (sql) await sql.end({ timeout: 5 })
  }

  console.log('')
  process.exit(falhou ? 1 : 0)
}
