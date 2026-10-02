/**
 * Espelho: a ponte para as telas que ficam fundo demais.
 *
 * Por que isto existe. Eu (Claude) leio os arquivos da sua máquina por
 * uma ponte que só alcança sete pastas de profundidade. As telas do
 * calendário moram mais fundo que isso:
 *
 *   src/app/painel/marca/[slug]/calendario/[ano]/[mes]/painel.tsx
 *
 * São oito pastas. Resultado: eu escrevia nesses arquivos sem nunca
 * poder LER de volta o que tinha escrito. Já aconteceu de um arquivo
 * meu não chegar ao disco e eu não perceber — a página de progresso
 * ficou três dias mostrando 63%.
 *
 * O espelho resolve pelo caminho mais simples: copia tudo para uma
 * pasta rasa, `_espelho/`, com o caminho embutido no nome do arquivo.
 * Rasa eu alcanço. Aí eu leio, corrijo, devolvo — e o `voltar`
 * reposiciona cada arquivo no lugar certo e confere pelo resumo
 * criptográfico se chegou idêntico.
 *
 * Nada de `_espelho/` entra no Git.
 *
 * APAGAR. O espelho sabia escrever e não sabia apagar, e isso custou
 * um deploy: uma rodada removeu uma função, o arquivo órfão que a
 * chamava continuou no projeto porque só um script avulso o apagava, o
 * script não foi rodado e a compilação quebrou em produção. Agora uma
 * rodada que precisa remover arquivos manda junto um `_espelho/
 * _apagar.txt`, um caminho por linha, e o `voltar` cuida disso no
 * mesmo passo. Sem passo extra para ninguém lembrar.
 *
 * Ele apaga também a cópia espelhada do arquivo, sempre, sem precisar
 * ser pedido. Senão o arquivo ressuscitaria no `voltar` seguinte — que
 * é exatamente a armadilha que este mecanismo existe para fechar.
 *
 * FOTOGRAFIA OU MUDANÇA. Este é o ponto mais delicado do arquivo, e
 * ele mudou quando o sistema passou a ter mais de uma pessoa mexendo.
 *
 * O `enviar` copia o projeto INTEIRO para cá. O espelho é, portanto,
 * uma fotografia de um instante. Até a rodada 92, o `voltar` devolvia
 * ao projeto todo arquivo cujo conteúdo estivesse diferente — e isso,
 * com duas pessoas, desfaz trabalho em silêncio:
 *
 *   Segunda, a Marina roda o `enviar`. O espelho dela é a foto de
 *   segunda. Terça, o André publica uma melhoria. Quarta, a Marina dá
 *   `git pull` e recebe a terça do André, pede uma coisa ao Claude,
 *   que escreve DOIS arquivos no espelho dela, e roda o `voltar`. O
 *   `voltar` devolve tudo o que está diferente, inclusive a terça do
 *   André, que na foto de segunda ainda é a versão velha. A melhoria
 *   dele é desfeita, a compilação passa (o código é coerente, só é
 *   mais velho) e ninguém percebe.
 *
 * O mesmo acontece com uma pessoa só: rodar o `enviar`, editar um
 * arquivo no VS Code e rodar o `voltar` reverte a edição.
 *
 * A correção: o `enviar` grava o resumo criptográfico de cada arquivo
 * em `_origem.txt`. O `voltar` recalcula e devolve ao projeto SÓ os
 * arquivos cujo resumo mudou dentro do espelho — que são exatamente os
 * que o Claude escreveu. O resto é fotografia e não é tocado.
 *
 * O espelho deixa de ser "restaure tudo" e passa a ser "aplique estas
 * mudanças", que é o que ele sempre deveria ter sido.
 *
 * Uma consequência de propósito: arquivo apagado do projeto à mão não
 * volta mais sozinho. O espelho nunca foi backup — quem guarda versão
 * é o Git.
 *
 * Uso:
 *   node scripts/espelho.mjs            copia do projeto para _espelho
 *   node scripts/espelho.mjs voltar     devolve _espelho para o projeto
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join, dirname, relative, sep, isAbsolute, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const pastaEspelho = join(raiz, '_espelho')

// De onde o espelho tira arquivos. Fora disto, nada é copiado —
// e, no caminho de volta, nada é escrito.
const PASTAS = ['src', 'supabase', 'scripts']
const SOLTOS = ['middleware.ts', 'next.config.ts', 'package.json', 'tsconfig.json', 'vercel.json']
const EXTENSOES = ['.ts', '.tsx', '.css', '.sql', '.mjs', '.json', '.md']
const IGNORAR = ['node_modules', '.next', '.git', '_espelho', 'out', 'build']

/** O arquivo que lista o que apagar. Fica fora das extensões copiadas. */
const LISTA_APAGAR = '_apagar.txt'

/**
 * De quando é a fotografia, e com que conteúdo.
 *
 * Também `.txt`, pelo mesmo motivo do `_apagar.txt`: a lista de
 * extensões copiadas não inclui `.txt`, então ele é ignorado pelo laço
 * que devolve arquivos ao projeto, sem precisar de exceção nenhuma.
 */
const ORIGEM = '_origem.txt'

/** Em que commit o projeto está. Sem Git instalado, segue sem isso. */
function commitAtual(raiz) {
  try {
    const sai = (args) =>
      execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return { commit: sai(['rev-parse', 'HEAD']), ramo: sai(['rev-parse', '--abbrev-ref', 'HEAD']) }
  } catch {
    return { commit: 'sem-git', ramo: 'sem-git' }
  }
}

/** O que um arquivo solto na raiz pode ser, para poder ser apagado. */
const EXTENSOES_RAIZ = [...EXTENSOES, '.cmd', '.txt']

const resumo = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12)
const achatar = (rel) => rel.split(sep).join('__')
const desachatar = (nome) => nome.split('__').join(sep)

function varrer(dir, achado = []) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.includes(item.name)) continue
    const caminho = join(dir, item.name)
    if (item.isDirectory()) varrer(caminho, achado)
    else if (EXTENSOES.some((e) => item.name.endsWith(e))) achado.push(caminho)
  }
  return achado
}

/** O caminho de volta precisa cair dentro do projeto, e só nos lugares previstos. */
function destinoPermitido(rel) {
  const primeiro = rel.split(sep)[0]
  if (rel.includes('..')) return false
  if (PASTAS.includes(primeiro)) return true
  if (rel.split(sep).length === 1 && SOLTOS.includes(rel)) return true
  return false
}

/**
 * Pode apagar este caminho?
 *
 * Lista de apagar é uma arma carregada: ela roda sem ninguém olhar, na
 * máquina de quem não lê código. Então a regra é fechada por padrão e
 * só abre onde o espelho já escreve, mais os arquivos soltos da raiz
 * (os `.cmd` numerados, que às vezes nascem para uma vez só).
 *
 * Fora: caminho absoluto, `..`, qualquer coisa começando com ponto
 * (`.env`, `.git`), e pasta — apaga arquivo, nunca diretório.
 */
function destinoApagavel(rel) {
  if (typeof rel !== 'string') return { ok: false, porque: 'não é texto' }
  const limpo = rel.trim().split('/').join(sep)
  if (!limpo) return { ok: false, porque: 'linha vazia' }
  if (isAbsolute(limpo)) return { ok: false, porque: 'caminho absoluto' }
  if (/^[A-Za-z]:/.test(limpo)) return { ok: false, porque: 'caminho com letra de disco' }

  const partes = normalize(limpo).split(sep).filter(Boolean)
  if (partes.some((p) => p === '..')) return { ok: false, porque: 'sobe de pasta' }
  if (partes.some((p) => p.startsWith('.'))) return { ok: false, porque: 'arquivo ou pasta oculta' }
  if (partes.some((p) => IGNORAR.includes(p))) return { ok: false, porque: 'pasta que o espelho não toca' }

  if (partes.length === 1) {
    return EXTENSOES_RAIZ.some((e) => partes[0].endsWith(e))
      ? { ok: true, rel: partes.join(sep) }
      : { ok: false, porque: 'arquivo solto na raiz com extensão inesperada' }
  }
  if (!PASTAS.includes(partes[0])) {
    return { ok: false, porque: 'fora das pastas do espelho' }
  }
  return { ok: true, rel: partes.join(sep) }
}

const linha = '--------------------------------------------------------'
const modo = (process.argv[2] || 'enviar').toLowerCase()

// =============================================================
// Projeto  ->  _espelho
// =============================================================
if (modo === 'enviar') {
  if (existsSync(pastaEspelho)) rmSync(pastaEspelho, { recursive: true, force: true })
  mkdirSync(pastaEspelho, { recursive: true })

  const arquivos = []
  for (const p of PASTAS) {
    const dir = join(raiz, p)
    if (existsSync(dir)) arquivos.push(...varrer(dir))
  }
  for (const s of SOLTOS) {
    const c = join(raiz, s)
    if (existsSync(c) && statSync(c).isFile()) arquivos.push(c)
  }

  console.log('')
  console.log(linha)
  console.log(' Espelho criado')
  console.log(linha)
  console.log('')

  let fundos = 0
  const resumos = []
  for (const caminho of arquivos) {
    const rel = relative(raiz, caminho)
    const conteudo = readFileSync(caminho)
    writeFileSync(join(pastaEspelho, achatar(rel)), conteudo)
    resumos.push(`${resumo(conteudo)} ${achatar(rel)}`)
    if (rel.split(sep).length - 1 > 6) fundos++
  }

  // A fotografia, assinada. E o que permite ao `voltar` saber depois
  // quais arquivos mudaram DENTRO do espelho e quais sao so copia.
  const onde = commitAtual(raiz)
  writeFileSync(
    join(pastaEspelho, ORIGEM),
    [
      '# De onde esta fotografia foi tirada. Nao edite este arquivo.',
      `commit ${onde.commit}`,
      `ramo ${onde.ramo}`,
      `criado ${new Date().toISOString()}`,
      '',
      ...resumos,
      '',
    ].join('\n'),
  )

  console.log(`  ${arquivos.length} arquivo(s) copiado(s) para a pasta _espelho`)
  console.log(`  ${fundos} deles estavam fundo demais para eu enxergar antes`)
  if (onde.commit !== 'sem-git') {
    console.log(`  Fotografia do commit ${onde.commit.slice(0, 8)} (ramo ${onde.ramo})`)
  }
  console.log('')
  console.log('  Pode fechar esta janela. Me avise que o espelho esta pronto.')
  console.log('')
  process.exit(0)
}

// =============================================================
// _espelho  ->  Projeto
// =============================================================
if (modo === 'voltar') {
  if (!existsSync(pastaEspelho)) {
    console.log('')
    console.log('  Nao existe pasta _espelho. Rode o 14-espelho.cmd primeiro.')
    console.log('')
    process.exit(1)
  }

  const nomes = readdirSync(pastaEspelho).filter((n) => EXTENSOES.some((e) => n.endsWith(e)))

  // ----------------------------------------------------------
  // A fotografia: o que é cópia e o que é mudança
  // ----------------------------------------------------------
  //
  // Sem o `_origem.txt` não dá para distinguir, e aí só resta o
  // comportamento antigo: comparar com o projeto e devolver o que
  // estiver diferente. Acontece com espelho feito por uma versão
  // anterior deste script. A tela avisa, porque nesse modo o espelho
  // pode desfazer trabalho de outra pessoa.
  const caminhoOrigem = join(pastaEspelho, ORIGEM)
  const temOrigem = existsSync(caminhoOrigem)
  const assinatura = new Map()
  let commitDaFoto = null
  let ramoDaFoto = null

  if (temOrigem) {
    for (const l of readFileSync(caminhoOrigem, 'utf8').split(/\r?\n/)) {
      const t = l.trim()
      if (!t || t.startsWith('#')) continue
      if (t.startsWith('commit ')) { commitDaFoto = t.slice(7).trim(); continue }
      if (t.startsWith('ramo ')) { ramoDaFoto = t.slice(5).trim(); continue }
      if (t.startsWith('criado ')) continue
      const i = t.indexOf(' ')
      if (i > 0) assinatura.set(t.slice(i + 1), t.slice(0, i))
    }
  }

  const agora = commitAtual(raiz)
  const andou =
    commitDaFoto && commitDaFoto !== 'sem-git' && agora.commit !== 'sem-git' &&
    commitDaFoto !== agora.commit

  console.log('')
  console.log(linha)
  console.log(' Devolvendo o espelho para o projeto')
  console.log(linha)
  console.log('')

  if (!temOrigem) {
    console.log('  AVISO: este espelho nao diz de quando e (foi feito por uma')
    console.log('  versao anterior deste script). Sem isso eu nao consigo')
    console.log('  separar o que o Claude escreveu do que e so copia, e vou')
    console.log('  devolver TUDO o que estiver diferente. Se outra pessoa')
    console.log('  mexeu no projeto desde entao, o trabalho dela pode ser')
    console.log('  desfeito. Rode o 14-espelho.cmd antes da proxima rodada.')
    console.log('')
  } else if (andou) {
    console.log('  AVISO: o projeto andou desde que a fotografia foi tirada.')
    console.log(`    fotografia: commit ${String(commitDaFoto).slice(0, 8)} (ramo ${ramoDaFoto})`)
    console.log(`    projeto:    commit ${agora.commit.slice(0, 8)} (ramo ${agora.ramo})`)
    console.log('')
    console.log('  Vou devolver apenas os arquivos que mudaram dentro do')
    console.log('  espelho, entao nada do que chegou no meio e desfeito. Mas')
    console.log('  esses arquivos foram escritos olhando a versao antiga:')
    console.log('  confira o resultado antes de publicar.')
    console.log('')
  }

  let mudados = 0
  let iguais = 0
  let fotografia = 0
  let recusados = 0
  let falhas = 0

  for (const nome of nomes) {
    const rel = desachatar(nome)

    if (!destinoPermitido(rel)) {
      console.log(`  RECUSADO  ${rel}`)
      console.log('            (fora das pastas previstas — nada foi escrito)')
      recusados++
      continue
    }

    const origem = join(pastaEspelho, nome)
    const destino = join(raiz, rel)
    const novo = readFileSync(origem)

    // O coracao da correcao. Se o arquivo esta no espelho exatamente
    // como entrou, ele e fotografia: ninguem o escreveu, e devolve-lo
    // ao projeto so pode fazer mal — e o que desfazia trabalho dos
    // outros. Nem se compara com o projeto: nao interessa se ele mudou
    // la, porque nao e esta rodada que tem o que dizer sobre ele.
    if (temOrigem && assinatura.get(nome) === resumo(novo)) {
      fotografia++
      continue
    }

    const atual = existsSync(destino) ? readFileSync(destino) : null

    if (atual && atual.equals(novo)) {
      iguais++
      continue
    }

    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, novo)

    // A conferência é o ponto do exercício: reler do disco e comparar.
    const gravado = readFileSync(destino)
    const ok = gravado.equals(novo)
    if (!ok) falhas++
    mudados++

    console.log(`  ${ok ? 'GRAVADO  ' : 'FALHOU   '} ${rel}`)
    console.log(`            ${atual ? 'atualizado' : 'NOVO'} · ${resumo(novo)} · ${novo.length} bytes`)
  }

  // ----------------------------------------------------------
  // E o que esta rodada pede para apagar
  // ----------------------------------------------------------
  //
  // Depois de gravar, nunca antes: se a gravação falhar no meio, o
  // projeto ainda está inteiro. Apagar é a última coisa.
  const listaApagar = join(pastaEspelho, LISTA_APAGAR)
  let apagados = 0

  if (existsSync(listaApagar)) {
    const linhas = readFileSync(listaApagar, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))

    if (linhas.length > 0) {
      console.log('')
      console.log('  Esta rodada pede para apagar:')
    }

    for (const bruta of linhas) {
      const juizo = destinoApagavel(bruta)
      if (!juizo.ok) {
        console.log(`  RECUSADO  ${bruta}`)
        console.log(`            (${juizo.porque} — nada foi apagado)`)
        recusados++
        continue
      }

      const alvo = join(raiz, juizo.rel)
      // A cópia espelhada sai junto, sempre. Sem isto o arquivo
      // ressuscita no proximo `voltar`.
      const copia = join(pastaEspelho, achatar(juizo.rel))
      let mexeu = false

      for (const c of [alvo, copia]) {
        if (!existsSync(c)) continue
        if (statSync(c).isDirectory()) {
          console.log(`  RECUSADO  ${juizo.rel}`)
          console.log('            (e uma pasta — o espelho so apaga arquivo)')
          recusados++
          continue
        }
        rmSync(c, { force: true })
        mexeu = true
      }

      if (mexeu) {
        apagados++
        console.log(`  APAGADO   ${juizo.rel}`)
      } else {
        console.log(`  ja nao existia  ${juizo.rel}`)
      }
    }

    // A lista vale para esta rodada e acaba aqui. Deixá-la no lugar
    // faria o `voltar` seguinte repetir ordens velhas sobre arquivos
    // que podem ter voltado a existir por outro motivo.
    rmSync(listaApagar, { force: true })
  }

  console.log('')
  console.log(linha)
  console.log(`  ${mudados} arquivo(s) alterado(s), ${iguais} sem mudanca` +
    (fotografia ? `, ${fotografia} intocado(s) no espelho` : '') +
    (apagados ? `, ${apagados} apagado(s)` : '') +
    (recusados ? `, ${recusados} recusado(s)` : '') +
    (falhas ? `, ${falhas} FALHA(S)` : ''))
  console.log(linha)
  console.log('')

  if (falhas === 0 && recusados === 0) {
    console.log('  Tudo conferido: o que saiu do espelho chegou identico ao disco.')
  } else {
    console.log('  Atencao: olhe as linhas acima. Me mande esta tela.')
  }
  console.log('')
  process.exit(falhas || recusados ? 1 : 0)
}

console.log('')
console.log(`  Nao conheco o modo "${modo}". Use: enviar (padrao) ou voltar.`)
console.log('')
process.exit(1)
