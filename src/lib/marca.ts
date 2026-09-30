/**
 * As regras de uma marca nova.
 *
 * Ficam aqui, fora da tela e fora da ação, porque as três precisam da
 * mesma resposta: o formulário para avisar enquanto a pessoa digita, a
 * ação do servidor para não confiar no que chegou do navegador, e o
 * script de linha de comando para criar marca sem tela.
 *
 * Validar só no formulário seria validar só para quem usa o
 * formulário, e a ação do servidor atende qualquer requisição.
 */

/**
 * O slug é o nome curto que aparece no endereço e nos comandos.
 *
 * Sem acento, sem espaço, minúsculo. Não é preciosismo: ele vira parte
 * de uma URL e argumento de linha de comando, e os dois quebram feio
 * com acento e espaço.
 */
export function arrumarSlug(bruto: string | null | undefined): string {
  return String(bruto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type LinhaDeEscopo = { label: string; quota: number }

export type Problema = { campo: 'nome' | 'slug' | 'escopo'; texto: string }

/** Nomes que não podem virar slug porque já são rota do sistema. */
const RESERVADOS = new Set([
  'painel', 'cliente', 'entrar', 'conta', 'api', 'marca', 'marcas',
  'pessoas', 'agenda', 'qualidade', 'novo', 'nova', 'admin',
])

/**
 * Confere uma marca nova antes de gravar.
 *
 * Devolve a lista de problemas, vazia quando está tudo certo. Lista em
 * vez de primeiro erro porque corrigir um campo por vez, com uma volta
 * ao servidor entre cada um, é a maneira mais chata possível de
 * preencher um formulário.
 */
export function conferirMarca(e: {
  nome: string
  slug: string
  escopo: LinhaDeEscopo[]
}): Problema[] {
  const problemas: Problema[] = []
  const nome = (e.nome ?? '').trim()
  const slug = (e.slug ?? '').trim()

  if (nome.length < 2) {
    problemas.push({ campo: 'nome', texto: 'O nome precisa de pelo menos duas letras.' })
  }
  if (nome.length > 80) {
    problemas.push({ campo: 'nome', texto: 'O nome ficou longo demais para caber nas telas.' })
  }

  if (!slug) {
    problemas.push({ campo: 'slug', texto: 'O endereço curto não pode ficar em branco.' })
  } else if (slug !== arrumarSlug(slug)) {
    problemas.push({
      campo: 'slug',
      texto: 'O endereço curto só aceita letras sem acento, números e hífen.',
    })
  } else if (slug.length < 2) {
    problemas.push({ campo: 'slug', texto: 'O endereço curto precisa de pelo menos duas letras.' })
  } else if (RESERVADOS.has(slug)) {
    problemas.push({
      campo: 'slug',
      texto: `"${slug}" já é usado pelo próprio sistema. Escolha outro.`,
    })
  }

  const vistos = new Set<string>()
  for (const linha of e.escopo) {
    const label = (linha.label ?? '').trim()
    if (!label) {
      problemas.push({ campo: 'escopo', texto: 'Uma das linhas do escopo está sem nome.' })
      continue
    }
    const chave = label.toLowerCase()
    if (vistos.has(chave)) {
      problemas.push({ campo: 'escopo', texto: `A linha "${label}" aparece duas vezes.` })
    }
    vistos.add(chave)

    // Cota zero seria pior que linha nenhuma: o escopo é restrição
    // dura na geração, e uma linha com zero faria a IA fechar um mês
    // vazio sem reclamar de nada.
    if (!Number.isInteger(linha.quota) || linha.quota <= 0) {
      problemas.push({
        campo: 'escopo',
        texto: `A quantidade de "${label}" precisa ser um número inteiro maior que zero.`,
      })
    } else if (linha.quota > 200) {
      problemas.push({
        campo: 'escopo',
        texto: `${linha.quota} publicações por mês em "${label}" parece engano.`,
      })
    }
  }

  return problemas
}

/**
 * Quais linhas do escopo antigo deixam de valer.
 *
 * Existe como função separada, e recebe as duas listas prontas, por um
 * motivo prático: a comparação por NOME é a parte fácil de errar. Uma
 * linha que a pessoa renomeou de "Feed" para "Feed Instagram" é, para
 * o banco, uma linha nova e uma linha que saiu, e é assim mesmo que
 * tem de ser: os meses já gerados apontam para a linha antiga pelo id,
 * e mexer nela mudaria o passado.
 *
 * O que sai é DESATIVADO, nunca apagado, e essa decisão fica na ação
 * que chama. Aqui só se responde quem sai.
 */
export function escopoQueSai<T extends { label: string }>(
  antes: T[],
  agora: { label: string }[],
): T[] {
  const ficam = new Set(agora.map((l) => l.label))
  return antes.filter((l) => !ficam.has(l.label))
}
