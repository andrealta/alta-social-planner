/**
 * A leitura da resposta e a conferencia das fontes.
 *
 * Mora fora do script de linha de comando porque estas tres funcoes
 * sao onde ele erra em silencio: JSON que nao veio no formato,
 * endereco ilegivel, e a nota citando fonte que ninguem leu. Erro em
 * silencio so aparece com teste em cima, e teste precisa poder
 * importar a funcao sem o script abrir conexao com o banco.
 */

/**
 * Le o JSON da resposta, e nunca inventa quando nao conseguir.
 *
 * Devolve `cru: true` quando nao deu para entender. Isso importa: a
 * alternativa seria gravar nota vazia, e nota vazia aprovada por
 * engano tira a fonte do ar sem ninguem perceber. Texto estranho
 * marcado como estranho, pelo menos, alguem le.
 */
export function lerNota(texto) {
  const t = String(texto ?? '')
  const abre = t.indexOf('{')
  const fecha = t.lastIndexOf('}')
  if (abre >= 0 && fecha > abre) {
    try {
      const j = JSON.parse(t.slice(abre, fecha + 1))
      if (typeof j.texto === 'string' && j.texto.trim()) {
        return {
          texto: j.texto.trim(),
          fontes: Array.isArray(j.fontes)
            ? j.fontes
                .filter((f) => f && typeof f.url === 'string' && f.url.trim())
                .map((f) => ({ titulo: String(f.titulo ?? '').trim(), url: f.url.trim() }))
            : [],
          mudou: j.mudou !== false,
          cru: false,
        }
      }
    } catch {
      // Cai no caminho de baixo.
    }
  }
  return { texto: t.trim(), fontes: [], mudou: true, cru: true }
}

/** O dominio de um endereco, sem `www.`. Endereco torto nao derruba. */
export function dominioDe(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '')
  } catch {
    return '(endereco ilegivel)'
  }
}

/**
 * As duas listas, comparadas.
 *
 * `fontes` e o que a nota diz que usou. `lidas` e o que a API diz que
 * foi aberto. Elas existem separadas justamente para poderem divergir.
 *
 * `inventadas` e a que importa: endereco citado na nota que nao
 * aparece em leitura nenhuma. Nao prova ma-fe, mas e exatamente o
 * lugar onde um link errado passaria despercebido.
 *
 * `naoCitadas` e o contrario e e normal: ler cinco paginas e usar duas
 * e o esperado. Esta aqui so para o numero de leituras nao assustar.
 */
export function divergencia(fontes, lidas) {
  const f = Array.isArray(fontes) ? fontes.filter((x) => x && x.url) : []
  const l = Array.isArray(lidas) ? lidas.filter((x) => x && x.url) : []
  const urlsLidas = new Set(l.map((x) => x.url))
  const urlsCitadas = new Set(f.map((x) => x.url))

  const porDominio = new Map()
  for (const x of l) {
    const d = dominioDe(x.url)
    porDominio.set(d, (porDominio.get(d) ?? 0) + 1)
  }

  return {
    lidas: l.length,
    citadas: f.length,
    inventadas: f.filter((x) => !urlsLidas.has(x.url)),
    naoCitadas: l.filter((x) => !urlsCitadas.has(x.url)).length,
    porDominio: [...porDominio.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  }
}
