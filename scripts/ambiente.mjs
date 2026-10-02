/**
 * Em qual banco este computador está mexendo.
 *
 * POR QUE ISTO EXISTE. Os scripts desta pasta conectam direto no banco
 * pela DATABASE_URL, por cima de todas as políticas de isolamento. Um
 * deles, o `carregar.mjs`, grava a base de conhecimento das marcas com
 * `on conflict do update` — ou seja, se rodar apontando para produção
 * com o `carga.json` antigo, ele SUBSTITUI a base construída de cada
 * cliente pelos dados de exemplo do MVP. É um duplo clique de
 * distância, e hoje nada avisa.
 *
 * Com uma pessoa só isso era um risco pequeno, porque ela sabia de cor
 * o que cada arquivo faz. Com duas pessoas, e uma delas aprendendo,
 * vira questão de tempo. O jeito mais fácil de alguém começar é copiar
 * o `.env.local` de quem já trabalha, e nesse momento o computador
 * novo está apontado para produção sem ninguém ter decidido isso.
 *
 * COMO FUNCIONA. Uma linha no `.env.local`:
 *
 *   AMBIENTE=producao           ou        AMBIENTE=desenvolvimento
 *
 * Todo script que escreve mostra, antes de agir, em que banco vai
 * mexer. Os que podem estragar dado de cliente pedem confirmação
 * digitada quando o ambiente é produção.
 *
 * FALHA ABERTO, DE PROPÓSITO. Sem a linha `AMBIENTE`, nada para de
 * funcionar: o script avisa que o ambiente não foi declarado e trata
 * como se fosse produção, que é a suposição mais cuidadosa. Fazer
 * falhar fechado quebraria a rotina de quem já trabalha no dia em que
 * esta mudança chegasse, e trava que quebra o trabalho de todo dia é
 * trava que alguém desliga.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createInterface } from 'node:readline'

/** Lê o `.env.local` da raiz do projeto. Devolve objeto vazio se não houver. */
export function lerEnvLocal(caminho) {
  if (!existsSync(caminho)) return {}
  const out = {}
  for (const l of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    if (!l.trim() || l.trim().startsWith('#')) continue
    const i = l.indexOf('=')
    if (i < 0) continue
    let v = l.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[l.slice(0, i).trim()] = v
  }
  return out
}

/**
 * O apelido do projeto no Supabase, para a pessoa SABER qual banco é.
 *
 * Sai do endereço público (`https://abcd.supabase.co`) ou do usuário da
 * conexão (`postgres.abcd`). Não é segredo: ele aparece no navegador de
 * qualquer visitante. A senha, que está na mesma linha da
 * DATABASE_URL, nunca é lida nem impressa por esta função.
 */
export function projetoDoSupabase(env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  const pelaUrl = url.match(/^https?:\/\/([a-z0-9]{8,})\.supabase\./i)
  if (pelaUrl) return pelaUrl[1]

  const banco = String(env.DATABASE_URL ?? '')
  const peloUsuario = banco.match(/\/\/postgres\.([a-z0-9]{8,})[:@]/i)
  if (peloUsuario) return peloUsuario[1]

  const peloHost = banco.match(/@(?:[a-z0-9.-]*\.)?([a-z0-9]{8,})\.supabase\./i)
  if (peloHost) return peloHost[1]

  return null
}

/**
 * O que este computador está apontando.
 *
 * `producao` é o padrão quando ninguém declarou: supor o lado perigoso
 * é o único erro que não custa caro.
 */
export function lerAmbiente(env) {
  const bruto = String(env.AMBIENTE ?? '').trim().toLowerCase()
  const declarado = bruto !== ''

  const dev = ['desenvolvimento', 'dev', 'local', 'teste', 'staging']
  const prod = ['producao', 'produção', 'prod', 'production']

  let nome = 'producao'
  if (dev.includes(bruto)) nome = 'desenvolvimento'
  else if (prod.includes(bruto)) nome = 'producao'
  else if (declarado) nome = 'desconhecido'

  return {
    nome,
    declarado,
    ehProducao: nome !== 'desenvolvimento',
    projeto: projetoDoSupabase(env),
  }
}

/**
 * O aviso, em linhas, para quem chamar imprimir.
 *
 * Função pura para poder ser testada. Aviso de segurança que ninguém
 * testa é aviso que um dia sai errado justamente na hora em que
 * alguém precisava lê-lo.
 */
export function aviso(env, acao) {
  const a = lerAmbiente(env)
  const borda = '  ' + '='.repeat(54)
  const linhas = []

  if (a.nome === 'desenvolvimento') {
    linhas.push(`  Ambiente: DESENVOLVIMENTO${a.projeto ? `  (projeto ${a.projeto})` : ''}`)
    if (acao) linhas.push(`  Acao: ${acao}`)
    return linhas
  }

  linhas.push('')
  linhas.push(borda)
  linhas.push(
    a.declarado && a.nome === 'producao'
      ? '   ATENCAO: este computador aponta para PRODUCAO'
      : '   ATENCAO: ambiente NAO declarado, tratando como PRODUCAO',
  )
  linhas.push(borda)
  if (a.projeto) linhas.push(`   Projeto no Supabase: ${a.projeto}`)
  if (acao) linhas.push(`   Acao: ${acao}`)
  linhas.push('   Este banco tem dados reais de cliente.')
  if (!a.declarado) {
    linhas.push('')
    linhas.push('   Para parar de ver este aviso, escreva no .env.local:')
    linhas.push('     AMBIENTE=producao           (se for o banco de verdade)')
    linhas.push('     AMBIENTE=desenvolvimento    (se for um banco de testes)')
  }
  linhas.push(borda)
  return linhas
}

/** Imprime o aviso. */
export function avisar(env, acao) {
  for (const l of aviso(env, acao)) console.log(l)
}

/**
 * Pergunta antes de deixar passar, quando o banco é de produção.
 *
 * Pede a palavra inteira, e não "s/n": a mão aperta "s" sem ler, e o
 * ponto de uma confirmação é obrigar a leitura. Em desenvolvimento não
 * pergunta nada — atrito onde não há risco é atrito que ensina a
 * ignorar o aviso que importa.
 */
export async function confirmarEmProducao(env, acao, palavra = 'PRODUCAO') {
  const a = lerAmbiente(env)
  if (!a.ehProducao) return true

  avisar(env, acao)
  console.log('')
  console.log(`  Se e isso mesmo que voce quer, digite  ${palavra}  e tecle Enter.`)
  console.log('  Qualquer outra coisa cancela.')
  console.log('')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const resposta = await new Promise((r) => rl.question('  > ', (x) => { rl.close(); r(x) }))

  if (String(resposta).trim().toUpperCase() !== palavra) {
    console.log('')
    console.log('  Cancelado. Nada foi alterado.')
    console.log('')
    return false
  }
  return true
}
