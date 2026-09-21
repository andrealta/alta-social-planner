/**
 * Sem travessão nos textos que a IA gera.
 *
 * O prompt já pede, mas pedido não é garantia: o modelo escorrega, e o
 * travessão (—) é uma das marcas mais visíveis de texto escrito por IA.
 * Então toda resposta em JSON passa por aqui antes de ser gravada, e a
 * troca é feita em código, sempre do mesmo jeito:
 *
 *   "isso — aquilo"      vira  "isso, aquilo"
 *   "isso — aquilo —, e" vira  "isso, aquilo, e"
 *   "isso—aquilo"        vira  "isso, aquilo"
 *   "— fala" no começo   vira  "- fala"
 *   "fim —" no final     vira  "fim"
 *   "10—12"              vira  "10 a 12"
 *
 * O meia-risca entre números ("4–8") fica como está: é intervalo, não
 * pausa de frase. Entre palavras, com espaço dos dois lados, ele vira
 * vírgula como o travessão, porque o modelo usa um pelo outro.
 */

const TRAVESSAO = '—'
const MEIA = '–'

export function semTravessao(texto: string): string {
  if (!texto.includes(TRAVESSAO) && !texto.includes(MEIA)) return texto

  return texto
    .split('\n')
    .map((linha) => {
      let s = linha
      // Começo de linha: diálogo ou item de lista.
      s = s.replace(/^(\s*)[—–]\s*/, '$1- ')
      // Fim de linha: travessão solto no final some.
      s = s.replace(/\s*[—–]\s*$/, '')
      // Número com travessão colado em número: intervalo.
      s = s.replace(/(\d)\s*—\s*(\d)/g, '$1 a $2')
      // Travessão logo antes de pontuação ("aquilo —, e"): fica a pontuação.
      s = s.replace(/\s*[—–]\s*([,.;:!?)])/g, '$1')
      // Depois de pontuação que abre ("(— x"): some.
      s = s.replace(/([(“"])\s*[—–]\s*/g, '$1')
      // Entre palavras, com ou sem espaço: vírgula.
      s = s.replace(/\s*—\s*/g, ', ')
      s = s.replace(/\s+–\s+/g, ', ')
      // Arrumação do que sobrou.
      s = s.replace(/,\s*,/g, ',')
      s = s.replace(/,\s*([.;:!?])/g, '$1')
      s = s.replace(/(\S) {2,}/g, '$1 ')
      return s
    })
    .join('\n')
}

/** Aplica em todo texto de um objeto vindo da IA, sem mexer nas chaves. */
export function limparTravessoes<T>(valor: T): T {
  if (typeof valor === 'string') return semTravessao(valor) as T
  if (Array.isArray(valor)) return valor.map((v) => limparTravessoes(v)) as T
  if (valor && typeof valor === 'object') {
    const saida: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      saida[k] = limparTravessoes(v)
    }
    return saida as T
  }
  return valor
}
