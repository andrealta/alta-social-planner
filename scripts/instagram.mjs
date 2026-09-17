/**
 * Traz as legendas reais do Instagram para a base da marca.
 *
 * POR QUE ESTE CAMINHO, E NÃO O BOTÃO NA TELA
 *
 * A API oficial da Meta só devolve mídia de conta que autorizou o app.
 * Para conta de CLIENTE isso exige o fluxo OAuth completo e revisão do
 * app pela Meta — semanas de espera antes do primeiro resultado. Para a
 * PRÓPRIA conta, adicionada no painel de desenvolvedor, a Meta concede
 * acesso padrão e um token de longa duração direto, sem revisão.
 *
 * Este script usa o caminho curto: o token que você gerou no painel
 * fica no seu .env.local, na sua máquina, e nada disso vai para o site
 * nem para o GitHub. Serve para responder uma pergunta antes de
 * investir no caminho grande: as legendas reais melhoram mesmo o texto
 * que a IA escreve?
 *
 * O QUE ELE FAZ
 *
 *   1. confere de quem é o token (nome do perfil, tipo de conta);
 *   2. busca as legendas mais recentes;
 *   3. escolhe as melhores — por engajamento, quando a API devolve, ou
 *      pelas mais novas quando não devolve;
 *   4. grava no campo "Legendas reais da marca" da base, preservando o
 *      que você tiver escrito à mão ali;
 *   5. renova o token por mais 60 dias e grava o novo no .env.local,
 *      com cópia de segurança do arquivo.
 *
 * O token nunca é impresso. Só o formato e o tamanho dele.
 *
 * Uso:
 *   node scripts/instagram.mjs            traz para a marca "alta"
 *   node scripts/instagram.mjs habiarte   traz para outra marca
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://graph.instagram.com'

// Quantas legendas buscar e quantas guardar. Vinte e cinco é o que cabe
// no prompt sem empurrar o resto do contexto para fora.
const BUSCAR = 60
const GUARDAR = 25
const MINIMO_CARACTERES = 60
const MARCA_PADRAO = 'alta'

// A linha que separa o que veio do Instagram do que foi escrito à mão.
// Tudo a partir dela é reescrito a cada execução; o que está acima,
// nunca. O leitor de amostras ignora linhas que começam com "===".
const MARCADOR = '=== legendas trazidas do Instagram'

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
 * Os três formatos existem e são fáceis de confundir, porque saem de
 * telas parecidas no painel da Meta:
 *
 *   IG...            token do Instagram. É este que serve.
 *   EAA...           token do Facebook. Outra API, outro endereço.
 *   123456|abcdef    token de APLICATIVO. Não representa pessoa
 *                    nenhuma, então nem existe "conta" para consultar.
 *
 * Reconhecer o formato aqui vale mais que a mensagem da Meta lá na
 * frente: "An active access token must be used to query information
 * about the current user" não diz a ninguém que o problema é o tipo
 * do token.
 */
function formatoDoToken(v) {
  if (!v) return 'ausente'
  if (/^\d{6,}\|[A-Za-z0-9_-]{10,}$/.test(v)) {
    return `token de APLICATIVO (id|segredo), ${v.length} caracteres — NAO serve`
  }
  if (v.startsWith('IG')) return `token do Instagram (IG...), ${v.length} caracteres`
  if (v.startsWith('EA')) return `token do Facebook (EA...), ${v.length} caracteres — outra API`
  return `formato desconhecido, ${v.length} caracteres`
}

/** O que fazer, em português, para os erros que a Meta mais devolve aqui. */
function conselho(mensagem) {
  const m = String(mensagem)
  if (/current user|\b2500\b/i.test(m)) {
    return [
      'Este e o erro de token de APLICATIVO ou de token sem usuario.',
      'O token do Instagram sai do painel do app, no produto Instagram,',
      'na pagina de configuracao da API com login do Instagram — no botao',
      'de gerar token ao lado da conta que voce adicionou. Ele comeca com',
      '"IG" e tem mais de cem caracteres.',
    ]
  }
  if (/expired|\b190\b/i.test(m)) {
    return [
      'O token expirou ou foi invalidado. Gere outro no painel da Meta.',
      'Token do Instagram vale 60 dias, e este script renova sozinho a',
      'cada execucao — mas so enquanto ele ainda estiver vivo.',
    ]
  }
  if (/permission|scope|\b10\b|\b200\b/i.test(m)) {
    return [
      'Falta permissao. Confira se o app pediu o escopo',
      'instagram_business_basic e se a conta @ da marca aceitou o convite',
      'no app do Instagram, em Configuracoes > Apps e sites.',
    ]
  }
  if (/Unsupported get request|\b100\b/i.test(m)) {
    return [
      'A Meta nao reconheceu o pedido. Isso acontece quando o token e de',
      'outra API: token do Facebook (EAA...) fala com graph.facebook.com,',
      'e este script fala com graph.instagram.com. Gere o token do',
      'Instagram, ou me avise que eu ensino o script a usar o outro caminho.',
    ]
  }
  return []
}

const env = { ...lerEnvLocal(), ...process.env }
const token = env.IG_TOKEN
const banco = env.DATABASE_URL
const slug = (process.argv[2] || MARCA_PADRAO).toLowerCase()

const linha = '--------------------------------------------------------'
console.log('')
console.log(linha)
console.log(' 1. O que esta configurado')
console.log(linha)
console.log('')
console.log('  marca de destino     ' + slug)
console.log('  IG_TOKEN             ' + formatoDoToken(token))
console.log('  DATABASE_URL         ' + (banco ? 'presente' : 'AUSENTE'))
console.log('')

if (!token) {
  console.log('PARA AQUI: falta a linha IG_TOKEN no .env.local.')
  console.log('')
  console.log('Pegue o token no painel da Meta (developers.facebook.com), na')
  console.log('configuracao do produto Instagram do seu app, no botao de gerar')
  console.log('token para a conta que voce adicionou. Depois acrescente ao')
  console.log('.env.local a linha:')
  console.log('')
  console.log('  IG_TOKEN=cole_o_token_aqui')
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

  const eu = await pegar(
    `${API}/me?fields=id,username,account_type,media_count&access_token=${encodeURIComponent(token)}`,
  )
  console.log('  perfil               @' + (eu.username ?? '?'))
  console.log('  tipo de conta        ' + (eu.account_type ?? '?'))
  console.log('  publicacoes          ' + (eu.media_count ?? '?'))
  console.log('')

  if (eu.account_type && !/BUSINESS|CREATOR|MEDIA_CREATOR/i.test(String(eu.account_type))) {
    console.log('  Atencao: a API oficial so devolve midia de conta profissional')
    console.log('  (Empresa ou Criador de conteudo). Troque o tipo da conta no app')
    console.log('  do Instagram e gere o token de novo.')
    console.log('')
  }

  // ---------- 3. as legendas ----------
  console.log(linha)
  console.log(' 3. Buscando as legendas')
  console.log(linha)
  console.log('')

  const camposRicos = 'id,caption,media_type,permalink,timestamp,like_count,comments_count'
  const camposBasicos = 'id,caption,media_type,permalink,timestamp'

  async function buscarMidia(campos) {
    const itens = []
    let url = `${API}/me/media?fields=${campos}&limit=25&access_token=${encodeURIComponent(token)}`
    while (url && itens.length < BUSCAR) {
      const pagina = await pegar(url)
      itens.push(...(pagina.data ?? []))
      url = pagina.paging?.next ?? null
    }
    return itens
  }

  let midias = []
  let comEngajamento = true
  try {
    midias = await buscarMidia(camposRicos)
  } catch (e) {
    // like_count e comments_count dependem da permissao concedida. Sem
    // eles a escolha passa a ser por data — pior, mas funciona. Cair
    // fora aqui seria desistir por causa do critério de ordenação.
    console.log('  (sem numeros de engajamento: ' + e.message.slice(0, 90) + ')')
    console.log('  (seguindo pelas mais recentes)')
    console.log('')
    comEngajamento = false
    midias = await buscarMidia(camposBasicos)
  }

  console.log('  publicacoes lidas    ' + midias.length)

  const candidatas = midias
    .filter((m) => typeof m.caption === 'string' && m.caption.trim().length >= MINIMO_CARACTERES)
    .map((m) => ({
      texto: m.caption.trim(),
      quando: m.timestamp ?? '',
      link: m.permalink ?? '',
      tipo: m.media_type ?? '',
      peso: comEngajamento
        ? Number(m.like_count ?? 0) + Number(m.comments_count ?? 0) * 3
        : 0,
    }))

  console.log('  com legenda de verdade ' + candidatas.length)

  if (candidatas.length === 0) {
    console.log('')
    console.log('  Nenhuma legenda com pelo menos ' + MINIMO_CARACTERES + ' caracteres.')
    console.log('  Nada a gravar. Me mande esta tela.')
    process.exit(1)
  }

  // Comentário pesa mais que curtida: comentário é alguém que parou
  // para escrever. Sem engajamento na mão, vale a data.
  const escolhidas = [...candidatas]
    .sort((a, b) => (comEngajamento ? b.peso - a.peso : b.quando.localeCompare(a.quando)))
    .slice(0, GUARDAR)

  const media = Math.round(
    escolhidas.reduce((s, c) => s + c.texto.length, 0) / escolhidas.length,
  )
  console.log('  escolhidas           ' + escolhidas.length + (comEngajamento ? ' (as de maior engajamento)' : ' (as mais recentes)'))
  console.log('  tamanho medio        ' + media + ' caracteres')
  console.log('')
  console.log('  amostra do que veio:')
  console.log('  "' + escolhidas[0].texto.replace(/\s+/g, ' ').slice(0, 150) + '…"')
  console.log('')

  // ---------- 4. gravando na base ----------
  console.log(linha)
  console.log(' 4. Gravando na base da marca')
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

  const [atual] = await sql`
    select content from brand_knowledge
    where brand_id = ${marca.id} and section = 'voice'
  `
  const conteudo = (atual?.content ?? {})
  const anterior = typeof conteudo.v_amostras === 'string' ? conteudo.v_amostras : ''

  // O que a pessoa escreveu fica; o bloco do Instagram é substituído.
  const i = anterior.indexOf(MARCADOR)
  const manual = (i >= 0 ? anterior.slice(0, i) : anterior).trimEnd()

  const hoje = new Date().toLocaleDateString('pt-BR')
  const bloco =
    `${MARCADOR} em ${hoje}, @${eu.username ?? slug} ===\n` +
    escolhidas.map((c) => '---\n' + c.texto).join('\n')

  const novo = (manual ? manual + '\n\n' : '') + bloco

  conteudo.v_amostras = novo

  await sql`
    insert into brand_knowledge (brand_id, section, content)
    values (${marca.id}, 'voice'::knowledge_section, ${sql.json(conteudo)})
    on conflict (brand_id, section) do update
      set content = excluded.content, updated_at = now()
  `

  console.log(`  ${marca.name}: campo "Legendas reais da marca" atualizado.`)
  console.log(`  ${escolhidas.length} legendas do Instagram` + (manual ? ', e o que voce escreveu a mao foi preservado acima.' : '.'))
  console.log('')

  // ---------- 5. renovando o token ----------
  console.log(linha)
  console.log(' 5. Renovando o token')
  console.log(linha)
  console.log('')

  try {
    const novoToken = await pegar(
      `${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
    )
    const valor = novoToken.access_token
    const dias = Math.round(Number(novoToken.expires_in ?? 0) / 86400)

    if (valor && valor !== token) {
      copyFileSync(caminhoEnv, caminhoEnv + '.bak')
      const texto = readFileSync(caminhoEnv, 'utf8')
      const trocado = texto.replace(/^(\s*IG_TOKEN\s*=).*$/m, `$1${valor}`)
      if (trocado === texto) {
        console.log('  Token novo recebido, mas nao achei a linha IG_TOKEN para trocar.')
        console.log('  Nada foi alterado no arquivo. Gere o token de novo quando expirar.')
      } else {
        writeFileSync(caminhoEnv, trocado)
        console.log(`  Token renovado por mais ${dias} dias e gravado no .env.local.`)
        console.log('  (copia do arquivo anterior em .env.local.bak)')
      }
    } else {
      console.log(`  A Meta devolveu o mesmo token, valido por ${dias} dias. Nada a trocar.`)
    }
  } catch (e) {
    // Token com menos de 24 horas não pode ser renovado. Não é falha.
    console.log('  Nao renovei agora: ' + e.message.slice(0, 120))
    console.log('  Se o token foi gerado hoje, isto e normal — a Meta exige 24h.')
  }

  console.log('')
  console.log(linha)
  console.log('  Pronto. Gere um mes novo da marca e compare com o anterior.')
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
