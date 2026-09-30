import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * O registro do que a administração fez com as marcas.
 *
 * O nome tem o sufixo "-admin" porque `lib/registro.ts` já existe e é
 * outra coisa: aquele grava passos de geração em arquivo, em
 * desenvolvimento. Este grava no banco o que a administração mudou.
 *
 * Fica fora dos arquivos de ação de propósito. Os dois lugares que
 * escrevem no registro são telas diferentes (criar marca é uma, mexer
 * em marca que existe é outra), e um arquivo `'use server'` publica
 * tudo que exporta como ação chamável pelo navegador. Uma função de
 * escrever log exposta assim seria um jeito de forjar linha de
 * registro, que é exatamente a coisa que um registro não pode
 * permitir.
 */

export type AcaoDeAdmin =
  | 'marca_criada'
  | 'marca_arquivada'
  | 'marca_reaberta'
  | 'marca_apagada'
  | 'escopo_alterado'

/** Como cada ação é lida por gente, na tela do registro. */
export const ACOES: Record<string, string> = {
  marca_criada: 'criou a marca',
  marca_arquivada: 'arquivou a marca',
  marca_reaberta: 'reabriu a marca',
  marca_apagada: 'APAGOU a marca',
  escopo_alterado: 'alterou o escopo de',
}

export function rotuloDaAcao(acao: string): string {
  return ACOES[acao] ?? acao.replace(/_/g, ' ')
}

/**
 * Escreve uma linha no registro.
 *
 * O nome de quem fez é COPIADO, não referenciado: a pessoa pode sair
 * da agência e ter o cadastro apagado, e a pergunta "quem apagou
 * aquela marca" continua precisando de resposta anos depois.
 *
 * Devolve a mensagem de erro quando falha, e nunca lança. Falhar aqui
 * não pode desfazer a ação: uma marca arquivada com registro perdido é
 * ruim, mas melhor que uma marca que não arquivou porque o log estava
 * fora do ar. Quem chama mostra o aviso.
 */
export async function registrar(
  supabase: SupabaseClient,
  quem: { id: string; nome: string },
  acao: AcaoDeAdmin,
  marca: { id?: string | null; slug?: string | null; name?: string | null },
  detalhe: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const { error } = await supabase.from('registro_admin').insert({
      quem: quem.id,
      quem_nome: quem.nome,
      acao,
      brand_id: marca.id ?? null,
      marca_slug: marca.slug ?? null,
      marca_nome: marca.name ?? null,
      detalhe,
    })
    return error ? error.message : null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/** "Feed=8, Story=12", ordenado, para comparar antes e depois. */
export function resumoDeEscopo(
  linhas: { label: string; monthly_quota?: number | null; quota?: number | null }[],
): string {
  return linhas
    .map((l) => `${l.label}=${l.monthly_quota ?? l.quota}`)
    .sort()
    .join(', ')
}
