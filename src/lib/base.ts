/**
 * A base da marca: nove seções, trinta e dois campos.
 *
 * Esta é a estrutura que o MVP validou com a equipe, agora em um só
 * lugar. A `chave` é o valor gravado na coluna `section` do banco (o
 * enum `knowledge_section`, em inglês); o resto é o que a pessoa lê.
 *
 * Mudar rótulo ou ajuda aqui muda a tela inteira. Acrescentar um campo
 * é só acrescentar a linha — nada no banco precisa mudar, porque o
 * conteúdo de cada seção é um JSON.
 */

export type Campo = {
  id: string
  rotulo: string
  ajuda: string
  /** Campo curto (uma linha ou duas), em vez do bloco alto. */
  curto?: boolean
}

export type Secao = {
  chave: string
  titulo: string
  resumo: string
  campos: Campo[]
}

export const SECOES: Secao[] = [
  {
    chave: 'identity',
    titulo: 'Identidade',
    resumo: 'Quem é a marca, onde ela está e contra quem ela joga.',
    campos: [
      { id: 'i_nome', rotulo: 'Nome e razão social', ajuda: 'Como aparece no contrato e como assina no post.' },
      { id: 'i_seg', rotulo: 'Segmento e mercados', ajuda: 'Em que categoria joga e por quais canais vende.' },
      { id: 'i_canais', rotulo: 'Site e redes sociais', ajuda: 'Todos os perfis, inclusive os que a agência não opera.' },
      { id: 'i_conc', rotulo: 'Concorrentes', ajuda: 'Nomeie. A pesquisa só monitora quem estiver citado aqui.' },
      { id: 'i_regiao', rotulo: 'Regiões de atuação', ajuda: 'Onde vende e onde produz. Filtra a pesquisa.' },
    ],
  },
  {
    chave: 'positioning',
    titulo: 'Posicionamento',
    resumo: 'O que a marca defende e o que ela promete provar este ano.',
    campos: [
      { id: 'p_pos', rotulo: 'Posicionamento, em uma frase', ajuda: 'O que a marca é, para quem, e por que ela.' },
      { id: 'p_prop', rotulo: 'Propósito e valores', ajuda: 'O que ela defende quando não está vendendo.' },
      { id: 'p_dif', rotulo: 'Diferenciais concretos', ajuda: 'O que dá para mostrar, medir ou provar. Evite adjetivo.' },
      { id: 'p_msg', rotulo: 'Mensagens prioritárias do ano', ajuda: 'As duas ou três coisas que o mercado precisa entender.' },
    ],
  },
  {
    chave: 'voice',
    titulo: 'Tom de voz',
    resumo: 'Como a marca fala e, principalmente, como ela não fala.',
    campos: [
      { id: 'v_tom', rotulo: 'Como a marca fala', ajuda: 'Pessoa do discurso, formalidade, humor, gíria.' },
      { id: 'v_sim', rotulo: 'Expressões recomendadas', ajuda: 'Palavras da casa, separadas por vírgula.' },
      { id: 'v_nao', rotulo: 'Expressões proibidas', ajuda: 'O sistema verifica isto em código antes de salvar qualquer pauta.' },
      { id: 'v_temas', rotulo: 'Temas bloqueados', ajuda: 'Assuntos que a marca não entra, mesmo que rendessem.' },
      {
        id: 'v_amostras',
        rotulo: 'Legendas reais da marca',
        ajuda:
          'Cole de 15 a 30 legendas que a marca publicou e que ficaram boas, separadas por uma linha com três traços (---). É o campo que mais melhora o texto da IA: ela aprende estilo por exemplo, não por adjetivo.',
      },
      {
        id: 'v_anti',
        rotulo: 'O que a marca nunca publicaria',
        ajuda:
          'Três a cinco legendas que soariam erradas para esta marca (de concorrente, ou daquele texto de IA genérico), cada uma com uma linha dizendo por quê. Separe por três traços (---).',
      },
    ],
  },
  {
    chave: 'audience',
    titulo: 'Público',
    resumo: 'Para quem a peça é escrita.',
    campos: [
      { id: 'a_p1', rotulo: 'Persona 1', ajuda: 'Faixa, perfil, onde compra, dor e motivação.' },
      { id: 'a_p2', rotulo: 'Persona 2', ajuda: 'Outro público relevante, com o que pesa na decisão dele.' },
      { id: 'a_p3', rotulo: 'Outros públicos', ajuda: 'Distribuidores, imprensa, varejo, talentos. Opcional.' },
    ],
  },
  {
    chave: 'products',
    titulo: 'Produtos e serviços',
    resumo: 'O que existe para ser comunicado, e como tratar cada coisa.',
    campos: [
      { id: 'pr_lista', rotulo: 'Linhas, produtos ou serviços', ajuda: 'Um bloco por linha: o que é, benefício concreto, público, prioridade.' },
      { id: 'pr_obs', rotulo: 'Observações de comunicação', ajuda: 'Onde mora "não tratar como sobremesa" ou "nunca associar a dieta". É o campo que mais afeta a saída da IA.' },
      { id: 'pr_lanc', rotulo: 'Lançamentos previstos', ajuda: 'O que vem nos próximos meses, mesmo sem ter ido ao mercado.' },
    ],
  },
  {
    chave: 'objectives',
    titulo: 'Objetivos e pilares',
    resumo: 'Por que a marca publica, e sob que taxonomia.',
    campos: [
      { id: 'o_obj', rotulo: 'Objetivos de comunicação, em ordem de peso', ajuda: 'Reconhecimento, consideração, educação, autoridade, engajamento…' },
      { id: 'o_pilares', rotulo: 'Pilares editoriais', ajuda: 'A taxonomia que a equipe já usa para classificar pauta.' },
      { id: 'o_ano', rotulo: 'O que precisa acontecer no ano', ajuda: 'A meta de negócio por trás da comunicação.' },
    ],
  },
  {
    chave: 'platforms',
    titulo: 'Escopo contratado',
    resumo: 'Onde a agência opera e com que regras.',
    campos: [
      { id: 'pl_regras', rotulo: 'Regras próprias de cada canal', ajuda: 'O que vale num canal e não vale no outro.' },
      { id: 'pl_formatos', rotulo: 'Formatos praticados', ajuda: 'Como a equipe nomeia os formatos hoje.' },
      { id: 'pl_fora', rotulo: 'Canais fora do escopo', ajuda: 'Onde a marca está mas a agência não opera.' },
    ],
  },
  {
    chave: 'resources',
    titulo: 'Recursos de produção',
    resumo: 'O que a operação consegue entregar. Limita o que a IA pode propor.',
    campos: [
      { id: 'r_sim', rotulo: 'Recursos disponíveis', ajuda: 'O que a operação entrega hoje. Separe por vírgula.' },
      { id: 'r_nao', rotulo: 'Recursos indisponíveis', ajuda: 'Restrição dura: pauta que depender destes é descartada.' },
      { id: 'r_obs', rotulo: 'Observações de produção', ajuda: 'Prazos, limites, quem produz o quê.' },
    ],
  },
  {
    chave: 'memory',
    titulo: 'Memória',
    resumo: 'O que a agência aprendeu convivendo com o cliente.',
    campos: [
      { id: 'm_aprova', rotulo: 'O que o cliente costuma aprovar', ajuda: 'Padrões observados, não regra.' },
      { id: 'm_rejeita', rotulo: 'O que o cliente costuma rejeitar', ajuda: 'E, se souber, por quê. O motivo vale mais que o item.' },
      { id: 'm_temas', rotulo: 'Temas já muito batidos', ajuda: 'O que apareceu demais e precisa descansar.' },
      { id: 'm_quem', rotulo: 'Quem decide do lado do cliente', ajuda: 'Quem aprova, quem opina, quanto tempo leva.' },
    ],
  },
]

export const TOTAL_CAMPOS = SECOES.reduce((s, sec) => s + sec.campos.length, 0)

/** Os campos que a geração não pode ignorar sem estragar a saída. */
export const CAMPOS_CRITICOS = ['i_nome', 'i_seg', 'p_pos', 'v_tom', 'v_nao', 'a_p1', 'pr_lista', 'o_pilares', 'r_nao']

/**
 * Marcadores que a própria equipe escreve quando o dado ainda não foi
 * confirmado com o cliente. Um campo com marcador está preenchido, mas
 * não está resolvido — e a tela precisa mostrar essa diferença, senão
 * "100% preenchido" vira uma mentira confortável.
 */
const MARCADOR = /\[\s*(a\s+)?(confirmar|preencher|segue\s+vazio|verificar|pendente)/i

export function estaPendente(texto: string | undefined | null): boolean {
  return !!texto && MARCADOR.test(texto)
}

export function estaVazio(texto: string | undefined | null): boolean {
  return !texto || texto.trim() === ''
}

export type Situacao = 'vazio' | 'pendente' | 'ok'

export function situacao(texto: string | undefined | null): Situacao {
  if (estaVazio(texto)) return 'vazio'
  if (estaPendente(texto)) return 'pendente'
  return 'ok'
}

export type Contagem = { vazio: number; pendente: number; ok: number; total: number }

export function contar(
  valores: Record<string, Record<string, string>>,
  secoes: Secao[] = SECOES,
): Contagem {
  const c: Contagem = { vazio: 0, pendente: 0, ok: 0, total: 0 }
  for (const sec of secoes) {
    for (const campo of sec.campos) {
      c.total++
      c[situacao(valores[sec.chave]?.[campo.id])]++
    }
  }
  return c
}
