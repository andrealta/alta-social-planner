/**
 * De onde sai a voz da marca.
 *
 * A base descreve a marca com adjetivos — "tom acolhedor", "expressões
 * recomendadas". Adjetivo é a instrução mais fraca que existe para um
 * modelo de linguagem: pedir "acolhedor mas sofisticado" devolve
 * exatamente o texto médio da internet, porque é assim que a internet
 * escreve quando pedem isso.
 *
 * Estilo se ensina por exemplo e por contraste. Este arquivo junta as
 * quatro fontes de exemplo que o sistema tem:
 *
 *   1. legendas reais que a equipe colou na base (a partida);
 *   2. anti-exemplos — o que a marca jamais publicaria;
 *   3. as CORREÇÕES que a equipe já fez em cima do texto da IA, com o
 *      motivo escrito. Isso já estava no banco desde o começo, servindo
 *      só de histórico. É o material mais valioso aqui: par rotulado de
 *      "estava assim / ficou assim / porque";
 *   4. os pedidos de alteração do cliente, que é a marca falando de si.
 *
 * As três últimas crescem sozinhas com o uso. A primeira é a única que
 * depende de alguém sentar e colar texto — e só faz falta nos primeiros
 * meses, enquanto não há histórico.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type Correcao = {
  campo: string
  antes: string
  depois: string
  motivo: string | null
}

export type Estilo = {
  amostras: string[]
  anti: string[]
  aprovadas: string[]
  correcoes: Correcao[]
  pedidos: { pauta: string; texto: string }[]
}

const VAZIO: Estilo = { amostras: [], anti: [], aprovadas: [], correcoes: [], pedidos: [] }

/** Corta sem deixar a frase pela metade quando dá. */
function limitar(texto: string, max: number): string {
  const t = (texto ?? '').trim().replace(/\s+\n/g, '\n')
  if (t.length <= max) return t
  const corte = t.slice(0, max)
  const ponto = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('\n'))
  return (ponto > max * 0.5 ? corte.slice(0, ponto + 1) : corte) + '…'
}

/**
 * Marcador que a equipe escreve quando o campo ainda não foi resolvido
 * — o mesmo que a tela da base usa para não contar campo pendente como
 * preenchido.
 *
 * Aqui ele importa por um motivo que só apareceu com dado real: o
 * campo de amostras vem com uma instrução escrita por mim ("cole aqui
 * de 15 a 30 legendas…"), e o importador do Instagram preserva o que
 * está escrito à mão. Sem este filtro, a primeira "legenda de exemplo"
 * que a IA receberia seria a minha instrução — e ela aprenderia a
 * escrever instrução.
 */
const PENDENTE = /\[\s*(a\s+)?(confirmar|preencher|segue\s+vazio|verificar|pendente)/i

/**
 * As amostras chegam num campo de texto só, separadas por uma linha
 * com três traços. Formato escolhido por ser o que alguém consegue
 * colar do celular sem pensar em formato.
 *
 * Cada amostra é cortada em 600 caracteres. As legendas reais da Alta
 * têm 477 em média, então quase nenhuma é tocada — o corte existe para
 * a legenda de três mil caracteres não empurrar o resto do contexto
 * para fora e cobrar por isso em toda geração.
 */
export function separarAmostras(texto: string | undefined | null, max: number): string[] {
  return (texto ?? '')
    .split(/^\s*-{3,}\s*$/m)
    .map((t) =>
      t
        .split('\n')
        // Linha de procedência — "=== legendas trazidas do Instagram
        // em ... ===" — é anotação para quem lê a base, não texto da
        // marca. Se ela entrasse no exemplo, a IA aprenderia a
        // escrever cabeçalho de importação.
        .filter((l) => !l.trimStart().startsWith('==='))
        .join('\n')
        .trim(),
    )
    .filter((t) => t.length > 25 && !PENDENTE.test(t))
    .map((t) => limitar(t, 600))
    .slice(0, max)
}

/** Os campos de texto que carregam estilo. Data e linha não carregam. */
const CAMPOS_DE_ESTILO: { id: string; rotulo: string }[] = [
  { id: 'title', rotulo: 'Título' },
  { id: 'concept', rotulo: 'Conceito' },
  { id: 'description', rotulo: 'Descrição' },
  { id: 'cta', rotulo: 'Chamada para ação' },
]

/**
 * Junta o que o banco já sabe sobre como esta marca escreve.
 *
 * Roda com a identidade de quem chamou: as políticas continuam
 * valendo, e uma marca nunca vê exemplo de outra.
 */
export async function coletarEstilo(
  supabase: SupabaseClient,
  brandId: string,
  base: Record<string, Record<string, string>>,
): Promise<Estilo> {
  const voz = base['voice'] ?? {}
  const amostras = separarAmostras(voz['v_amostras'], 8)
  const anti = separarAmostras(voz['v_anti'], 4)

  try {
    // ---------- as correções da equipe ----------
    // `trigger = 'internal'` é a mudança feita por gente. O snapshot
    // guardado é o texto ANTERIOR à mudança; o texto que ficou está na
    // versão seguinte — ou na pauta atual, se aquela foi a última.
    const { data: versoes } = await supabase
      .from('content_versions')
      .select('idea_id, version, snapshot, reason, created_at')
      .eq('brand_id', brandId)
      .eq('trigger', 'internal')
      .order('created_at', { ascending: false })
      .limit(24)

    const linhas = versoes ?? []
    const ids = [...new Set(linhas.map((v) => v.idea_id as string))]

    const { data: pautasAtuais } = ids.length
      ? await supabase
          .from('content_ideas')
          .select('id, title, concept, description, cta')
          .in('id', ids)
      : { data: [] }

    const atual = new Map<string, Record<string, unknown>>()
    for (const p of pautasAtuais ?? []) atual.set(p.id as string, p as Record<string, unknown>)

    // Uma lição por pauta, e o "ficou" é sempre o texto ATUAL — nunca a
    // versão intermediária.
    //
    // Isto quase saiu errado. A primeira versão pareava cada versão
    // arquivada com a seguinte, o que parece natural mas ensina o
    // contrário do que se quer: numa pauta editada duas vezes, o "ficou"
    // do primeiro par é justamente o texto que a equipe descartou
    // depois. Eu estaria mostrando à IA, como exemplo de acerto,
    // exatamente a frase que alguém apagou. O teste do pareamento é o
    // que mostrou isso; olhando a tela, ninguém veria.
    const maisRecentePorPauta = new Map<string, (typeof linhas)[number]>()
    for (const v of linhas) {
      const id = v.idea_id as string
      const anterior = maisRecentePorPauta.get(id)
      if (!anterior || Number(v.version) > Number(anterior.version)) {
        maisRecentePorPauta.set(id, v)
      }
    }

    const correcoes: Correcao[] = []
    for (const v of maisRecentePorPauta.values()) {
      const antes = (v.snapshot ?? {}) as Record<string, unknown>
      const depois = atual.get(v.idea_id as string)
      if (!depois) continue

      // Só o campo que mudou entra. Mandar a pauta inteira duas vezes
      // gasta contexto e esconde a lição no meio do que ficou igual.
      for (const campo of CAMPOS_DE_ESTILO) {
        const a = String(antes[campo.id] ?? '').trim()
        const d = String(depois[campo.id] ?? '').trim()
        if (!a || !d || a === d) continue
        correcoes.push({
          campo: campo.rotulo,
          antes: limitar(a, 240),
          depois: limitar(d, 240),
          motivo: (v.reason as string | null) ?? null,
        })
        break
      }
      if (correcoes.length >= 14) break
    }

    // Quem escreveu o motivo ensina mais do que quem só trocou o texto.
    correcoes.sort((x, y) => (y.motivo ? 1 : 0) - (x.motivo ? 1 : 0))

    // ---------- os pedidos do cliente ----------
    const { data: recados } = await supabase
      .from('comments')
      .select('body, idea_id, created_at')
      .eq('brand_id', brandId)
      .eq('author_kind', 'client')
      .order('created_at', { ascending: false })
      .limit(8)

    const idsRecado = [...new Set((recados ?? []).map((r) => r.idea_id as string))]
    const { data: titulos } = idsRecado.length
      ? await supabase.from('content_ideas').select('id, title').in('id', idsRecado)
      : { data: [] }
    const tituloDe = new Map<string, string>(
      (titulos ?? []).map((t): [string, string] => [t.id as string, (t.title as string) ?? '']),
    )

    const pedidos = (recados ?? [])
      .map((r) => ({
        pauta: tituloDe.get(r.idea_id as string) ?? '—',
        texto: limitar((r.body as string) ?? '', 220),
      }))
      .filter((p) => p.texto.length > 10)

    // ---------- o acervo aprovado ----------
    // Depois de dois ou três meses, a marca já tem legendas que o
    // cliente aprovou. A partir daí o sistema se alimenta do próprio
    // trabalho, e as amostras coladas na mão deixam de ser necessárias.
    const { data: aprovadasIds } = await supabase
      .from('content_ideas')
      .select('id')
      .eq('brand_id', brandId)
      .eq('status', 'client_approved')
      .limit(30)

    const listaIds = (aprovadasIds ?? []).map((p) => p.id as string)
    const { data: conteudos } = listaIds.length
      ? await supabase
          .from('idea_content')
          .select('caption')
          .eq('brand_id', brandId)
          .in('idea_id', listaIds)
          .limit(6)
      : { data: [] }

    const aprovadas = (conteudos ?? [])
      .map((c) => limitar((c.caption as string) ?? '', 420))
      .filter((c) => c.length > 40)

    return { amostras, anti, aprovadas, correcoes: correcoes.slice(0, 8), pedidos }
  } catch {
    // Estilo é melhoria, não requisito. Se qualquer consulta falhar, a
    // geração acontece como antes — sem o bloco, e sem erro na cara de
    // quem só queria o planejamento do mês.
    return { ...VAZIO, amostras, anti }
  }
}

/**
 * O bloco que entra no prompt.
 *
 * `curto` é para o refino, onde o pedido da pessoa é o que importa e o
 * contexto já vem inteiro na pauta atual.
 */
export function blocoDeEstilo(e: Estilo, curto = false): string {
  const partes: string[] = []
  const n = curto ? 3 : 8

  if (e.amostras.length > 0) {
    partes.push(
      '## COMO A MARCA ESCREVE — legendas reais\n' +
        'Publicadas e aprovadas por esta marca. Imite o ritmo, o tamanho das frases, a ' +
        'pontuação e o vocabulário. Não copie o conteúdo.\n\n' +
        e.amostras
          .slice(0, n)
          .map((a, i) => `[${i + 1}]\n${a}`)
          .join('\n\n'),
    )
  }

  if (e.aprovadas.length > 0) {
    partes.push(
      '## LEGENDAS QUE O CLIENTE JÁ APROVOU\n' +
        'Saíram deste sistema e passaram pela aprovação do cliente.\n\n' +
        e.aprovadas
          .slice(0, curto ? 2 : 4)
          .map((a, i) => `[${i + 1}]\n${a}`)
          .join('\n\n'),
    )
  }

  if (e.anti.length > 0) {
    partes.push(
      '## O QUE ESTA MARCA NUNCA PUBLICARIA\n' +
        'Exemplos do que soa errado para ela. Não escreva nada parecido com isto.\n\n' +
        e.anti.map((a, i) => `[${i + 1}] ${a}`).join('\n'),
    )
  }

  if (e.correcoes.length > 0) {
    partes.push(
      '## CORREÇÕES QUE A EQUIPE JÁ FEZ NO SEU TEXTO\n' +
        'Cada item é uma vez em que a equipe reescreveu o que você havia escrito para ' +
        'esta marca. Não repita o erro da coluna "estava".\n\n' +
        e.correcoes
          .slice(0, curto ? 4 : 8)
          .map(
            (c) =>
              `— ${c.campo}\n` +
              `  estava: ${c.antes}\n` +
              `  ficou:  ${c.depois}` +
              (c.motivo ? `\n  motivo: ${c.motivo}` : ''),
          )
          .join('\n\n'),
    )
  }

  if (e.pedidos.length > 0) {
    partes.push(
      '## O QUE O CLIENTE PEDIU PARA MUDAR\n' +
        'Escrito pelo próprio cliente, sobre peças anteriores. Vale mais que qualquer ' +
        'descrição de tom de voz.\n\n' +
        e.pedidos
          .slice(0, curto ? 3 : 6)
          .map((p) => `— sobre "${p.pauta}": ${p.texto}`)
          .join('\n'),
    )
  }

  if (partes.length === 0) return ''

  return (
    '# A VOZ DESTA MARCA, EM EXEMPLOS\n' +
    'O que vem abaixo vale mais que a descrição de tom de voz da base: são textos reais ' +
    'desta marca e correções reais feitas nela.\n\n' +
    partes.join('\n\n')
  )
}
