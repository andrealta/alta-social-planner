/**
 * Registro de passos, em arquivo, só em desenvolvimento.
 *
 * Existe porque o servidor roda numa janela preta que some, e quando
 * uma geração trava eu preciso saber EM QUE PASSO ela travou — não
 * adianta saber que travou.
 *
 * Grava em `geracao.log`, na raiz do projeto. Nunca grava chave, senha
 * nem conteúdo de pauta: só o nome do passo e quanto tempo levou.
 * Em produção não faz nada.
 */

import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

const LIGADO = process.env.NODE_ENV !== 'production'
const ARQUIVO = join(process.cwd(), 'geracao.log')

export function registro(assunto: string) {
  const t0 = Date.now()
  let anterior = t0

  return {
    async passo(nome: string, detalhe?: string | number) {
      if (!LIGADO) return
      const agora = Date.now()
      const desdeOPasso = agora - anterior
      anterior = agora
      const linha =
        `${new Date(agora).toISOString()}  ${assunto}  ` +
        `+${String(desdeOPasso).padStart(6)}ms  total ${String(agora - t0).padStart(7)}ms  ` +
        `${nome}${detalhe !== undefined ? '  (' + detalhe + ')' : ''}\n`
      try {
        await appendFile(ARQUIVO, linha, 'utf8')
      } catch {
        // Se não der para gravar o log, a geração segue. Diagnóstico
        // não pode ser motivo de falha.
      }
    },
  }
}
