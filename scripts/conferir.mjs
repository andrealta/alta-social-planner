/**
 * Confere o .env.local sem nunca mostrar o conteúdo das chaves.
 *
 * Diz se cada configuração existe, se está preenchida e se tem o
 * formato esperado — mas imprime no máximo os primeiros caracteres de
 * um prefixo público. Nada que sirva para alguém usar.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const caminho = join(raiz, '.env.local')

console.log('============================================')
console.log(' Conferencia do .env.local')
console.log('============================================\n')

if (!existsSync(caminho)) {
  console.log('O arquivo .env.local NAO existe nesta pasta.\n')
  console.log('Crie pelo VS Code (o Explorer do Windows nao deixa criar')
  console.log('nome comecando com ponto).')
  process.exit(1)
}

const bruto = readFileSync(caminho, 'utf8')
const valores = {}
for (const linha of bruto.split(/\r?\n/)) {
  if (!linha.trim() || linha.trim().startsWith('#')) continue
  const i = linha.indexOf('=')
  if (i < 0) continue
  let v = linha.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1)
  }
  valores[linha.slice(0, i).trim()] = v
}

let problemas = 0

function conferir(nome, regras, obrigatoria = true) {
  const v = valores[nome]

  if (v === undefined) {
    if (obrigatoria) {
      problemas++
      console.log(`[FALTA]  ${nome}`)
      console.log(`         a linha nem existe no arquivo\n`)
    }
    return false
  }
  if (v === '') {
    problemas++
    console.log(`[VAZIA]  ${nome}`)
    console.log(`         a linha existe mas nao tem valor depois do =\n`)
    return false
  }

  const erros = regras.filter((r) => !r.ok(v)).map((r) => r.diga)
  if (erros.length > 0) {
    problemas++
    console.log(`[ERRO]   ${nome}  (${v.length} caracteres)`)
    for (const e of erros) console.log(`         ${e}`)
    console.log('')
    return false
  }

  console.log(`[ok]     ${nome}  (${v.length} caracteres)`)
  return true
}

conferir('DATABASE_URL', [
  {
    ok: (v) => v.startsWith('postgresql://') || v.startsWith('postgres://'),
    diga: 'deveria comecar com postgresql://',
  },
  {
    ok: (v) => !v.includes('[YOUR-PASSWORD]'),
    diga: 'ainda tem o marcador [YOUR-PASSWORD] no lugar da senha',
  },
  { ok: (v) => v.includes('@'), diga: 'nao tem o @ que separa a senha do servidor' },
])

conferir('NEXT_PUBLIC_SUPABASE_URL', [
  { ok: (v) => v.startsWith('https://'), diga: 'deveria comecar com https://' },
  {
    ok: (v) => v.includes('.supabase.'),
    diga: 'nao parece um endereco do Supabase',
  },
  { ok: (v) => !v.endsWith('/'), diga: 'tire a barra do final' },
])

const temNova = valores['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] !== undefined
const temAntiga = valores['NEXT_PUBLIC_SUPABASE_ANON_KEY'] !== undefined

if (!temNova && !temAntiga) {
  problemas++
  console.log('[FALTA]  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  console.log('         a linha nem existe no arquivo')
  console.log('         (o nome antigo, NEXT_PUBLIC_SUPABASE_ANON_KEY,')
  console.log('          tambem serve, mas nenhum dos dois esta ai)\n')
} else {
  const nome = temNova
    ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    : 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  conferir(nome, [
    { ok: (v) => v.length > 30, diga: 'parece curta demais para ser a chave' },
    { ok: (v) => !v.includes(' '), diga: 'tem espaco no meio, o que nao deveria' },
  ])
}

conferir(
  'ANTHROPIC_API_KEY',
  [
    {
      ok: (v) => v.startsWith('sk-ant-'),
      diga: 'a chave da Anthropic comeca com sk-ant-',
    },
    { ok: (v) => v.length > 40, diga: 'parece curta demais para ser a chave' },
    { ok: (v) => !v.includes(' '), diga: 'tem espaco no meio, o que nao deveria' },
  ],
  false,
)

if (valores['ANTHROPIC_API_KEY'] === undefined) {
  console.log('')
  console.log('[aviso]  ANTHROPIC_API_KEY ainda nao esta no arquivo.')
  console.log('         Sem ela o resto funciona, mas a geracao do')
  console.log('         planejamento pelo Claude nao roda.')
}

// A chave de servico e necessaria para CRIAR pessoas (convidar por
// e-mail, gerar senha temporaria). O que nao pode, em hipotese
// nenhuma, e ela levar o prefixo NEXT_PUBLIC_ no nome: e esse prefixo
// que manda a variavel para o navegador de todo mundo.
if (valores['NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'] !== undefined) {
  problemas++
  console.log('')
  console.log('[PERIGO] Existe uma variavel NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.')
  console.log('         O prefixo NEXT_PUBLIC_ manda o valor para o navegador de')
  console.log('         QUALQUER visitante. Essa chave passa por cima de todo o')
  console.log('         isolamento entre marcas.')
  console.log('')
  console.log('         Faca agora: apague a linha, e gere uma chave nova no')
  console.log('         painel do Supabase (Settings > API > service_role >')
  console.log('         Reset). A antiga precisa morrer.')
}

if (valores['SUPABASE_SERVICE_ROLE_KEY'] !== undefined) {
  const v = valores['SUPABASE_SERVICE_ROLE_KEY']
  const ehLegado = v.startsWith('eyJ')
  const ehNova = v.startsWith('sb_secret_')
  const ehPublica = v.startsWith('sb_publishable_')

  conferir('SUPABASE_SERVICE_ROLE_KEY', [
    { ok: (x) => x.length > 30, diga: 'parece curta demais para ser a chave' },
    { ok: (x) => !x.includes(' '), diga: 'tem espaco no meio, o que nao deveria' },
    {
      ok: () => !ehPublica,
      diga: 'isto e a chave PUBLICA (sb_publishable_), nao a de servico. Pegue a service_role.',
    },
    {
      ok: () => ehLegado || ehNova,
      diga: 'nao parece nem a service_role antiga (comeca com eyJ) nem a nova (sb_secret_)',
    },
  ])

  if (ehLegado) {
    console.log('         formato: service_role classica. E a que funciona melhor hoje.')
  } else if (ehNova) {
    console.log('         formato: chave secreta nova (sb_secret_).')
    console.log('         ATENCAO: ha relatos de que esse formato ainda falha em')
    console.log('         algumas operacoes. Se a tela de Pessoas der erro de')
    console.log('         "apikey invalid", troque pela service_role classica.')
  }
  console.log('         (so o servidor le esta. Nunca ponha NEXT_PUBLIC_ no nome.)')
} else {
  console.log('')
  console.log('[aviso]  SUPABASE_SERVICE_ROLE_KEY nao esta no arquivo.')
  console.log('         Sem ela voce ainda muda papel e vincula marca, mas a')
  console.log('         tela de pessoas nao consegue CRIAR ninguem novo.')
}

console.log('')
console.log('--------------------------------------------')
if (problemas === 0) {
  console.log(' Tudo preenchido e com cara certa.')
  console.log('')
  console.log(' LEMBRE: o servidor le este arquivo so ao iniciar.')
  console.log(' Feche a janela preta do 03-rodar.cmd e abra de novo.')
} else {
  console.log(` ${problemas} problema(s) acima. Corrija e rode este arquivo de novo.`)
}
console.log('--------------------------------------------')

process.exit(problemas === 0 ? 0 : 1)
