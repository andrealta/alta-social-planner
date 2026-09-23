/**
 * O que cada pessoa da Alta pode ALTERAR.
 *
 * Ler deixou de ser permissão na migração 0028: quem é da equipe
 * enxerga todas as marcas. O que se concede, pessoa a pessoa, é o
 * direito de mexer em cada parte, e vale na agência inteira.
 *
 * A lista é curta e nomeada pela responsabilidade, não pela tela. Se
 * fosse uma linha por tela, cresceria a cada tela nova e ninguém
 * lembraria de manter. Ela existe em dois lugares, aqui e na tabela
 * `permissoes` do banco: aqui para a tela explicar, lá para o banco
 * recusar o que não existe. Se mudar de um lado, mude do outro.
 *
 * Quem manda continua sendo o banco. O que este arquivo faz é evitar
 * que a pessoa clique num botão que seria recusado.
 */

export type Permissao = 'base' | 'planejamento' | 'conteudo' | 'midia' | 'cliente'

export const PERMISSOES: { chave: Permissao; nome: string; ajuda: string }[] = [
  {
    chave: 'base',
    nome: 'Base da marca',
    ajuda:
      'Criar e alterar a base de conhecimento, o escopo contratado, os concorrentes e a cor da marca.',
  },
  {
    chave: 'planejamento',
    nome: 'Gerar planejamento',
    ajuda: 'Rodar a geração do mês e a avaliação da IA. É a parte que custa dinheiro a cada clique.',
  },
  {
    chave: 'conteudo',
    nome: 'Pautas e conteúdo',
    ajuda: 'Alterar a pauta, escrever a legenda, anexar layout e aprovar internamente.',
  },
  {
    chave: 'midia',
    nome: 'Investimento de mídia',
    ajuda: 'Definir o objetivo de campanha na Meta e quanto vai em cada publicação.',
  },
  {
    chave: 'cliente',
    nome: 'Enviar ao cliente',
    ajuda: 'Liberar o mês e devolver publicações ao cliente. É o que sai da agência.',
  },
]

/**
 * Três combinações prontas, para o caso comum.
 *
 * Marcar cinco caixas para cada pessoa cansa, e cansaço vira gente
 * marcando tudo por preguiça, que é justamente o que esta mudança
 * existe para evitar. Os atalhos preenchem; as caixas continuam sendo
 * a verdade, e quem quiser um caso fora da curva abre e ajusta.
 */
export const ATALHOS: { nome: string; explica: string; permissoes: Permissao[] }[] = [
  {
    nome: 'Só acompanha',
    explica: 'Lê tudo, não altera nada.',
    permissoes: [],
  },
  {
    nome: 'Cuida do conteúdo',
    explica: 'Pauta, legenda e layout.',
    permissoes: ['conteudo'],
  },
  {
    nome: 'Responde pela conta',
    explica: 'Tudo, inclusive gerar e enviar.',
    permissoes: ['base', 'planejamento', 'conteudo', 'midia', 'cliente'],
  },
]

export function temPermissao(lista: string[] | null | undefined, p: Permissao): boolean {
  return (lista ?? []).includes(p)
}

/**
 * O nome do atalho que descreve este conjunto, quando há um.
 *
 * Serve para a tela dizer "Cuida do conteúdo" em vez de listar as
 * caixas marcadas, e para deixar claro quando a combinação é feita à
 * mão, que é informação útil para quem administra.
 */
export function atalhoDe(lista: string[]): string | null {
  const atual = [...lista].sort().join(',')
  for (const a of ATALHOS) {
    if ([...a.permissoes].sort().join(',') === atual) return a.nome
  }
  return null
}

/** Em uma frase, para a linha da pessoa na lista. */
export function resumoDePermissoes(lista: string[]): string {
  if (lista.length === 0) return 'Só acompanha'
  const atalho = atalhoDe(lista)
  if (atalho) return atalho
  return PERMISSOES.filter((p) => lista.includes(p.chave))
    .map((p) => p.nome)
    .join(' · ')
}
