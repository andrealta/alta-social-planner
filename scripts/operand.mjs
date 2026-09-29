/**
 * Traz para dentro do planner o que está sendo produzido no Operand.
 *
 * O PLANNER sabe o que foi planejado e o que o cliente aprovou. O
 * OPERAND sabe o que está em produção. Hoje são duas verdades em dois
 * sistemas, e quem quer saber se a peça de quinta já está com o
 * designer precisa abrir o outro. Este script copia a segunda verdade
 * para dentro da primeira.
 *
 * É MÃO ÚNICA, E É DE PROPÓSITO
 *
 * Daqui só saem perguntas. Criar job no Operand quando o cliente
 * aprova é a metade seguinte, e só faz sentido depois desta rodar sem
 * susto por umas semanas: escrever no sistema que a agência usa todo
 * dia é o tipo de coisa que se faz com o caminho de volta conhecido.
 *
 * POR QUE AQUI, E NÃO NO SITE
 *
 * O segredo do Operand nunca precisa viajar para a Vercel, e o mês do
 * cliente não pode depender de um sistema de terceiro estar no ar na
 * hora em que alguém abre o calendário. O site lê a cópia local; quem
 * fala com o Operand é este arquivo.
 *
 * O TOKEN
 *
 * Gere em Módulos e Funções, seção API Operand, e guarde no .env.local
 * como OPERAND_TOKEN. Ele nunca é impresso: só o formato e o tamanho.
 * Ele também não é o token que vai nas requisições, é o que serve para
 * PEDIR aquele, em /login. Nunca mande nenhum dos dois por conversa ou
 * e-mail.
 *
 * Uso:
 *   node scripts/operand.mjs rede                  a rede daqui alcança o Operand?
 *   node scripts/operand.mjs conferir              a conexão funciona?
 *   node scripts/operand.mjs sondar                quais rotas respondem?
 *   node scripts/operand.mjs cru /beta/...         mostra a resposta crua de uma rota
 *   node scripts/operand.mjs clientes              os clientes que têm job
 *   node scripts/operand.mjs clientes queens        procura pelo nome
 *   node scripts/operand.mjs marcas                mostra as ligações daqui
 *   node scripts/operand.mjs ligar queensberry 486 liga uma marca a um cliente
 *   node scripts/operand.mjs desligar queensberry  desfaz a ligação
 *   node scripts/operand.mjs jobs queensberry      o que viria, sem gravar
 *   node scripts/operand.mjs perfil queensberry    monta o retrato de producao
 *   node scripts/operand.mjs sincronizar           traz os jobs de todas
 *   node scripts/operand.mjs sincronizar queensberry
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import {
  abrirSessao,
  listarClientes,
  listarJobs,
  ErroOperand,
  OPERAND_BASE,
  causaDeRede,
  explicarRede,
  extrairRegistros,
  pareceCom,
  marcaDoJob,
  forcaDaLinha,
} from './operand-api.mjs'
import { montarPerfil, perfilEmTexto } from './operand-perfil.mjs'

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

/** Diz o que a chave parece ser, sem nunca mostrar o valor. */
function formatoDaChave(v) {
  if (!v) return 'não encontrada'
  return `${v.length} caracteres, começa com "${v.slice(0, 3)}…"`
}

const env = { ...lerEnvLocal(), ...process.env }
const TOKEN = env.OPERAND_TOKEN
const URL_BANCO = env.DATABASE_URL

function erroFatal(mensagem, ajuda) {
  console.error('\n  ' + mensagem)
  if (ajuda) console.error('  ' + ajuda)
  console.error('')
  process.exit(1)
}

if (!URL_BANCO) {
  erroFatal(
    'Não achei DATABASE_URL no .env.local.',
    'Ela é a conexão direta com o Supabase e nunca vai para a Vercel.',
  )
}

const sql = postgres(URL_BANCO, { prepare: false, idle_timeout: 5 })

// -------------------------------------------------------------

async function comSessao() {
  if (!TOKEN) {
    erroFatal(
      'Não achei OPERAND_TOKEN no .env.local.',
      'Gere em Módulos e Funções, seção API Operand, e cole lá. Nunca mande por conversa.',
    )
  }
  return abrirSessao(TOKEN, fetch)
}

/**
 * Descobre POR QUE a conexão não sai daqui.
 *
 * Existe porque "fetch failed" não diz nada e as causas possíveis
 * pedem providências opostas: endereço errado se resolve mudando uma
 * linha, firewall se resolve falando com quem cuida da rede, e
 * certificado recusado se resolve no antivírus da máquina.
 *
 * NENHUM TOKEN SAI DAQUI. As tentativas são todas anônimas, um GET
 * simples. O token só entra no `conferir`, e só no endereço oficial.
 */
async function rede() {
  const dns = await import('node:dns/promises')
  const oficial = new URL(OPERAND_BASE).hostname

  console.log('  Node: ' + process.version)
  const nomesDeProxy = ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']
  const proxies = nomesDeProxy.filter((n) => env[n])
  console.log('  Proxy configurado: ' + (proxies.length ? proxies.join(', ') : 'nenhum'))
  console.log('  NODE_EXTRA_CA_CERTS: ' + (env.NODE_EXTRA_CA_CERTS ? 'definido' : 'não definido'))

  // Os outros nomes entram como comparação: se nenhum resolver, o
  // problema é a rede; se só o oficial falhar, o endereço é que está
  // errado.
  const candidatos = [oficial, 'api.operand.com.br', 'app.operand.com.br', 'operand.com.br']
  const vivos = []

  console.log('\n  Nomes:')
  for (const host of candidatos) {
    try {
      const achados = await dns.lookup(host, { all: true })
      const ips = achados.map((x) => x.address).join(', ')
      console.log(`    ${host}: ${ips}${host === oficial ? '   <- o configurado' : ''}`)
      vivos.push(host)
    } catch (e) {
      const c = causaDeRede(e)
      console.log(`    ${host}: não resolve (${c ? c.codigo : 'erro'})${host === oficial ? '   <- o configurado' : ''}`)
    }
  }

  console.log('\n  Conexão segura (sem token, só para ver se abre):')
  for (const host of vivos) {
    const alvo = `https://${host}/`
    try {
      const r = await fetch(alvo, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      })
      console.log(`    ${host}: respondeu ${r.status}`)
    } catch (e) {
      const c = causaDeRede(e)
      console.log(`    ${host}: falhou (${c ? c.codigo : (e && e.message) || 'erro'})`)
      if (c) console.log(`             ${explicarRede(c.codigo)}`)
    }
  }

  console.log('\n  Endereço configurado: ' + OPERAND_BASE)
  console.log('  Se nenhum nome resolveu, o bloqueio é da rede ou do antivírus.')
  console.log('  Se só o configurado falhou, o endereço da API é que mudou.')
}

/**
 * Mostra a resposta de uma rota exatamente como ela veio.
 *
 * Existe porque a documentação do Operand nomeia a mesma coisa de
 * três jeitos e não mostra um exemplo de resposta real. Quando a
 * conexão funciona mas vem zero registro, a pergunta é sempre a
 * mesma: o embrulho é outro, o nome do campo é outro, ou a lista é
 * vazia mesmo? Só o corpo cru responde isso.
 */
async function cru(caminho) {
  if (!caminho) {
    erroFatal('Falta a rota.', 'Exemplo: node scripts/operand.mjs cru /beta/entity/clients')
  }
  const sessao = await comSessao()
  const corpo = await sessao.pedir(caminho)

  const tipo = Array.isArray(corpo) ? 'lista' : corpo === null ? 'vazio' : typeof corpo
  console.log('  Rota: ' + caminho)
  console.log('  Tipo da resposta: ' + tipo)
  if (corpo && typeof corpo === 'object' && !Array.isArray(corpo)) {
    console.log('  Chaves de primeiro nível: ' + Object.keys(corpo).join(', '))
  }
  const achados = extrairRegistros(corpo)
  console.log(`  Registros que o leitor encontrou: ${achados.length}`)
  if (achados.length > 0) {
    console.log('  Campos do primeiro registro: ' + Object.keys(achados[0]).join(', '))
  }

  // A listagem de verdade nunca chama a rota pelada: ela sempre manda
  // limit e offset. Se a rota engasgar com isso, o sintoma seria
  // exatamente este, rota certa e lista vazia. Melhor descobrir agora.
  try {
    const comPagina = await sessao.pedir(caminho, { query: { limit: 100, offset: 0 } })
    console.log(`  Com limit=100 e offset=0: ${extrairRegistros(comPagina).length} registro(s)`)
  } catch (e) {
    const st = e instanceof ErroOperand ? e.status : '?'
    console.log(`  Com limit=100 e offset=0: a rota recusou (${st})`)
  }

  const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo, null, 2)
  const teto = 4000
  console.log('\n  Corpo:\n')
  console.log(texto.length > teto ? texto.slice(0, teto) + '\n  […corpo cortado aqui]' : texto)
}

/**
 * Bate em várias rotas candidatas e diz o que cada uma respondeu.
 *
 * Separa em uma rodada só as três hipóteses de "veio zero": a rota
 * não existe (404), o token não alcança aquela parte (403), ou a
 * rota responde certo e o cadastro está vazio mesmo.
 */
async function sondar() {
  const sessao = await comSessao()
  const rotas = [
    '/beta/entity/clients',
    '/beta/clients',
    '/beta/entity/persons',
    '/beta/entity/client',
    '/beta/projects',
    '/beta/jobs',
    '/beta/tasks',
  ]
  console.log('  Rota                      Resposta\n')
  for (const rota of rotas) {
    try {
      const corpo = await sessao.pedir(rota)
      const n = extrairRegistros(corpo).length
      const chaves =
        corpo && typeof corpo === 'object' && !Array.isArray(corpo)
          ? ' [' + Object.keys(corpo).slice(0, 4).join(', ') + ']'
          : ''
      console.log(`  ${rota.padEnd(24)}  200, ${n} registro(s)${chaves}`)
    } catch (e) {
      const status = e instanceof ErroOperand ? e.status : '?'
      console.log(`  ${rota.padEnd(24)}  ${status}`)
    }
  }
  console.log('\n  404 quer dizer rota errada. 403 quer dizer token sem alcance.')
  console.log('  200 com zero registro quer dizer que o embrulho da resposta mudou.')
  console.log('  Nesse caso, o passo seguinte e a opcao 4 do menu, com a rota que respondeu.')
}

/**
 * Uma frase dizendo o que ficou de fora e por que.
 *
 * Sem isso, "584 viraram 40" e um numero que a pessoa tem que aceitar
 * na fe. Com isso, e uma conta que ela pode conferir.
 */
function explicarDescartes(d) {
  if (!d) return ''
  const partes = []
  if (d.naoJob) partes.push(`${d.naoJob} nao eram job`)
  if (d.semId) partes.push(`${d.semId} sem numero`)
  if (d.apagado) partes.push(`${d.apagado} apagado(s) no Operand`)
  if (d.semData) partes.push(`${d.semData} sem data nenhuma`)
  if (d.velho) partes.push(`${d.velho} com mais de um ano`)
  if (d.repetido) partes.push(`${d.repetido} repetido(s)`)
  return partes.length ? 'Ficaram de fora: ' + partes.join(', ') + '.' : 'Nada ficou de fora.'
}

/** Minutos viram "3h20", que e como se fala de tempo de trabalho. */
function horas(minutos) {
  const bruto = Number(minutos)
  if (!Number.isFinite(bruto) || bruto <= 0) return '0h'
  const m = Math.round(bruto)
  const h = Math.floor(m / 60)
  const resto = m % 60
  if (h === 0) return `${resto}min`
  return resto === 0 ? `${h}h` : `${h}h${String(resto).padStart(2, '0')}`
}

/**
 * Mostra o que a sincronizacao TRARIA, sem gravar nada.
 *
 * Existe para a primeira vez: antes de escrever a producao da agencia
 * dentro do planner, vale olhar o que vem. Se vier coisa de 2020 ou
 * job de outro cliente, melhor descobrir com uma listagem do que com
 * uma tabela cheia.
 */
async function jobs(slug) {
  if (!slug) {
    erroFatal('Falta a marca.', 'Exemplo: node scripts/operand.mjs jobs queensberry')
  }
  const [marca] = await sql`
    select id, name, slug, operand_client_id from public.brands where slug = ${slug}
  `
  if (!marca) erroFatal(`Nao achei a marca "${slug}".`)
  if (!marca.operand_client_id) {
    erroFatal(
      `A marca "${slug}" ainda nao esta ligada a um cliente do Operand.`,
      'Ligue pela opcao 7 do menu, ou: node scripts/operand.mjs ligar ' + slug + ' 1234',
    )
  }

  const sessao = await comSessao()
  const { jobs: lista, descartes, recebidos } = await listarJobs(
    sessao,
    Number(marca.operand_client_id),
  )
  if (lista.length === 0) {
    console.log(`  ${marca.name}: nenhum job recente no Operand.`)
    console.log('  Isso pode ser o cliente certo sem trabalho aberto, ou o id errado.')
    return
  }

  console.log(`  ${marca.name}: ${lista.length} job(s) que entrariam, de ${recebidos} linha(s).`)
  console.log('  ' + explicarDescartes(descartes) + '\n')
  const porPrazo = [...lista].sort((a, b) => String(a.prazo ?? '9999').localeCompare(String(b.prazo ?? '9999')))
  for (const j of porPrazo.slice(0, 40)) {
    // "2h55 de 0h" nao quer dizer nada. Sem orcamento, mostra so o
    // que foi apontado, que e o unico numero que existe.
    const tempo = j.tempoEstimado
      ? `   ${horas(j.tempoTrabalhado ?? 0)} de ${horas(j.tempoEstimado)}`
      : j.tempoTrabalhado
        ? `   ${horas(j.tempoTrabalhado)}`
        : ''
    console.log(
      `  ${String(j.jobId).padStart(7)}  ${j.prazo ?? '(sem prazo)'}  ${j.statusNome ?? '-'}` +
        `  ${j.titulo}${tempo}`,
    )
  }
  if (porPrazo.length > 40) console.log(`\n  ...e mais ${porPrazo.length - 40}.`)

  const orcado = lista.reduce((t, j) => t + (j.tempoEstimado ?? 0), 0)
  const gasto = lista.reduce((t, j) => t + (j.tempoTrabalhado ?? 0), 0)
  console.log(
    orcado > 0
      ? `\n  Somando: ${horas(gasto)} apontadas de ${horas(orcado)} orcadas.`
      : `\n  Somando: ${horas(gasto)} apontadas. Nenhum job tem tempo orcado no Operand.`,
  )

  // Os dois numeros lado a lado. O primeiro e o job no Operand; o
  // segundo e como a equipe se refere a ele dentro do cliente.
  console.log('\n  Numeros dos tres primeiros:')
  for (const j of lista.slice(0, 3)) {
    console.log(
      `    job=${j.jobId}   numero no cliente=${j.itemId ?? '-'}   ${j.titulo.slice(0, 44)}`,
    )
  }
  console.log('\n  Nada foi gravado. Para gravar, use a opcao 10 do menu.')
}

async function conferir() {
  console.log('  Token do Operand: ' + formatoDaChave(TOKEN))
  const sessao = await comSessao()
  const clientes = await listarClientes(sessao)
  console.log(`  Conexão certa. O Operand respondeu com ${clientes.length} cliente(s).`)
  if (clientes.length === 0) {
    console.log('\n  Zero cliente pode ser três coisas, e elas se resolvem diferente:')
    console.log('  a rota mudou, o token não alcança o cadastro, ou o embrulho da')
    console.log('  resposta tem outro formato. Para descobrir qual:')
    console.log('\n    node scripts/operand.mjs sondar')
    return
  }
  if (sessao.entrouDeNovo() > 0) {
    console.log('  [nota]  O token autenticado caiu no meio e foi renovado.')
    console.log('          Se isso acontecer sempre, a validade é curta e vale avisar o suporte.')
  }
  console.log('\n  Próximo passo: node scripts/operand.mjs clientes')
}

/**
 * Monta o retrato de producao da marca e guarda.
 *
 * Le a copia local, nao o Operand: o dado ja esta aqui e a pergunta e
 * sobre ele. Mostra o texto inteiro na tela antes de gravar, porque
 * esse texto vai influenciar todo planejamento que a IA montar daqui
 * para frente, e alguem da casa precisa poder ler e dizer "isso nao e
 * a nossa conta".
 */
async function perfil(slug, gravar) {
  if (!slug) erroFatal('Falta a marca.', 'Exemplo: opcao 13 do menu, com o slug.')
  const [marca] = await sql`select id, name from public.brands where slug = ${slug}`
  if (!marca) erroFatal(`Nao achei a marca "${slug}".`)

  const jobs = await sql`
    select titulo, tempo_trabalhado, prazo, criado_em
    from public.operand_jobs where brand_id = ${marca.id}
  `
  if (jobs.length === 0) {
    erroFatal('Nao tem job gravado para essa marca.', 'Rode a opcao 10 primeiro.')
  }

  const p = montarPerfil(jobs)
  const texto = perfilEmTexto(p, { nomeDaMarca: marca.name })

  console.log(`  ${marca.name}: retrato montado a partir de ${p.jobs} job(s).\n`)
  console.log(texto.split('\n').map((l) => (l ? '  ' + l : '')).join('\n'))

  const outros = p.formatos.find((f) => f.chave === 'outros')
  if (outros && outros.jobs > p.natureza.conteudo.jobs * 0.3) {
    console.log(
      `\n  [atencao]  ${outros.jobs} de ${p.natureza.conteudo.jobs} pecas nao encaixaram em`,
    )
    console.log('             formato nenhum. Isso e muito, e quer dizer que as regras de')
    console.log('             leitura dos titulos precisam de ajuste, nao que o dado e ruim.')
  }

  const naoGravar = String(gravar ?? '').trim().toLowerCase() === 'ver'
  if (naoGravar) {
    console.log('\n  Nada foi gravado. Para gravar, rode de novo sem escolher "ver".')
    return
  }

  await sql`
    insert into public.operand_perfil (brand_id, gerado_em, de, ate, jobs, minutos, perfil, resumo)
    values (${marca.id}, now(), ${p.de}, ${p.ate}, ${p.jobs}, ${p.minutos},
            ${sql.json(p)}, ${texto})
    on conflict (brand_id) do update set
      gerado_em = now(), de = excluded.de, ate = excluded.ate,
      jobs = excluded.jobs, minutos = excluded.minutos,
      perfil = excluded.perfil, resumo = excluded.resumo
  `
  console.log('\n  Retrato gravado. Ele ainda nao entra no prompt: isso e o passo seguinte,')
  console.log('  e so faz sentido depois de voce ler o texto acima e concordar com ele.')
}

/**
 * Quais linhas existem dentro do cliente do Operand, e de quem sao.
 *
 * Pergunta ao Operand em vez de ler a copia, de proposito: a copia so
 * tem o que ja foi reivindicado, e a pergunta aqui e justamente
 * "o que existe que ninguem pegou ainda". E assim que se descobre que
 * a conta da fabricante tem uma marca inteira esperando.
 */
async function linhas(slug) {
  if (!slug) erroFatal('Falta a marca.', 'Exemplo: opcao 12 do menu, com o slug.')
  const [marca] = await sql`
    select id, name, operand_client_id from public.brands where slug = ${slug}
  `
  if (!marca) erroFatal(`Nao achei a marca "${slug}".`)
  if (!marca.operand_client_id) erroFatal(`A marca "${slug}" ainda nao esta ligada.`)

  const concorrentes = (
    await sql`select id, name, slug, operand_linhas from public.brands
              where operand_client_id = ${marca.operand_client_id}`
  ).map((m) => ({ ...m, linhas: m.operand_linhas ?? [] }))

  const sessao = await comSessao()
  const { jobs } = await listarJobs(sessao, Number(marca.operand_client_id))
  if (jobs.length === 0) erroFatal('Esse cliente do Operand nao tem job recente.')

  const grupos = new Map()
  for (const j of jobs) {
    const nome = j.linha ?? '(sem linha no titulo)'
    // Agrupa ignorando caixa e acento, mas guarda a escrita mais usada:
    // a mesma marca aparece como "Queens", "QUEENSBERRY" e
    // "Queensberry" ao longo dos anos, e sao a mesma coisa.
    const chave = nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    const g = grupos.get(chave) ?? { escritas: new Map(), n: 0, minutos: 0, exemplo: j.titulo }
    g.n++
    g.minutos += Number(j.tempoTrabalhado ?? 0)
    g.escritas.set(nome, (g.escritas.get(nome) ?? 0) + 1)
    grupos.set(chave, g)
  }

  const lista = [...grupos.values()]
    .map((g) => ({
      nome: [...g.escritas.entries()].sort((a, b) => b[1] - a[1])[0][0],
      n: g.n,
      minutos: g.minutos,
      exemplo: g.exemplo,
    }))
    .sort((a, b) => b.n - a.n)

  console.log(
    `  Cliente ${marca.operand_client_id} do Operand: ${jobs.length} job(s) recente(s), ` +
      `em ${lista.length} linha(s).\n`,
  )
  console.log('   jobs      horas   linha                          vai para')
  let semDono = 0
  for (const l of lista) {
    const dona = marcaDoJob(l.nome, concorrentes)
    if (!dona) semDono += l.n
    console.log(
      `  ${String(l.n).padStart(5)}   ${horas(l.minutos).padStart(8)}   ` +
        `${l.nome.slice(0, 28).padEnd(28)}   ${dona ? dona.name : 'ninguem ainda'}`,
    )
  }

  console.log('\n  Exemplo de titulo de cada uma:')
  for (const l of lista.slice(0, 8)) console.log(`    ${l.exemplo.slice(0, 72)}`)

  if (semDono > 0) {
    console.log(`\n  ${semDono} job(s) sem marca dona. Eles nao sao gravados hoje.`)
    console.log('  Para uma marca reivindicar linhas, use a opcao 7 e informe as linhas.')
  }
}

/**
 * Pergunta ao proprio Operand qual dos dois numeros e o job.
 *
 * A listagem devolve dois identificadores por linha: `itemId`, que na
 * Queensberry vai de 1 a 28, e `id`, que e grande e espalhado. Um dos
 * dois e o job; o outro e outra coisa. Supor errado aqui e escolher a
 * chave errada da tabela, e chave errada so aparece quando ja tem dado
 * dentro.
 *
 * A primeira tentativa foi so bater na rota `/beta/jobs/<n>/tasks` e
 * ver qual era aceita. Nao serviu: os dois numeros foram aceitos. Uma
 * rota que aceita qualquer numero nao esta dizendo "este e um job",
 * esta dizendo "achei alguma coisa com esse numero".
 *
 * A prova de verdade e outra: o proprio job ja diz quantas tarefas
 * tem, em `openedTasks`, `closedTasks` e `canceledTasks`. O numero
 * certo e o que faz a rota devolver essa mesma quantidade. Um numero
 * que devolve outra coisa achou o item errado, mesmo respondendo 200.
 */
async function provar(slug) {
  if (!slug) erroFatal('Falta a marca.', 'Exemplo: opcao 11 do menu, com o slug.')
  const [marca] = await sql`
    select id, name, operand_client_id from public.brands where slug = ${slug}
  `
  if (!marca) erroFatal(`Nao achei a marca "${slug}".`)
  if (!marca.operand_client_id) erroFatal(`A marca "${slug}" ainda nao esta ligada.`)

  const sessao = await comSessao()
  const { jobs: lista } = await listarJobs(sessao, Number(marca.operand_client_id))
  if (lista.length === 0) erroFatal('Essa marca nao tem job nenhum para testar.')

  const quantas = async (numero) => {
    if (!numero) return '-'
    try {
      const corpo = await sessao.pedir(`/beta/jobs/${numero}/tasks`)
      return extrairRegistros(corpo).length
    } catch (e) {
      return e instanceof ErroOperand ? `erro ${e.status}` : 'erro'
    }
  }

  console.log('  O job ja diz quantas tarefas tem. A rota que devolver essa')
  console.log('  mesma quantidade esta achando o job certo.\n')
  console.log('  esperado   por job   por numero no cliente   titulo')

  let acertosJob = 0
  let acertosItem = 0
  const amostra = lista.slice(0, 5)

  for (const j of amostra) {
    const esperado =
      (j.tarefasAbertas ?? 0) + (j.tarefasFechadas ?? 0) + (j.tarefasCanceladas ?? 0)
    const porJob = await quantas(j.jobId)
    const porItem = await quantas(j.itemId)
    if (porJob === esperado) acertosJob++
    if (porItem === esperado) acertosItem++
    console.log(
      `  ${String(esperado).padStart(8)}   ${String(porJob).padStart(7)}   ` +
        `${String(porItem).padStart(20)}   ${j.titulo.slice(0, 34)}`,
    )
  }

  console.log(`\n  O numero do job acertou ${acertosJob} de ${amostra.length}.`)
  console.log(`  O numero no cliente acertou ${acertosItem} de ${amostra.length}.`)

  // As tarefas costumam trazer de volta a que job pertencem. Se
  // trouxerem, isso encerra a discussao sem precisar de contagem.
  const alvo = amostra[0]
  try {
    const corpo = await sessao.pedir(`/beta/jobs/${alvo.jobId}/tasks`)
    const tarefas = extrairRegistros(corpo)
    if (tarefas.length > 0) {
      console.log('\n  Campos de uma tarefa (o numero do job pode estar dentro):')
      console.log('    ' + Object.keys(tarefas[0]).join(', '))
      for (const [k, v] of Object.entries(tarefas[0])) {
        if (/job|item|parent/i.test(k) && (typeof v === 'number' || typeof v === 'string')) {
          console.log(`    ${k} = ${v}`)
        }
      }
    }
  } catch {
    // Diagnostico nao precisa dar certo para o resto valer.
  }
}

/**
 * Lista os clientes do Operand de um jeito que dá para usar.
 *
 * São mais de quinhentos nomes ali, a maioria cadastro antigo sem job
 * nenhum. Despejar tudo na tela não ajuda ninguém a achar a marca que
 * interessa. Então, sem termo de busca, mostra só quem tem job ou já
 * está ligado a uma marca daqui; com termo, procura no cadastro
 * inteiro.
 */
async function clientes(termo) {
  const sessao = await comSessao()
  const lista = await listarClientes(sessao)
  if (lista.length === 0) {
    console.log('  Nenhum cliente no Operand, ou o token não alcança o cadastro de clientes.')
    return
  }
  const marcas = await sql`
    select slug, name, operand_client_id from public.brands order by name
  `
  const ligado = new Map(
    marcas.filter((m) => m.operand_client_id).map((m) => [Number(m.operand_client_id), m.slug]),
  )

  const interessa = (c) => c.jobs > 0 || c.atrasados > 0 || ligado.has(c.id)
  const mostrar = termo
    ? lista.filter((c) => pareceCom(c.nome, termo))
    : lista.filter(interessa)

  console.log(`  ${lista.length} cliente(s) no cadastro do Operand.`)
  if (termo) {
    console.log(`  ${mostrar.length} com "${termo}" no nome.\n`)
  } else {
    console.log(`  ${mostrar.length} com job cadastrado ou ja ligado a uma marca daqui.`)
    console.log('  Para achar um que nao aparece aqui, procure por parte do nome.\n')
  }

  if (mostrar.length === 0) {
    console.log('  Nenhum com esse nome. Tente um pedaco menor da palavra.')
    return
  }

  const teto = 60
  for (const c of mostrar.slice(0, teto)) {
    const marca = ligado.get(c.id)
    const partes = []
    if (c.jobs > 0) partes.push(`${c.jobs} job(s)`)
    if (c.atrasados > 0) partes.push(`${c.atrasados} atrasado(s)`)
    if (c.situacao && c.situacao !== 'active') partes.push(c.situacao)
    const cauda = partes.length ? '   ' + partes.join(', ') : ''
    console.log(
      `  ${String(c.id).padStart(6)}  ${c.nome}${cauda}` +
        (marca ? `   -> ja ligado a "${marca}"` : ''),
    )
  }
  if (mostrar.length > teto) {
    console.log(`\n  ...e mais ${mostrar.length - teto}. Procure por parte do nome para encurtar.`)
  }
  console.log('\n  Para ligar, use a opcao 7 do menu: ela pede o slug e o id.')
}

async function marcas() {
  const linhas = await sql`
    select b.slug, b.name, b.operand_client_id, b.operand_linhas,
           public.operand_ultima_sync(b.id) as ultima,
           (select count(*) from public.operand_jobs j where j.brand_id = b.id) as jobs
    from public.brands b order by b.name
  `
  console.log('  Marcas e ligação com o Operand:\n')
  for (const m of linhas) {
    if (!m.operand_client_id) {
      console.log(`  ${m.name}  (${m.slug})   sem ligação`)
      continue
    }
    const quando = m.ultima ? new Date(m.ultima).toLocaleString('pt-BR') : 'nunca'
    console.log(
      `  ${m.name}  (${m.slug})   cliente ${m.operand_client_id}   ` +
        `${m.jobs} job(s)   última sincronização: ${quando}`,
    )
    if (m.operand_linhas && m.operand_linhas.length) {
      console.log(`      linhas: ${m.operand_linhas.join(', ')}`)
    }
  }
  console.log('')
}

async function ligar(slug, id, termos) {
  const clienteId = Number(id)
  if (!slug || !Number.isInteger(clienteId) || clienteId <= 0) {
    erroFatal('Uso: node scripts/operand.mjs ligar <slug> <id do cliente> [linhas]')
  }
  const [marca] = await sql`select id, name from public.brands where slug = ${slug}`
  if (!marca) erroFatal(`Não achei a marca "${slug}".`)

  // Varias marcas podem dividir o mesmo cliente do Operand: uma conta
  // de fabricante costuma abrigar mais de uma marca. O que nao pode e
  // duas marcas sem linha declarada no mesmo cliente, porque as duas
  // pegariam tudo e cada job apareceria em dobro.
  const linhas = String(termos ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const [vizinha] = await sql`
    select slug, name, operand_linhas from public.brands
    where operand_client_id = ${clienteId} and slug <> ${slug}
    order by name limit 1
  `
  if (vizinha && linhas.length === 0) {
    erroFatal(
      `O cliente ${clienteId} já é da marca "${vizinha.slug}".`,
      'Para dividir a conta, diga quais linhas são desta marca. Exemplo: Queens,Queensberry',
    )
  }
  if (vizinha && (!vizinha.operand_linhas || vizinha.operand_linhas.length === 0)) {
    erroFatal(
      `A marca "${vizinha.slug}" está nesse cliente sem linha declarada, então pega tudo.`,
      'Declare as linhas dela primeiro, senão os jobs entrariam nas duas.',
    )
  }

  await sql`
    update public.brands
    set operand_client_id = ${clienteId},
        operand_linhas = ${linhas.length ? linhas : null}
    where id = ${marca.id}
  `
  console.log(`  "${marca.name}" ligada ao cliente ${clienteId} do Operand.`)
  console.log(
    linhas.length
      ? `  Linhas desta marca: ${linhas.join(', ')}`
      : '  Sem linha declarada: esta marca fica com todos os jobs do cliente.',
  )
  console.log('  Agora: a opcao 10 do menu, com o slug.')
}

async function desligar(slug) {
  if (!slug) erroFatal('Uso: node scripts/operand.mjs desligar <slug-da-marca>')
  const [marca] = await sql`select id, name from public.brands where slug = ${slug}`
  if (!marca) erroFatal(`Não achei a marca "${slug}".`)

  // Os jobs copiados vão junto: guardar produção de uma marca que não
  // está mais ligada é guardar dado que ninguém vai atualizar.
  const apagados = await sql`delete from public.operand_jobs where brand_id = ${marca.id}`
  await sql`update public.brands set operand_client_id = null where id = ${marca.id}`
  console.log(`  "${marca.name}" desligada. ${apagados.count} job(s) copiado(s) foram removidos.`)
}

/**
 * Traz os jobs do Operand para dentro da copia local.
 *
 * Uma chamada por CLIENTE do Operand, nao por marca. Marcas que
 * dividem a mesma conta da fabricante sao servidas pela mesma
 * resposta, e cada job vai para a marca cuja linha casa com o titulo.
 * Job de linha que ninguem reivindicou nao e gravado: ele volta
 * sozinho na proxima sincronizacao, quando a marca existir.
 */
async function sincronizar(slug) {
  const ligadas = slug
    ? await sql`select id, name, slug, operand_client_id, operand_linhas
                from public.brands where slug = ${slug} and operand_client_id is not null`
    : await sql`select id, name, slug, operand_client_id, operand_linhas
                from public.brands where operand_client_id is not null order by name`

  if (ligadas.length === 0) {
    console.log(
      slug
        ? `  A marca "${slug}" não existe ou não está ligada a um cliente do Operand.`
        : '  Nenhuma marca está ligada a um cliente do Operand ainda.',
    )
    console.log('  Ligue pela opcao 7 do menu.')
    return
  }

  // Quem divide a conta precisa ser conhecido mesmo quando so uma
  // marca foi pedida: sem isso, um job da Hero cairia na Queensberry
  // por falta de concorrente.
  const clientes = [...new Set(ligadas.map((m) => Number(m.operand_client_id)))]
  const todasDoCliente = await sql`
    select id, name, slug, operand_client_id, operand_linhas
    from public.brands
    where operand_client_id = any(${clientes})
  `

  const sessao = await comSessao()

  for (const clienteId of clientes) {
    const concorrentes = todasDoCliente
      .filter((m) => Number(m.operand_client_id) === clienteId)
      .map((m) => ({ ...m, linhas: m.operand_linhas ?? [] }))
    const aGravar = concorrentes.filter((m) => ligadas.some((l) => l.id === m.id))

    const corridas = new Map()
    for (const m of aGravar) {
      const [c] = await sql`
        insert into public.operand_sync (brand_id) values (${m.id}) returning id
      `
      corridas.set(m.id, c.id)
    }

    try {
      const { jobs, descartes } = await listarJobs(sessao, clienteId)

      const porMarca = new Map(aGravar.map((m) => [m.id, []]))
      const orfaos = new Map()
      for (const j of jobs) {
        const dona = marcaDoJob(j.linha, concorrentes)
        if (!dona) {
          orfaos.set(j.linha ?? '(sem linha)', (orfaos.get(j.linha ?? '(sem linha)') ?? 0) + 1)
          continue
        }
        if (!porMarca.has(dona.id)) continue // marca do cliente que nao foi pedida agora
        porMarca.get(dona.id).push(j)
      }

      for (const marca of aGravar) {
        const meus = porMarca.get(marca.id) ?? []
        for (const j of meus) await gravarJob(marca.id, j)

        // Job que sumiu da resposta saiu de ativo no Operand, ou mudou
        // de dono para outra marca. Some da copia tambem, senao a
        // analise carrega trabalho que nao e mais dali.
        const vivos = meus.map((j) => j.jobId)
        const sumidos = vivos.length
          ? await sql`delete from public.operand_jobs
                      where brand_id = ${marca.id} and job_id <> all(${vivos})`
          : await sql`delete from public.operand_jobs where brand_id = ${marca.id}`

        await sql`
          update public.operand_sync
          set terminou_em = now(), jobs = ${meus.length}, ok = true
          where id = ${corridas.get(marca.id)}
        `
        const orcado = meus.reduce((t, j) => t + (j.tempoEstimado ?? 0), 0)
        const gasto = meus.reduce((t, j) => t + (j.tempoTrabalhado ?? 0), 0)
        console.log(
          `  ${marca.name}: ${meus.length} job(s)` +
            (sumidos.count > 0 ? `, ${sumidos.count} sairam da lista` : '') +
            (orcado || gasto ? `, ${horas(orcado)} orcadas e ${horas(gasto)} apontadas` : ''),
        )
      }

      console.log('    ' + explicarDescartes(descartes))
      if (orfaos.size > 0) {
        const total = [...orfaos.values()].reduce((a, b) => a + b, 0)
        const quais = [...orfaos.entries()]
          .sort((x, y) => y[1] - x[1])
          .slice(0, 6)
          .map(([nome, n]) => `${nome} (${n})`)
        console.log(`    ${total} job(s) de linha sem marca, nao gravados: ${quais.join(', ')}`)
        console.log('    Eles entram sozinhos quando alguma marca reivindicar essas linhas.')
      }
    } catch (e) {
      const mensagem =
        e instanceof ErroOperand
          ? `${e.message}${e.caminho ? ` (em ${e.caminho})` : ''}`
          : e && e.message
            ? e.message
            : String(e)
      for (const marca of aGravar) {
        await sql`
          update public.operand_sync
          set terminou_em = now(), ok = false, erro = ${mensagem.slice(0, 500)}
          where id = ${corridas.get(marca.id)}
        `
        console.error(`  ${marca.name}: FALHOU. ${mensagem}`)
      }
    }
  }

  if (sessao.entrouDeNovo() > 0) {
    console.log(
      `\n  [nota]  O token autenticado foi renovado ${sessao.entrouDeNovo()} vez(es) no meio.`,
    )
  }
}

/** Uma linha da copia. Separado para a sincronizacao ficar legivel. */
async function gravarJob(brandId, j) {
  await sql`
    insert into public.operand_jobs (
      job_id, brand_id, numero_no_cliente, linha, titulo, descricao, situacao,
      status_id, status_nome, status_cor, responsavel, responsavel_id,
      cliente_id, cliente_nome, projeto_id, projeto_nome, sequencia,
      inicio, prazo, criado_em, atualizado_em, tempo_estimado, tempo_trabalhado,
      tarefas_abertas, tarefas_fechadas, tarefas_canceladas, bruto, visto_em
    ) values (
      ${j.jobId}, ${brandId}, ${j.itemId}, ${j.linha}, ${j.titulo}, ${j.descricao},
      ${j.situacao}, ${j.statusId}, ${j.statusNome}, ${j.statusCor}, ${j.responsavel},
      ${j.responsavelId}, ${j.clienteId}, ${j.clienteNome},
      ${j.projetoId}, ${j.projetoNome}, ${j.sequencia},
      ${j.inicio}, ${j.prazo}, ${j.criadoEm}, ${j.atualizadoEm},
      ${j.tempoEstimado}, ${j.tempoTrabalhado}, ${j.tarefasAbertas},
      ${j.tarefasFechadas}, ${j.tarefasCanceladas}, ${sql.json(j.bruto)}, now()
    )
    on conflict (brand_id, job_id) do update set
      numero_no_cliente = excluded.numero_no_cliente, linha = excluded.linha,
      titulo = excluded.titulo, descricao = excluded.descricao,
      situacao = excluded.situacao, status_id = excluded.status_id,
      status_nome = excluded.status_nome, status_cor = excluded.status_cor,
      responsavel = excluded.responsavel, responsavel_id = excluded.responsavel_id,
      cliente_id = excluded.cliente_id, cliente_nome = excluded.cliente_nome,
      projeto_id = excluded.projeto_id, projeto_nome = excluded.projeto_nome,
      sequencia = excluded.sequencia, inicio = excluded.inicio,
      prazo = excluded.prazo, criado_em = excluded.criado_em,
      atualizado_em = excluded.atualizado_em,
      tempo_estimado = excluded.tempo_estimado,
      tempo_trabalhado = excluded.tempo_trabalhado,
      tarefas_abertas = excluded.tarefas_abertas,
      tarefas_fechadas = excluded.tarefas_fechadas,
      tarefas_canceladas = excluded.tarefas_canceladas,
      bruto = excluded.bruto, visto_em = now()
  `
}

// -------------------------------------------------------------

const [comando, a, b, c] = process.argv.slice(2)

console.log('')
try {
  if (comando === 'rede') await rede()
  else if (comando === 'cru') await cru(a)
  else if (comando === 'sondar') await sondar()
  else if (comando === 'jobs') await jobs(a)
  else if (comando === 'provar') await provar(a)
  else if (comando === 'linhas') await linhas(a)
  else if (comando === 'perfil') await perfil(a, b)
  else if (comando === 'conferir' || !comando) await conferir()
  else if (comando === 'clientes') await clientes(a)
  else if (comando === 'marcas') await marcas()
  else if (comando === 'ligar') await ligar(a, b, c)
  else if (comando === 'desligar') await desligar(a)
  else if (comando === 'sincronizar') await sincronizar(a)
  else {
    console.log('  Comandos: rede, conferir, sondar, cru, clientes, marcas, ligar, desligar, jobs, provar, linhas, perfil, sincronizar')
  }
} catch (e) {
  // O erro de rede já vem com a causa aberta em `.rede`; os outros
  // ainda precisam ser abertos aqui.
  const causa = (e && e.rede) || causaDeRede(e)
  if (e instanceof ErroOperand && e.status === 0) {
    // Não chegou lá: é rede, não é recusa.
    console.error('\n  ' + e.message)
    if (causa && causa.host) console.error('  Endereço: ' + causa.host)
    console.error('  Para ver onde trava: node scripts/operand.mjs rede')
  } else if (e instanceof ErroOperand) {
    console.error('\n  O Operand recusou: ' + e.message)
    if (e.caminho) console.error('  Rota: ' + e.caminho)
  } else {
    console.error('\n  Falhou: ' + (e && e.message ? e.message : String(e)))
    if (causa) {
      console.error('  Motivo: ' + causa.codigo + '. ' + explicarRede(causa.codigo))
      console.error('  Para ver onde trava: node scripts/operand.mjs rede')
    }
  }
  console.error('')
  await sql.end({ timeout: 5 })
  process.exit(1)
}
console.log('')
await sql.end({ timeout: 5 })
