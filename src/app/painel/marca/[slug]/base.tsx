'use client'

import { useState } from 'react'
import { cartao } from '@/lib/visual'
import { Editor } from './editor'

/**
 * A base da marca, recolhida.
 *
 * Antes ela abria junto com a página, e ocupava dois terços da tela
 * com formulário. Isso dizia, sem querer, que a tela da marca é um
 * formulário de cadastro. Ela não é: é o lugar de onde se olha a conta
 * e se começa o mês.
 *
 * A base continua sendo a coisa mais importante que existe ali, e é
 * por isso que o que fica visível é o PROGRESSO dela. Um cartão que
 * diz "27 resolvidos, 3 a confirmar, 4 vazios" convida a abrir; um
 * formulário aberto com 34 campos convida a rolar até passar.
 *
 * O cálculo do progresso mora dentro do `Editor`, junto dos campos que
 * ele conta. Duplicar aqui seria duas contas do mesmo número.
 */
export function BaseRecolhida({
  slug,
  iniciais,
  podeEditar,
}: {
  slug: string
  iniciais: Record<string, Record<string, string>>
  podeEditar: boolean
}) {
  const [aberta, setAberta] = useState(false)

  return (
    <section style={{ marginTop: 26 }}>
      <Editor
        slug={slug}
        iniciais={iniciais}
        podeEditar={podeEditar}
        aberta={aberta}
        aoAbrir={() => setAberta((a) => !a)}
      />
    </section>
  )
}

/** O cartão de topo, quando a base está fechada. Usado pelo Editor. */
export function CapaDaBase({
  aberta,
  aoAbrir,
  children,
}: {
  aberta: boolean
  aoAbrir: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={aoAbrir}
      aria-expanded={aberta}
      style={{
        ...cartao,
        display: 'block',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        padding: '16px 20px',
        marginBottom: aberta ? 20 : 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: 'var(--text)',
      }}
    >
      {children}
    </button>
  )
}
