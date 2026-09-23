/**
 * Confere, no banco de VERDADE, as travas que o sistema depende.
 *
 * Não é o mesmo que os testes: aqueles rodam num Postgres local e
 * provam que as regras FUNCIONAM. Este olha o servidor de produção e
 * prova que as regras ESTÃO LÁ. Migração esquecida, política
 * derrubada à mão no painel, gatilho que sumiu — é isso que ele pega.
 *
 * Só lê. Não altera nada, não cria usuário, não apaga nada.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

function lerEnvLocal() {
  const caminho = join(raiz, '.env.local')
  if (!existsSync(caminho)) return {}
  const out = {}
  for (const l of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    if (!l.trim() || l.trim().startsWith('#')) continue
    const i = l.indexOf('=')
    if (i < 0) continue
    let v = l.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[l.slice(0, i).trim()] = v
  }
  return out
}

const env = { ...lerEnvLocal(), ...process.env }
const url = env.DATABASE_URL
if (!url || url.includes('[YOUR-PASSWORD]')) {
  console.error('ERRO: DATABASE_URL ausente ou incompleta no .env.local.')
  process.exit(1)
}

function servidorDe(u) {
  try {
    const x = new URL(u)
    return `${x.hostname}:${x.port || 5432}`
  } catch {
    return '(endereco ilegivel)'
  }
}

console.log('============================================')
console.log(' Conferencia de seguranca')
console.log(' ' + new Date().toLocaleString('pt-BR'))
console.log('============================================\n')
console.log('Servidor: ' + servidorDe(url) + '\n')

const sql = postgres(url, { max: 1, prepare: false, ssl: url.includes('localhost') ? false : 'require' })

let falhas = 0
let avisos = 0

function diz(ok, titulo, detalhe, grave = true) {
  if (ok) {
    console.log(`  [ok]     ${titulo}`)
  } else if (grave) {
    falhas++
    console.log(`  [FALHA]  ${titulo}`)
    if (detalhe) console.log(`           ${detalhe}`)
  } else {
    avisos++
    console.log(`  [aviso]  ${titulo}`)
    if (detalhe) console.log(`           ${detalhe}`)
  }
}

try {
  console.log('--- 1. Ninguem se promove sozinho ---')
  const [g] = await sql`
    select count(*)::int as n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'profiles' and t.tgname = 'profiles_guard_trg' and not t.tgisinternal
  `
  diz(
    g.n === 1,
    'gatilho que impede mudar o proprio papel',
    'A migracao 0011 nao foi aplicada. Qualquer conta pode virar administradora. Rode o 04-migrar.cmd AGORA.',
  )

  console.log('\n--- 2. Vinculo com marca e so da administracao ---')
  const [v] = await sql`
    select count(*)::int as n from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'brand_members' and p.polname = 'staff_all'
  `
  diz(v.n === 0, 'equipe nao escreve em brand_members', 'A politica staff_all ainda existe: um editor pode se promover na marca.')

  console.log('\n--- 3. Toda tabela protegida ---')
  const desprotegidas = await sql`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and (not c.relrowsecurity or not c.relforcerowsecurity)
  `
  diz(
    desprotegidas.length === 0,
    `${desprotegidas.length === 0 ? 'todas' : 'nem todas'} as tabelas com protecao forcada`,
    desprotegidas.map((x) => x.relname).join(', '),
  )

  const semPolitica = await sql`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  `
  diz(semPolitica.length === 0, 'toda tabela tem ao menos uma politica', semPolitica.map((x) => x.relname).join(', '))

  console.log('\n--- 4. As funcoes do sistema estao no lugar ---')
  const esperadas = [
    ['salvar_pauta', 'invoker'],
    ['decidir_pauta', 'invoker'],
    ['liberar_plano', 'invoker'],
    ['quem_sou', 'definer'],
    ['is_staff', 'definer'],
    ['is_admin', 'definer'],
    ['can_access_brand', 'definer'],
    ['idea_is_client_visible', 'definer'],
    ['profiles_guard', 'definer'],
  ]
  const funcoes = await sql`
    select p.proname, p.prosecdef from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  `
  const achadas = new Map(funcoes.map((f) => [f.proname, f.prosecdef]))
  for (const [nome, tipo] of esperadas) {
    if (!achadas.has(nome)) {
      diz(false, `funcao ${nome}`, 'nao existe — falta alguma migracao')
      continue
    }
    const ehDefiner = achadas.get(nome) === true
    const certo = tipo === 'definer' ? ehDefiner : !ehDefiner
    diz(
      certo,
      `funcao ${nome} (${tipo})`,
      ehDefiner
        ? 'esta como SECURITY DEFINER: passa por cima das politicas. Deveria rodar como quem chama.'
        : 'deveria ser SECURITY DEFINER e nao e.',
    )
  }

  console.log('\n--- 5. O que roda por cima das politicas ---')
  const definers = funcoes.filter((f) => f.prosecdef).map((f) => f.proname).sort()
  console.log('  Estas funcoes ignoram o isolamento por desenho. Sao o nucleo')
  console.log('  de confianca do sistema — a lista para o desenvolvedor revisar:')
  for (const d of definers) console.log(`    · ${d}`)

  console.log('\n--- 6. Cadastro publico ---')
  console.log('  [manual] Confira no painel do Supabase, em Authentication >')
  console.log('           Sign In / Providers, que "Allow new users to sign up"')
  console.log('           esta DESLIGADO. Ligado, qualquer um cria conta sozinho.')

  console.log('\n--- 7. Quem administra hoje ---')
  const admins = await sql`select name, email from profiles where role = 'admin' order by name`
  if (admins.length === 0) {
    diz(false, 'existe ao menos um administrador', 'Nenhum. Ninguem consegue gerenciar pessoas.')
  } else {
    console.log(`  ${admins.length} pessoa(s) com poder total sobre todas as marcas:`)
    for (const a of admins) console.log(`    · ${a.name} <${a.email}>`)
    if (admins.length > 3) {
      avisos++
      console.log('  [aviso]  Mais de tres administradores. Cada um enxerga tudo de todos')
      console.log('           os clientes. Vale conferir se todos precisam mesmo.')
    }
  }

  console.log('\n--- 8. O material interno fica longe do cliente ---')
  const colunasNoPlano = await sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'plans'
      and column_name in ('analysis', 'briefing')
  `
  diz(
    colunasNoPlano.length === 0,
    'leitura, critica e briefing fora da tabela que o cliente le',
    'A tabela plans ainda tem ' + colunasNoPlano.map((c) => c.column_name).join(' e ') +
      '. A migracao 0022 nao foi aplicada. Rode o 04-migrar.cmd.',
  )
  const politicasInternas = await sql`
    select p.polname, pg_get_expr(p.polqual, p.polrelid) as usando,
           pg_get_expr(p.polwithcheck, p.polrelid) as conferindo
    from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname = 'plano_interno'
  `
  const abertaAoCliente = politicasInternas.filter((x) =>
    /client|auth_brand_ids/.test(`${x.usando ?? ''} ${x.conferindo ?? ''}`),
  )
  diz(
    politicasInternas.length > 0 && abertaAoCliente.length === 0,
    'plano_interno so tem politica para a equipe',
    politicasInternas.length === 0
      ? 'A tabela plano_interno nao existe ou esta sem politica. Rode o 04-migrar.cmd.'
      : 'Politica que alcanca o cliente: ' + abertaAoCliente.map((x) => x.polname).join(', '),
  )

  console.log('\n--- 9. As imagens de layout ficam fechadas ---')
  const baldes = await sql`select id, public from storage.buckets where id = 'layouts'`
  diz(
    baldes.length === 1 && baldes[0].public === false,
    'balde "layouts" existe e e privado',
    baldes.length === 0
      ? 'O balde nao existe. Rode o 04-migrar.cmd (migracao 0023).'
      : 'O balde esta PUBLICO: qualquer pessoa com o endereco ve as artes dos clientes. Desligue "Public bucket" no painel do Supabase.',
  )
  console.log('\n--- 10. O cliente le vistas, nunca as tabelas ---')
  // RLS protege linhas, nao colunas. Enquanto o cliente lesse
  // content_ideas direto, qualquer coluna interna da linha dele vinha
  // junto, aparecesse ou nao na tela. A 0027 fechou as duas tabelas
  // para ele e pos duas vistas no lugar, com as colunas escritas nome
  // por nome. Esta secao confere que continua assim.
  const vistas = await sql`
    select table_name from information_schema.views
    where table_schema = 'public'
      and table_name in ('pautas_do_cliente', 'conteudo_do_cliente')
  `
  diz(
    vistas.length === 2,
    'as vistas pautas_do_cliente e conteudo_do_cliente existem',
    'Faltando: ' +
      ['pautas_do_cliente', 'conteudo_do_cliente']
        .filter((v) => !vistas.some((x) => x.table_name === v))
        .join(', ') +
      '. Rode o 04-migrar.cmd (migracao 0027).',
  )

  const colunasQueVazariam = await sql`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and table_name in ('pautas_do_cliente', 'conteudo_do_cliente')
      and column_name in (
        'rationale', 'meta_justificativa', 'theme', 'objective', 'audience',
        'current_version', 'owner_id', 'art_direction', 'image_prompt',
        'alt_text', 'caption_variants'
      )
  `
  diz(
    colunasQueVazariam.length === 0,
    'nenhuma coluna interna aparece nas vistas do cliente',
    'Vazando: ' +
      colunasQueVazariam.map((c) => c.table_name + '.' + c.column_name).join(', ') +
      '. Tire a coluna da vista antes de subir isto.',
  )

  const aindaAbertas = await sql`
    select c.relname as tabela, p.polname,
           pg_get_expr(p.polqual, p.polrelid) as usando
    from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname in ('content_ideas', 'idea_content')
      and p.polcmd = 'r'
  `
  const paraCliente = aindaAbertas.filter((x) => /auth_role\(\) = 'client'/.test(x.usando ?? ''))
  diz(
    paraCliente.length === 0,
    'content_ideas e idea_content nao tem politica de leitura para o cliente',
    'Politica que reabre a tabela: ' +
      paraCliente.map((x) => x.tabela + '.' + x.polname).join(', '),
  )

} catch (e) {
  falhas++
  console.error('\nFALHOU ao conferir: ' + (e && e.message ? e.message : String(e)))
} finally {
  await sql.end({ timeout: 5 })
}

console.log('\n============================================')
if (falhas === 0 && avisos === 0) {
  console.log(' Tudo no lugar.')
} else if (falhas === 0) {
  console.log(` Sem falhas. ${avisos} aviso(s) acima para olhar.`)
} else {
  console.log(` ${falhas} FALHA(S) e ${avisos} aviso(s). Leia acima.`)
}
console.log('============================================')
process.exit(falhas === 0 ? 0 : 1)
