/**
 * O vocabulário visual compartilhado.
 *
 * Por que este arquivo existe: estas peças nasceram dentro da pasta do
 * calendário interno, e agora o portal do cliente precisa das mesmas —
 * a mesma cor de linha de produto, a mesma pílula de situação, o mesmo
 * botão. Duas cópias divergem: alguém muda a cor aqui, esquece lá, e o
 * cliente vê a Classic de uma cor e a equipe de outra.
 *
 * `comum.ts` do calendário reexporta tudo daqui, então nada que já
 * importava de lá precisou mudar.
 */

/**
 * A cor da linha de produto.
 *
 * Fixa por linha, nunca por ordem de aparição: se a Diet sumir de um
 * mês, a Gourmet não pode herdar a cor dela. O índice vem da posição
 * cadastrada no escopo do contrato, que não muda.
 *
 * Passando de quatro linhas, as demais entram em cinza. Uma quinta
 * cor inventada aqui quebraria a separação que as quatro têm hoje —
 * elas foram escolhidas com o validador de paleta, aos pares.
 */
export function corDaLinha(indice: number | null | undefined): string {
  if (indice === null || indice === undefined || indice < 0 || indice > 3) {
    return 'var(--linha-outra)'
  }
  return `var(--linha-${indice + 1})`
}

/** Que tipo de peça é, a partir do formato que a equipe escreveu. */
export function tipoDaPeca(formato: string | null | undefined): string {
  const f = formato ?? ''
  if (/v[ií]deo|reel|reels|tiktok|shorts|filme|motion|anima/i.test(f)) return 'Vídeo'
  if (/carrossel|carousel/i.test(f)) return 'Carrossel'
  if (/story|stories/i.test(f)) return 'Story'
  return 'Imagem'
}

export const ICONE_PECA: Record<string, string> = {
  'Vídeo': '▶',
  Carrossel: '❑',
  Story: '▭',
  Imagem: '▣',
}

/**
 * A pílula de situação. Fundo pastel, tinta escura, ponto colorido.
 *
 * O ponto é um elemento separado porque a cor precisa aparecer em
 * pouca área: seis pixels dizem tanto quanto um bloco chapado, e não
 * competem com o resto da tela. E resolve o amarelo da Alta, que tem
 * 1,27:1 de contraste com o branco — como texto não se lê, como ponto
 * sobre fundo pastel se lê.
 */
export function pilula(wash: string, pequena = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: pequena ? '3px 9px' : '4px 11px',
    borderRadius: 99,
    background: wash,
    color: 'var(--text)',
    fontSize: pequena ? 10 : 11.5,
    fontWeight: 600,
    lineHeight: 1.45,
    whiteSpace: 'nowrap',
  }
}

export function ponto(cor: string, tamanho = 6): React.CSSProperties {
  return {
    width: tamanho,
    height: tamanho,
    borderRadius: 99,
    background: cor,
    display: 'inline-block',
    flex: '0 0 auto',
  }
}

/**
 * Os dois botões do sistema.
 *
 * Uma ação forte por área, no azul da marca — é a regra que segura o
 * desenho inteiro. O secundário é branco com sombra, sem contorno
 * cinza: contorno em tudo é o que fazia a tela parecer antiga.
 */
export function botao(forte: boolean, desligado = false): React.CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 13.5,
    fontWeight: forte ? 700 : 600,
    padding: '10px 18px',
    border: 'none',
    borderRadius: 99,
    background: forte ? 'var(--accent)' : 'var(--surface)',
    color: forte ? '#fff' : 'var(--text)',
    boxShadow: desligado
      ? 'none'
      : forte
        ? 'var(--shadow-botao)'
        : '0 1px 2px rgba(29, 37, 48, .06), 0 6px 14px -10px rgba(29, 37, 48, .2)',
    cursor: desligado ? 'not-allowed' : 'pointer',
    opacity: desligado ? 0.45 : 1,
  }
}

/** Campo preenchido em vez de contornado: menos linha na tela. */
export const caixaTexto: React.CSSProperties = {
  width: '100%',
  resize: 'vertical',
  padding: '11px 13px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  lineHeight: 1.55,
  color: 'var(--text)',
  background: 'var(--surface-2)',
  border: '1px solid transparent',
  borderRadius: 'var(--r-sm)',
  outline: 'none',
}

/** O cartão padrão: branco, sem moldura, sombra macia. */
export const cartao: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--r-lg)',
  boxShadow: 'var(--shadow)',
}

/**
 * As semanas do mês, para desenhar a grade do calendário.
 *
 * Devolve linhas de sete posições, com `null` nos dias que pertencem
 * ao mês vizinho. Mora aqui porque o calendário interno e o do cliente
 * precisam do mesmo desenho — e um erro de fuso ou de primeiro dia da
 * semana em duas cópias é erro em dobro.
 */
export function semanasDoMes(ano: number, mes: number): (number | null)[][] {
  const diasNoMes = new Date(ano, mes, 0).getDate()
  const primeiroDia = new Date(ano, mes - 1, 1).getDay()
  const semanas: (number | null)[][] = []
  let semana: (number | null)[] = Array(primeiroDia).fill(null)
  for (let d = 1; d <= diasNoMes; d++) {
    semana.push(d)
    if (semana.length === 7) {
      semanas.push(semana)
      semana = []
    }
  }
  if (semana.length > 0) {
    while (semana.length < 7) semana.push(null)
    semanas.push(semana)
  }
  return semanas
}

export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
