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
  for (const caminho of arquivos) {
    const rel = relative(raiz, caminho)
    const conteudo = readFileSync(caminho)
    writeFileSync(join(pastaEspelho, achatar(rel)), conteudo)
    if (rel.split(sep).length - 1 > 6) fundos++
  }

  console.log(`  ${arquivos.length} arquivo(s) copiado(s) para a pasta _espelho`)
  console.log(`  ${fundos} deles estavam fundo demais para eu enxergar antes`)
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

  console.log('')
  console.log(linha)
  console.log(' Devolvendo o espelho para o projeto')
  console.log(linha)
  console.log('')

  let mudados = 0
  let iguais = 0
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
