/**
 * A cotação do dólar: diagnosticar, buscar e preencher o passado.
 *
 * Por que este script existe: a página de Precisão busca a cotação do
 * dia sozinha, e no primeiro uso real ela não trouxe nada — o custo
 * continuou em dólar. O ambiente onde eu escrevo o código não alcança
 * as APIs de câmbio, então eu não tinha como ver o motivo. Este script
 * roda na máquina da Alta, que alcança, e mostra tudo: o endereço
 * chamado, o código HTTP, o começo da resposta crua e o que foi lido
 * dela. Erro que não se vê não se conserta.
 *
 * Ele também faz duas coisas úteis além de diagnosticar: registra a
 * cotação de hoje e preenche os dias passados que têm chamada de IA e
 * ainda não têm cotação. Sem o passado preenchido, a página converte
 * tudo pela cotação mais próxima que encontrar, que é uma aproximação
 * honesta mas é uma aproximação.
 *
 * Uso:
 *   node scripts/cotacao.mjs            busca a de hoje e preenche o que falta
 *   node scripts/cotacao.mjs ver        só mostra o que já está guardado
 *   node scripts/cotacao.mjs testar     só testa as fontes, não grava nada
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

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
const modo = (process.argv[2] || 'buscar').toLowerCase()
const linha = '--------------------------------------------------------'

/** O dia de hoje em Sao Paulo. E la que a agencia gasta. */
function hojeEmSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Dolar/real plausivel. Fora disto nao entra na conta de jeito nenhum. */
function plausivel(n) {
  const v = typeof n === 'string' ? Number(n.replace(',', '.')) : Number(n)
  return Number.isFinite(v) && v > 1 && v < 50 ? v : null
}

/**
 * As fontes, em ordem.
 *
 * Tres, e nao uma, porque a primeira ja falhou uma vez em producao
 * sem ninguem saber por que. Cada uma le o campo dela: parser generico
 * esconde qual fonte respondeu o que.
 */
const FONTES = [
  {
    nome: 'awesomeapi',
    url: 'https://economia.awesomeapi.com.br/last/USD-BRL',
    ler: (j) => plausivel(j?.USDBRL?.ask) ?? plausivel(j?.USDBRL?.bid),
  },
  {
    nome: 'frankfurter',
    url: 'https://api.frankfurter.app/latest?from=USD&to=BRL',
    ler: (j) => plausivel(j?.rates?.BRL),
  },
  {
    nome: 'ptax',
    url: (() => {
      // O PTAX so sai em dia util e no meio da tarde. Pedindo os
      // ultimos dez dias, pega o ultimo que existir.
      const d = new Date(Date.now() - 10 * 86400000)
      const f = (x) => `${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}-${x.getFullYear()}`
      return `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@di,dataFinalCotacao=@df)?@di='${f(d)}'&@df='${f(new Date())}'&$format=json`
    })(),
    ler: (j) => {
      const v = Array.isArray(j?.value) ? j.value[j.value.length - 1] : null
      return plausivel(v?.cotacaoVenda) ?? plausivel(v?.cotacaoCompra)
    },
  },
]

/** Chama uma fonte e conta tudo o que aconteceu. */
async function tentar(fonte) {
  process.stdout.write(`  ${fonte.nome.padEnd(13)} `)
  try {
    const r = await fetch(fonte.url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    const texto = await r.text()
    const tipo = r.headers.get('content-type') ?? '(sem tipo)'
    console.log(`HTTP ${r.status} · ${tipo}`)

    if (!r.ok) {
      console.log(`                resposta: ${texto.slice(0, 200).replace(/\s+/g, ' ')}`)
      return null
    }

    let json
    try {
      json = JSON.parse(texto)
    } catch {
      console.log('                a resposta nao e JSON:')
      console.log(`                ${texto.slice(0, 200).replace(/\s+/g, ' ')}`)
      return null
    }

    const valor = fonte.ler(json)
    if (valor === null) {
      // O caso que mais importa ver: respondeu, mas noutro formato.
      console.log('                respondeu, mas nao achei a cotacao no formato esperado:')
      console.log(`                ${texto.slice(0, 300).replace(/\s+/g, ' ')}`)
      return null
    }

    console.log(`                cotacao lida: ${valor}`)
    return valor
  } catch (e) {
    console.log(`FALHOU: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/** O historico de cada fonte que tem historico, para preencher o passado. */
async function historico(desde) {
  const dias = Math.max(1, Math.ceil((Date.now() - new Date(desde + 'T12:00:00Z').getTime()) / 86400000) + 2)
  const saida = new Map()

  try {
    const r = await fetch(
      `https://economia.awesomeapi.com.br/json/daily/USD-BRL/${Math.min(dias, 360)}`,
      { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) },
    )
    if (r.ok) {
      const j = await r.json()
      for (const item of Array.isArray(j) ? j : []) {
        const v = plausivel(item?.ask) ?? plausivel(item?.bid)
        const ts = Number(item?.timestamp)
        if (v === null || !Number.isFinite(ts)) continue
        const dia = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(ts * 1000))
        if (!saida.has(dia)) saida.set(dia, v)
      }
      console.log(`  historico      awesomeapi devolveu ${saida.size} dia(s)`)
    } else {
      console.log(`  historico      awesomeapi HTTP ${r.status}`)
    }
  } catch (e) {
    console.log(`  historico      awesomeapi falhou: ${e instanceof Error ? e.message : e}`)
  }

  return saida
}

async function mostrar() {
  const guardadas = await sql`
    select dia::text as dia, valor::float8 as valor, fonte
    from cotacao_dolar order by dia desc limit 15
  `
  console.log('')
  console.log('  Cotacoes guardadas (as 15 mais recentes):')
  if (guardadas.length === 0) {
    console.log('    nenhuma ainda.')
  } else {
    for (const c of guardadas) {
      console.log(`    ${c.dia}   R$ ${c.valor.toFixed(4)}   ${c.fonte}`)
    }
  }

  const faltando = await sql`
    select to_char(r.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
           count(*)::int as chamadas
    from ai_runs r
    where not exists (
      select 1 from cotacao_dolar c
      where c.dia = (r.created_at at time zone 'America/Sao_Paulo')::date
    )
    group by 1 order by 1
  `
  console.log('')
  if (faltando.length === 0) {
    console.log('  Todo dia com chamada de IA tem cotacao propria.')
  } else {
    console.log(`  Dias com chamada de IA e SEM cotacao propria: ${faltando.length}`)
    for (const f of faltando.slice(0, 20)) {
      console.log(`    ${f.dia}   ${f.chamadas} chamada(s)`)
    }
    console.log('')
    console.log('    A pagina converte esses pela cotacao mais proxima que achar.')
    console.log('    Funciona, mas e aproximacao. Rode sem argumento para preencher.')
  }
}

console.log('')
console.log(linha)
console.log(' Cotacao do dolar')
console.log(linha)

if (modo === 'ver') {
  await mostrar()
  console.log('')
  await sql.end()
  process.exit(0)
}

console.log('')
console.log('  Testando as fontes, uma a uma:')
console.log('')

let valorDeHoje = null
let fonteDeHoje = null
for (const f of FONTES) {
  const v = await tentar(f)
  if (v !== null && valorDeHoje === null) {
    valorDeHoje = v
    fonteDeHoje = f.nome
  }
}

console.log('')
if (valorDeHoje === null) {
  console.log('  NENHUMA fonte respondeu uma cotacao utilizavel.')
  console.log('  Me mande esta tela inteira: ela diz exatamente onde parou.')
  console.log('')
  await sql.end()
  process.exit(1)
}

console.log(`  Vale a primeira que respondeu: ${fonteDeHoje}, R$ ${valorDeHoje}`)

if (modo === 'testar') {
  console.log('  (modo testar: nada foi gravado)')
  console.log('')
  await sql.end()
  process.exit(0)
}

// ------------------------------------------------------------------
// Gravar
// ------------------------------------------------------------------
//
// Pela funcao do banco, nao por insert direto: e ela que recusa valor
// implausivel e que se nega a reescrever a cotacao de um dia que ja
// tem. A primeira cotacao do dia e a que vale, senao valores de meses
// fechados mudariam a cada vez que este script rodasse.
const hoje = hojeEmSaoPaulo()
const [{ registrar_cotacao: guardado }] = await sql`
  select public.registrar_cotacao(${hoje}::date, ${valorDeHoje}::numeric, ${fonteDeHoje}::text)
`
console.log('')
console.log(`  Hoje (${hoje}): R$ ${Number(guardado).toFixed(4)} guardado.`)

// ------------------------------------------------------------------
// Preencher o passado
// ------------------------------------------------------------------
const [primeira] = await sql`
  select to_char(min(created_at) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia from ai_runs
`
if (primeira?.dia) {
  console.log('')
  console.log(`  Buscando o historico desde ${primeira.dia}:`)
  const passado = await historico(primeira.dia)

  let gravados = 0
  for (const [dia, valor] of [...passado.entries()].sort()) {
    if (dia >= hoje) continue
    const [{ registrar_cotacao: v }] = await sql`
      select public.registrar_cotacao(${dia}::date, ${valor}::numeric, 'awesomeapi-historico'::text)
    `
    if (Number(v) === valor) gravados++
  }
  console.log(`  ${gravados} dia(s) do passado gravados (os que ja existiam ficaram como estavam).`)
}

await mostrar()
console.log('')
console.log('  Pronto. Abra a pagina de Precisao: os valores devem aparecer em real.')
console.log('')
await sql.end()
