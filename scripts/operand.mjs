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
 *   node scripts/operand.mjs ligar habiarte 700,701,702
 *                                                  liga a marca a varios cadastros
 *   node scripts/operand.mjs padrao habiarte Habiarte
 *                                                  cadastro novo que casar entra sozinho
 *   node scripts/operand.mjs desligar queensberry  desfaz a ligação
 *   node scripts/operand.mjs jobs queensberry      o que viria, sem gravar
 *   node scripts/operand.mjs perfil queensberry    monta o retrato de producao
 *   node scripts/operand.mjs preparar hero 3535 Hero,!Hero Brasil
 *                                                  liga, sincroniza e monta, de uma vez
 *   node scripts/operand.mjs diario                a rotina de todo dia
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
 * Percorre todos os cadastros do Operand ligados a marca, nao um so:
 * uma construtora com dez empreendimentos tem dez cadastros e um
 * planejamento.
 */
async function jobs(slug) {
  if (!slug) {
    erroFatal('Falta a marca.', 'Exemplo: node scripts/operand.mjs jobs queensberry')
  }
  const marca = await acharMarca(slug)
  if (!marca) await marcaNaoAchada(slug)

  const ligacoes = await ligacoesDa(marca.id)
  if (ligacoes.length === 0) {
    erroFatal(
      `A marca "${marca.slug}" ainda nao esta ligada a cadastro nenhum do Operand.`,
      'Ligue pela opcao 7 do menu.',
    )
  }

  const sessao = await comSessao()
  const lista = []
  let recebidos = 0
  const descartes = {}

  for (const lig of ligacoes) {
    const r = await listarJobs(sessao, Number(lig.cliente_id))
    recebidos += r.recebidos
    for (const [k, v] of Object.entries(r.descartes)) descartes[k] = (descartes[k] ?? 0) + v
    // So o que e desta marca: o cadastro pode ser compartilhado.
    const donas = await marcasDoCliente(Number(lig.cliente_id))
    for (const j of r.jobs) {
      const dona = marcaDoJob(j.linha, donas)
      if (dona && dona.id === marca.id) lista.push({ ...j, deOndeVeio: lig.nome ?? lig.cliente_id })
    }
  }

  if (lista.length === 0) {
    console.log(`  ${marca.name}: nenhum job recente nos ${ligacoes.length} cadastro(s) ligado(s).`)
    console.log('  ' + explicarDescartes(descartes))
    return
  }

  console.log(
    `  ${marca.name}: ${lista.length} job(s) que entrariam, de ${recebidos} linha(s) ` +
      `em ${ligacoes.length} cadastro(s).`,
  )
  console.log('  ' + explicarDescartes(descartes) + '\n')

  const porPrazo = [...lista].sort((a, b) =>
    String(a.prazo ?? '9999').localeCompare(String(b.prazo ?? '9999')),
  )
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

  if (ligacoes.length > 1) {
    const porCadastro = new Map()
    for (const j of lista) {
      porCadastro.set(j.deOndeVeio, (porCadastro.get(j.deOndeVeio) ?? 0) + 1)
    }
    console.log('\n  Por cadastro do Operand:')
    for (const [nome, n] of [...porCadastro.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)}  ${nome}`)
    }
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
  const marca = await acharMarca(slug)
  if (!marca) await marcaNaoAchada(slug)

  const jobs = await sql`
    select titulo, linha, tempo_trabalhado, prazo, criado_em
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
      `\n  [atencao]  ${outros.jobs} de ${p.natureza.conteudo.jobs} pecas nao dizem o`,
    )
    console.log('             formato no titulo.')
    console.log('')
    console.log('             Isso PODE ser normal: numa conta cujo contrato e "redes')
    console.log('             sociais", o titulo costuma nomear o assunto, e nao o')
    console.log('             formato. Nesse caso nao ha nada a consertar.')
    console.log('')
    console.log('             Olhe os exemplos abaixo. Se ALGUM deles tiver o formato')
    console.log('             escrito e mesmo assim caiu aqui, e regra faltando, e eu')
    console.log('             conserto. Se nenhum tiver, e assim mesmo.')
    if (p.exemplosSemFormato && p.exemplosSemFormato.length) {
      console.log('')
      for (const t of p.exemplosSemFormato) console.log('               ' + t.slice(0, 76))
    }
  }

  const naoGravar = String(gravar ?? '').trim().toLowerCase() === 'ver'
  if (naoGravar) {
    console.log('\n  Nada foi gravado. Para gravar, rode de novo sem escolher "ver".')
    return
  }

  await gravarPerfil(marca.id, p, texto)
  console.log('\n  Retrato gravado. Ele ainda nao entra no prompt: isso e o passo seguinte,')
  console.log('  e so faz sentido depois de voce ler o texto acima e concordar com ele.')
}

/**
 * Acha a marca pelo slug, sem exigir que a pessoa acerte a digitacao.
 *
 * O slug e minusculo por convencao, mas quem digita "Hero" nao errou
 * nada: errou a convencao. Aceita tambem o nome da marca, porque e
 * assim que ela aparece na tela e e o que a pessoa tem na cabeca.
 */
async function acharMarca(alvo) {
  if (!alvo) return null
  const t = String(alvo).trim()
  const [m] = await sql`
    select id, name, slug, operand_padrao
    from public.brands
    where lower(slug) = lower(${t}) or lower(name) = lower(${t})
    limit 1
  `
  return m ?? null
}

/**
 * Os cadastros do Operand que alimentam uma marca.
 *
 * Desde a 0035 sao varios: a Habiarte cadastra cada empreendimento
 * como um cliente separado, e o planejamento de redes sociais dela e
 * um so.
 */
async function ligacoesDa(brandId) {
  return await sql`
    select cliente_id, linhas, nome, por_padrao
    from public.operand_ligacao
    where brand_id = ${brandId}
    order by por_padrao, cliente_id
  `
}

/**
 * As marcas que disputam os jobs de um cadastro do Operand.
 *
 * Quase sempre uma so. Duas quando a conta e de fabricante e abriga
 * mais de uma marca, e ai quem separa e a linha do titulo.
 */
async function marcasDoCliente(clienteId) {
  const linhas = await sql`
    select b.id, b.name, b.slug, l.linhas
    from public.operand_ligacao l
    join public.brands b on b.id = l.brand_id
    where l.cliente_id = ${clienteId}
  `
  return linhas.map((m) => ({ ...m, linhas: m.linhas ?? [] }))
}

/**
 * O "nao achei", com a lista do que existe.
 *
 * Um "nao achei" seco obriga a pessoa a sair do programa para
 * descobrir o que deveria ter digitado, e a causa mais comum nem e
 * digitacao: e a marca ainda nao existir no planner.
 */
async function marcaNaoAchada(alvo) {
  const todas = await sql`select slug, name from public.brands order by name`
  console.error(`\n  Nao achei a marca "${alvo}".`)
  if (todas.length === 0) {
    console.error('  Nao existe marca nenhuma no planner ainda.')
  } else {
    console.error('\n  As marcas que existem, pelo slug:')
    for (const m of todas) console.error(`    ${m.slug}   (${m.name})`)
  }
  console.error('\n  Se a que voce quer nao esta na lista, crie ela no painel do')
  console.error('  planner primeiro. O Operand nao cria marca aqui.')
  console.error('')
  await sql.end({ timeout: 5 })
  process.exit(1)
}

/** Grava o retrato. Separado porque a rotina diaria usa o mesmo. */
async function gravarPerfil(marcaId, p, texto) {
  await sql`
    insert into public.operand_perfil (brand_id, gerado_em, de, ate, jobs, minutos, perfil, resumo)
    values (${marcaId}, now(), ${p.de}, ${p.ate}, ${p.jobs}, ${p.minutos},
            ${sql.json(p)}, ${texto})
    on conflict (brand_id) do update set
      gerado_em = now(), de = excluded.de, ate = excluded.ate,
      jobs = excluded.jobs, minutos = excluded.minutos,
      perfil = excluded.perfil, resumo = excluded.resumo
  `
}

/**
 * Liga a marca, traz os jobs e monta o retrato, de uma vez so.
 *
 * A primeira marca custou catorze rodadas porque cada passo era uma
 * descoberta. Da segunda em diante nao ha nada a descobrir, e obrigar
 * alguem a abrir o menu quatro vezes seguidas para fazer sempre a
 * mesma sequencia e transformar conhecimento ja adquirido em trabalho
 * manual.
 *
 * Se algum passo falhar, os anteriores ficam feitos: ligar e gravar
 * sao idempotentes, entao rodar de novo conserta em vez de duplicar.
 */
async function preparar(slug, id, termos) {
  console.log('  Passo 1 de 3: ligando a marca ao cliente do Operand.\n')
  await ligar(slug, id, termos)

  console.log('\n  Passo 2 de 3: trazendo os jobs.\n')
  await sincronizar(slug)

  console.log('\n  Passo 3 de 3: montando o retrato de producao.\n')
  await perfil(slug)
}

/**
 * A rotina de todo dia: sincroniza tudo e refaz os retratos.
 *
 * E o que a tarefa agendada do Windows chama. Uma marca que falhar nao
 * pode derrubar as outras: a agencia tem varias contas e o problema de
 * uma nao e motivo para as demais ficarem com dado de ontem.
 */
async function diario() {
  console.log('  ' + new Date().toLocaleString('pt-BR') + '\n')
  await sincronizar()

  const marcas = await sql`
    select b.id, b.slug, b.name from public.brands b
    where b.arquivada_em is null
      and exists (select 1 from public.operand_ligacao l where l.brand_id = b.id)
    order by b.name
  `
  console.log('')
  for (const marca of marcas) {
    try {
      const jobs = await sql`
        select titulo, linha, tempo_trabalhado, prazo, criado_em
        from public.operand_jobs where brand_id = ${marca.id}
      `
      if (jobs.length === 0) {
        console.log(`  ${marca.name}: sem job gravado, retrato nao refeito.`)
        continue
      }
      const p = montarPerfil(jobs)
      await gravarPerfil(marca.id, p, perfilEmTexto(p, { nomeDaMarca: marca.name }))
      console.log(`  ${marca.name}: retrato refeito com ${p.jobs} job(s).`)
    } catch (e) {
      console.error(`  ${marca.name}: retrato FALHOU. ${e && e.message ? e.message : String(e)}`)
    }
  }
}

/**
 * Quais linhas de titulo existem dentro de um cadastro do Operand.
 *
 * Pergunta ao Operand em vez de ler a copia, de proposito: a copia so
 * tem o que ja foi reivindicado, e a pergunta aqui e justamente
 * "o que existe que ninguem pegou ainda".
 *
 * Aceita o numero do cadastro direto, e nao so marca ja ligada: para
 * saber quais linhas existem numa conta, seria absurdo ter de ligar a
 * marca a ela antes de saber se ela e mesmo a conta certa.
 */
async function linhas(alvo) {
  if (!alvo) erroFatal('Falta a marca ou o numero do cadastro.')

  const numero = Number(alvo)
  let cadastros = []
  let quem = ''

  if (Number.isInteger(numero) && numero > 0) {
    cadastros = [numero]
    quem = `Cadastro ${numero}`
  } else {
    const marca = await acharMarca(alvo)
    if (!marca) await marcaNaoAchada(alvo)
    const ligacoes = await ligacoesDa(marca.id)
    if (ligacoes.length === 0) erroFatal(`A marca "${marca.slug}" ainda nao esta ligada.`)
    cadastros = ligacoes.map((l) => Number(l.cliente_id))
    quem = marca.name
  }

  const sessao = await comSessao()
  const grupos = new Map()
  let total = 0

  for (const clienteId of cadastros) {
    const donas = await marcasDoCliente(clienteId)
    const { jobs } = await listarJobs(sessao, clienteId)
    total += jobs.length
    for (const j of jobs) {
      const nome = j.linha ?? '(sem linha no titulo)'
      // Agrupa ignorando caixa e acento, mas guarda a escrita mais
      // usada: a mesma marca aparece como "Queens", "QUEENSBERRY" e
      // "Queensberry" ao longo dos anos, e sao a mesma coisa.
      const chave = nome
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
      const g = grupos.get(chave) ?? {
        escritas: new Map(),
        n: 0,
        minutos: 0,
        exemplo: j.titulo,
        donas,
      }
      g.n++
      g.minutos += Number(j.tempoTrabalhado ?? 0)
      g.escritas.set(nome, (g.escritas.get(nome) ?? 0) + 1)
      grupos.set(chave, g)
    }
  }

  if (total === 0) erroFatal('Nao ha job recente nesse ou nesses cadastros.')

  const lista = [...grupos.values()]
    .map((g) => ({
      nome: [...g.escritas.entries()].sort((a, b) => b[1] - a[1])[0][0],
      n: g.n,
      minutos: g.minutos,
      exemplo: g.exemplo,
      donas: g.donas,
    }))
    .sort((a, b) => b.n - a.n)

  console.log(
    `  ${quem}: ${total} job(s) recente(s) em ${cadastros.length} cadastro(s), ` +
      `em ${lista.length} linha(s).\n`,
  )
  console.log('   jobs      horas   linha                          vai para')
  let semDono = 0
  for (const l of lista) {
    const dona = marcaDoJob(l.nome, l.donas)
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
 * Ficou como registro do metodo. A resposta ja e conhecida (e o campo
 * `id`), e esta funcao e o que permite conferir de novo se um dia a
 * API mudar: o proprio job declara quantas tarefas tem, e a rota que
 * devolver essa mesma quantidade esta achando o job certo.
 */
async function provar(slug) {
  if (!slug) erroFatal('Falta a marca.', 'Exemplo: opcao 11 do menu, com o slug.')
  const marca = await acharMarca(slug)
  if (!marca) await marcaNaoAchada(slug)
  const ligacoes = await ligacoesDa(marca.id)
  if (ligacoes.length === 0) erroFatal(`A marca "${marca.slug}" ainda nao esta ligada.`)

  const sessao = await comSessao()
  const { jobs: lista } = await listarJobs(sessao, Number(ligacoes[0].cliente_id))
  if (lista.length === 0) erroFatal('Esse cadastro nao tem job para testar.')

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
}

/**
 * Lista os clientes do Operand de um jeito que da para usar.
 *
 * Sao mais de quinhentos nomes ali, a maioria cadastro antigo sem job
 * nenhum. Despejar tudo na tela nao ajuda ninguem a achar a conta que
 * interessa. Entao, sem termo de busca, mostra so quem tem job ou ja
 * esta ligado a uma marca daqui; com termo, procura no cadastro
 * inteiro.
 */
async function clientes(termo) {
  const sessao = await comSessao()
  const lista = await listarClientes(sessao)
  if (lista.length === 0) {
    console.log('  Nenhum cliente no Operand, ou o token nao alcanca o cadastro de clientes.')
    return
  }

  const ligacoes = await sql`
    select l.cliente_id, b.slug, l.por_padrao
    from public.operand_ligacao l join public.brands b on b.id = l.brand_id
  `
  const ligado = new Map(ligacoes.map((l) => [Number(l.cliente_id), l]))

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
    const lig = ligado.get(c.id)
    const partes = []
    if (c.jobs > 0) partes.push(`${c.jobs} job(s)`)
    if (c.atrasados > 0) partes.push(`${c.atrasados} atrasado(s)`)
    if (c.situacao && c.situacao !== 'active') partes.push(c.situacao)
    const cauda = partes.length ? '   ' + partes.join(', ') : ''
    console.log(
      `  ${String(c.id).padStart(7)}  ${c.nome}${cauda}` +
        (lig ? `   -> "${lig.slug}"${lig.por_padrao ? ' (por padrao)' : ''}` : ''),
    )
  }
  if (mostrar.length > teto) {
    console.log(`\n  ...e mais ${mostrar.length - teto}. Procure por parte do nome para encurtar.`)
  }
  console.log('\n  Para ligar, use a opcao 7 do menu: ela aceita varios numeros de uma vez.')
}

async function marcas() {
  const linhas = await sql`
    select b.id, b.slug, b.name, b.operand_padrao,
           public.operand_ultima_sync(b.id) as ultima,
           (select count(*) from public.operand_jobs j where j.brand_id = b.id) as jobs,
           (select count(*) from public.operand_ligacao l where l.brand_id = b.id) as cadastros
    from public.brands b order by b.name
  `
  console.log('  Marcas e ligacao com o Operand:\n')
  for (const m of linhas) {
    if (Number(m.cadastros) === 0) {
      console.log(`  ${m.name}  (${m.slug})   sem ligacao`)
      continue
    }
    const quando = m.ultima ? new Date(m.ultima).toLocaleString('pt-BR') : 'nunca'
    console.log(
      `  ${m.name}  (${m.slug})   ${m.cadastros} cadastro(s)   ` +
        `${m.jobs} job(s)   ultima sincronizacao: ${quando}`,
    )
    if (m.operand_padrao) console.log(`      padrao de nome: "${m.operand_padrao}"`)

    const ligacoes = await ligacoesDa(m.id)
    for (const l of ligacoes.slice(0, 12)) {
      console.log(
        `      ${String(l.cliente_id).padStart(7)}  ${l.nome ?? ''}` +
          (l.linhas && l.linhas.length ? `   linhas: ${l.linhas.join(', ')}` : '') +
          (l.por_padrao ? '   (por padrao)' : ''),
      )
    }
    if (ligacoes.length > 12) console.log(`      ...e mais ${ligacoes.length - 12} cadastro(s).`)
  }
  console.log('')
}

/**
 * Liga uma marca a um ou mais cadastros do Operand.
 *
 * Aceita varios numeros separados por virgula porque esse e o formato
 * real da Habiarte: um cadastro por empreendimento, um planejamento
 * so. E aceita linhas porque o formato real da Queensberry e o
 * contrario: um cadastro, varias marcas dentro.
 *
 * As duas coisas juntas sao raras mas possiveis, e nao custa nada
 * suportar: as linhas valem para todos os cadastros informados.
 */
async function ligar(slug, ids, termos) {
  if (!slug || !ids) {
    erroFatal('Uso: node scripts/operand.mjs ligar <slug> <ids do cliente> [linhas]')
  }
  const marca = await acharMarca(slug)
  if (!marca) await marcaNaoAchada(slug)

  const clientes = String(ids)
    .split(',')
    .map((t) => Number(String(t).trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (clientes.length === 0) {
    erroFatal(`"${ids}" nao tem numero de cliente nenhum.`, 'Exemplo: 3535 ou 3535,3612,3704')
  }

  const linhas = String(termos ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  // O que nao pode e duas marcas SEM linha declarada no mesmo cadastro:
  // as duas pegariam tudo e cada job apareceria em dobro.
  for (const clienteId of clientes) {
    const vizinhas = (await marcasDoCliente(clienteId)).filter((m) => m.id !== marca.id)
    if (vizinhas.length === 0) continue
    if (linhas.length === 0) {
      erroFatal(
        `O cadastro ${clienteId} ja e da marca "${vizinhas[0].slug}".`,
        'Para dividir, diga quais linhas do titulo sao desta marca.',
      )
    }
    const semLinha = vizinhas.find((m) => m.linhas.length === 0)
    if (semLinha) {
      erroFatal(
        `A marca "${semLinha.slug}" esta no cadastro ${clienteId} sem linha declarada, entao pega tudo.`,
        'Declare as linhas dela primeiro, senao os jobs entrariam nas duas.',
      )
    }
  }

  for (const clienteId of clientes) {
    await sql`
      insert into public.operand_ligacao (brand_id, cliente_id, linhas, por_padrao)
      values (${marca.id}, ${clienteId}, ${linhas.length ? linhas : null}, false)
      on conflict (brand_id, cliente_id) do update set
        linhas = excluded.linhas, por_padrao = false
    `
  }

  console.log(
    `  "${marca.name}" ligada a ${clientes.length} cadastro(s) do Operand: ${clientes.join(', ')}`,
  )
  console.log(
    linhas.length
      ? `  Linhas desta marca: ${linhas.join(', ')}`
      : '  Sem linha declarada: esta marca fica com todos os jobs desses cadastros.',
  )

  const todas = await ligacoesDa(marca.id)
  if (todas.length > clientes.length) {
    console.log(`  Ao todo a marca reune ${todas.length} cadastro(s) agora.`)
  }
  console.log('  Agora: a opcao 10 do menu, com o slug.')
}

/**
 * Os cadastros que um padrao de nome pega.
 *
 * Fora os desativados. No cadastro da Habiarte ha empreendimentos
 * marcados como `disabled`, que sao obra entregue e conta encerrada.
 * Uma REGRA automatica deve trazer o que esta vivo; trazer conta
 * encerrada faria o retrato da marca envelhecer sozinho, porque o
 * numero de cadastros cresceria para sempre e nenhum deles produziria
 * nada.
 *
 * Quem quiser um desativado especifico liga ele a mao, e a ligacao
 * manual nao e mexida por nenhum padrao.
 */
function cadastrosDoPadrao(todos, termo) {
  const casam = todos.filter((c) => pareceCom(c.nome, termo))
  return {
    vivos: casam.filter((c) => !c.situacao || c.situacao === 'active'),
    desativados: casam.filter((c) => c.situacao && c.situacao !== 'active'),
  }
}

/**
 * Guarda o padrao de nome que traz cadastro novo sozinho.
 *
 * O problema que ele resolve: a Habiarte abre empreendimento o tempo
 * todo, e ligacao feita a mao envelhece no dia seguinte. O proximo
 * lancamento entra no Operand e fica invisivel aqui, sem ninguem
 * perceber, porque nada avisa que apareceu um cadastro novo.
 *
 * Com o padrao, a sincronizacao procura os cadastros cujo nome contem
 * o texto e liga os que faltam, gravando a ligacao marcada como
 * automatica. Gravar em vez de resolver na hora e o que permite olhar
 * a lista e desfazer o que entrou errado.
 */
async function padrao(slug, termo) {
  if (!slug) erroFatal('Falta a marca.', 'Exemplo: opcao 16 do menu, com o slug.')
  const marca = await acharMarca(slug)
  if (!marca) await marcaNaoAchada(slug)

  const t = String(termo ?? '').trim()

  if (!t) {
    await sql`update public.brands set operand_padrao = null where id = ${marca.id}`
    const apagadas = await sql`
      delete from public.operand_ligacao where brand_id = ${marca.id} and por_padrao
    `
    console.log(`  Padrao removido de "${marca.name}".`)
    if (apagadas.count > 0) {
      console.log(`  ${apagadas.count} ligacao(oes) que tinham entrado por regra sairam junto.`)
      console.log('  As que foram feitas a mao continuam.')
    }
    return
  }

  if (t.length < 3) {
    erroFatal(
      `"${t}" e curto demais para servir de padrao.`,
      'Com duas letras, quase todo cadastro da agencia entraria.',
    )
  }

  // Mostra o que vai acontecer ANTES de guardar. Um padrao largo
  // demais puxaria cadastro de outro cliente para dentro da marca, e
  // isso e o tipo de erro que so aparece quando a base ja esta suja.
  const sessao = await comSessao()
  const todos = await listarClientes(sessao)
  const { vivos, desativados } = cadastrosDoPadrao(todos, t)

  console.log(`  Padrao "${t}" para a marca ${marca.name}.\n`)
  if (vivos.length === 0 && desativados.length === 0) {
    erroFatal('Nenhum cadastro do Operand tem esse texto no nome.', 'Confira a escrita.')
  }
  if (vivos.length === 0) {
    erroFatal(
      `Os ${desativados.length} cadastro(s) com esse texto estao todos desativados.`,
      'Se algum deles importa, ligue a mao pela opcao 7.',
    )
  }

  console.log(`  ${vivos.length} cadastro(s) ativo(s) casam com ele:\n`)
  for (const c of vivos.slice(0, 40)) {
    console.log(`  ${String(c.id).padStart(7)}  ${c.nome}` + (c.jobs ? `   ${c.jobs} job(s)` : ''))
  }
  if (vivos.length > 40) console.log(`  ...e mais ${vivos.length - 40}.`)

  if (desativados.length > 0) {
    console.log(
      `\n  ${desativados.length} cadastro(s) desativado(s) ficam de fora: ` +
        desativados.slice(0, 5).map((c) => c.nome).join(', ') +
        (desativados.length > 5 ? ', ...' : ''),
    )
    console.log('  Se algum deles importar, ligue a mao pela opcao 7.')
  }

  await sql`update public.brands set operand_padrao = ${t} where id = ${marca.id}`
  console.log('\n  Padrao guardado. Os cadastros entram na proxima sincronizacao,')
  console.log('  e cada um fica marcado como automatico na lista de ligacoes.')
  console.log('  Se algum ai em cima nao for desta marca, o padrao esta largo demais.')
}

/**
 * Desfaz a ligacao: a marca toda, ou um cadastro so.
 *
 * Os jobs copiados saem junto, e e isso mesmo: cópia de origem que
 * nao existe mais nao e informacao, e uma marca que "lembra" de
 * trabalho que nao vem mais de lugar nenhum passa a mentir devagar.
 */
async function desligar(slug, qual) {
  if (!slug) erroFatal('Uso: node scripts/operand.mjs desligar <slug> [id do cadastro]')
  const marca = await acharMarca(slug)
  if (!marca) await marcaNaoAchada(slug)

  const um = Number(String(qual ?? '').trim())
  if (Number.isInteger(um) && um > 0) {
    const fora = await sql`
      delete from public.operand_ligacao where brand_id = ${marca.id} and cliente_id = ${um}
    `
    if (fora.count === 0) {
      erroFatal(`A marca "${marca.slug}" nao esta ligada ao cadastro ${um}.`)
    }
    const jobs = await sql`
      delete from public.operand_jobs where brand_id = ${marca.id} and cliente_id = ${um}
    `
    console.log(`  "${marca.name}" nao usa mais o cadastro ${um}.`)
    console.log(`  ${jobs.count} job(s) sairam da copia.`)
    const restam = await ligacoesDa(marca.id)
    console.log(`  Ainda reune ${restam.length} cadastro(s).`)
    return
  }

  const fora = await sql`delete from public.operand_ligacao where brand_id = ${marca.id}`
  await sql`update public.brands set operand_padrao = null where id = ${marca.id}`
  const jobs = await sql`delete from public.operand_jobs where brand_id = ${marca.id}`
  await sql`delete from public.operand_perfil where brand_id = ${marca.id}`
  console.log(`  "${marca.name}" desligada do Operand.`)
  console.log(`  ${fora.count} ligacao(oes), ${jobs.count} job(s) e o retrato sairam.`)
}

/**
 * Traz os jobs do Operand para dentro da copia local.
 *
 * Uma chamada por CADASTRO do Operand, nao por marca. Marcas que
 * dividem o mesmo cadastro sao servidas pela mesma resposta, e cada
 * job vai para a marca cuja linha casa com o titulo. Marca que reune
 * varios cadastros recebe a soma deles.
 *
 * Antes de tudo, os padroes de nome sao resolvidos: cadastro novo que
 * casa com o padrao de alguma marca entra sozinho, e entra GRAVADO na
 * tabela de ligacoes, para ficar visivel.
 */
async function sincronizar(slug) {
  const marcas = slug
    ? await sql`select id, name, slug, operand_padrao, arquivada_em from public.brands
                where lower(slug) = lower(${String(slug).trim()})
                   or lower(name) = lower(${String(slug).trim()})`
    : await sql`select id, name, slug, operand_padrao, arquivada_em from public.brands
                where arquivada_em is null order by name`

  if (marcas.length === 0) {
    console.log(slug ? `  A marca "${slug}" nao existe.` : '  Nao ha marca nenhuma.')
    return
  }

  // Marca arquivada e contrato encerrado: nao adianta trazer job novo
  // dela. Pedida pelo nome, o comando avisa em vez de fingir que fez;
  // na varredura geral ela ja ficou de fora da consulta.
  const arquivadas = marcas.filter((m) => m.arquivada_em)
  const ativas = marcas.filter((m) => !m.arquivada_em)
  if (ativas.length === 0) {
    console.log(`  A marca "${slug}" esta arquivada. Reabra em Marcas, no painel, antes de sincronizar.`)
    return
  }
  for (const m of arquivadas) {
    console.log(`  ${m.name} esta arquivada, entao ficou de fora.`)
  }

  const sessao = await comSessao()
  await resolverPadroes(sessao, ativas)

  // Quais marcas, entre as pedidas, tem cadastro ligado.
  const aServir = []
  for (const m of ativas) {
    const ligacoes = await ligacoesDa(m.id)
    if (ligacoes.length > 0) aServir.push({ ...m, ligacoes })
  }

  if (aServir.length === 0) {
    console.log(
      slug
        ? `  A marca "${slug}" nao esta ligada a cadastro nenhum do Operand.`
        : '  Nenhuma marca esta ligada ao Operand ainda.',
    )
    console.log('  Ligue pela opcao 7 do menu.')
    return
  }

  const clientes = [...new Set(aServir.flatMap((m) => m.ligacoes.map((l) => Number(l.cliente_id))))]

  // Uma corrida de sincronizacao por marca, nao por cadastro: quem le
  // o registro depois quer saber se a MARCA esta em dia.
  const corridas = new Map()
  for (const m of aServir) {
    const [c] = await sql`
      insert into public.operand_sync (brand_id) values (${m.id}) returning id
    `
    corridas.set(m.id, c.id)
  }

  const colhido = new Map(aServir.map((m) => [m.id, []]))
  const orfaos = new Map()
  const descartes = {}
  const falhas = new Map()

  for (const clienteId of clientes) {
    const donas = await marcasDoCliente(clienteId)
    try {
      const r = await listarJobs(sessao, clienteId)
      for (const [k, v] of Object.entries(r.descartes)) descartes[k] = (descartes[k] ?? 0) + v

      for (const j of r.jobs) {
        const dona = marcaDoJob(j.linha, donas)
        if (!dona) {
          const nome = j.linha ?? '(sem linha)'
          orfaos.set(nome, (orfaos.get(nome) ?? 0) + 1)
          continue
        }
        if (!colhido.has(dona.id)) continue // marca que nao foi pedida agora
        colhido.get(dona.id).push(j)
      }
    } catch (e) {
      const mensagem =
        e instanceof ErroOperand
          ? `${e.message}${e.caminho ? ` (em ${e.caminho})` : ''}`
          : e && e.message
            ? e.message
            : String(e)
      // Um cadastro que falha nao pode fazer a marca perder os outros.
      for (const d of donas) {
        if (!falhas.has(d.id)) falhas.set(d.id, [])
        falhas.get(d.id).push(`cadastro ${clienteId}: ${mensagem}`)
      }
      console.error(`  [falha]  cadastro ${clienteId}: ${mensagem}`)
    }
  }

  for (const marca of aServir) {
    const meus = colhido.get(marca.id) ?? []
    const problemas = falhas.get(marca.id) ?? []

    // Com um cadastro fora do ar, apagar o que sumiu apagaria trabalho
    // que existe. Entao grava o que veio e nao apaga nada.
    if (problemas.length > 0 && meus.length === 0) {
      await sql`
        update public.operand_sync
        set terminou_em = now(), ok = false, erro = ${problemas.join(' | ').slice(0, 500)}
        where id = ${corridas.get(marca.id)}
      `
      console.error(`  ${marca.name}: FALHOU. ${problemas[0]}`)
      continue
    }

    for (const j of meus) await gravarJob(marca.id, j)

    let sumidos = { count: 0 }
    if (problemas.length === 0) {
      const vivos = meus.map((j) => j.jobId)
      sumidos = vivos.length
        ? await sql`delete from public.operand_jobs
                    where brand_id = ${marca.id} and job_id <> all(${vivos})`
        : await sql`delete from public.operand_jobs where brand_id = ${marca.id}`
    }

    await sql`
      update public.operand_sync
      set terminou_em = now(), jobs = ${meus.length}, ok = ${problemas.length === 0},
          erro = ${problemas.length ? problemas.join(' | ').slice(0, 500) : null}
      where id = ${corridas.get(marca.id)}
    `

    const orcado = meus.reduce((t, j) => t + (j.tempoEstimado ?? 0), 0)
    const gasto = meus.reduce((t, j) => t + (j.tempoTrabalhado ?? 0), 0)
    console.log(
      `  ${marca.name}: ${meus.length} job(s) de ${marca.ligacoes.length} cadastro(s)` +
        (sumidos.count > 0 ? `, ${sumidos.count} sairam da lista` : '') +
        (orcado || gasto ? `, ${horas(orcado)} orcadas e ${horas(gasto)} apontadas` : ''),
    )

    // Quais linhas esta marca de fato capturou, com a contagem. Sem
    // isso, um termo largo demais entra em silencio: o total sobe e
    // ninguem percebe que entrou trabalho de outra conta.
    const porLinha = new Map()
    for (const j of meus) {
      const nome = j.linha ?? '(sem linha)'
      porLinha.set(nome, (porLinha.get(nome) ?? 0) + 1)
    }
    if (porLinha.size > 0 && porLinha.size <= 12) {
      const quais = [...porLinha.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([nome, n]) => `${nome} (${n})`)
      console.log(`      linhas que entraram: ${quais.join(', ')}`)
    } else if (porLinha.size > 12) {
      console.log(`      ${porLinha.size} linhas diferentes de titulo`)
    }

    if (problemas.length > 0) {
      console.log(`      [atencao]  ${problemas.length} cadastro(s) falharam; nada foi apagado.`)
    }
  }

  console.log('    ' + explicarDescartes(descartes))
  if (orfaos.size > 0) {
    const total = [...orfaos.values()].reduce((a, b) => a + b, 0)
    const quais = [...orfaos.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([nome, n]) => `${nome} (${n})`)
    console.log(`    ${total} job(s) de linha sem marca, nao gravados: ${quais.join(', ')}`)
  }

  if (sessao.entrouDeNovo() > 0) {
    console.log(
      `\n  [nota]  O token autenticado foi renovado ${sessao.entrouDeNovo()} vez(es) no meio.`,
    )
  }
}

/**
 * Liga sozinha os cadastros novos que casam com o padrao de cada marca.
 *
 * So pede a lista de clientes quando alguma marca tem padrao: a
 * chamada custa e a maioria das marcas nao precisa dela.
 */
async function resolverPadroes(sessao, marcas) {
  const comPadrao = marcas.filter((m) => (m.operand_padrao ?? '').trim())
  if (comPadrao.length === 0) return

  const todos = await listarClientes(sessao)
  for (const marca of comPadrao) {
    const termo = String(marca.operand_padrao).trim()
    const { vivos } = cadastrosDoPadrao(todos, termo)

    const antes = await sql`
      select cliente_id from public.operand_ligacao
      where brand_id = ${marca.id} and por_padrao
    `
    const tinha = new Set(antes.map((l) => Number(l.cliente_id)))

    for (const c of vivos) {
      await sql`
        insert into public.operand_ligacao (brand_id, cliente_id, nome, por_padrao)
        values (${marca.id}, ${c.id}, ${c.nome}, true)
        on conflict (brand_id, cliente_id) do update set nome = excluded.nome
      `
    }

    // Cadastro que saiu do padrao (foi desativado, ou o nome mudou)
    // deixa de alimentar a marca. So os que entraram por regra sao
    // mexidos: ligacao feita a mao e decisao de alguem e fica.
    const agora = new Set(vivos.map((c) => Number(c.id)))
    const sairam = [...tinha].filter((id) => !agora.has(id))
    for (const id of sairam) {
      await sql`
        delete from public.operand_ligacao
        where brand_id = ${marca.id} and cliente_id = ${id} and por_padrao
      `
      await sql`
        delete from public.operand_jobs where brand_id = ${marca.id} and cliente_id = ${id}
      `
    }

    const novos = vivos.filter((c) => !tinha.has(Number(c.id))).length
    console.log(
      `  ${marca.name}: padrao "${termo}" reune ${vivos.length} cadastro(s) ativo(s)` +
        (novos > 0 ? `, ${novos} novo(s)` : '') +
        (sairam.length > 0 ? `, ${sairam.length} sairam` : '') +
        '.',
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
  else if (comando === 'padrao') await padrao(a, b)
  else if (comando === 'preparar') await preparar(a, b, c)
  else if (comando === 'diario') await diario()
  else if (comando === 'conferir' || !comando) await conferir()
  else if (comando === 'clientes') await clientes(a)
  else if (comando === 'marcas') await marcas()
  else if (comando === 'ligar') await ligar(a, b, c)
  else if (comando === 'desligar') await desligar(a, b)
  else if (comando === 'sincronizar') await sincronizar(a)
  else {
    console.log('  Comandos: rede, conferir, sondar, cru, clientes, marcas, ligar, desligar, jobs, provar, linhas, perfil, padrao, preparar, diario, sincronizar')
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
