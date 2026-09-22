'use client'

import { useEffect, useRef } from 'react'

/**
 * A barra de cima da versão em PDF, e o disparo da impressão.
 *
 * O PDF sai pelo próprio navegador ("Salvar como PDF"), não por uma
 * biblioteca no servidor. Foi escolha, e vale dizer por quê: o
 * navegador usa as mesmas fontes e as mesmas cores da tela, funciona
 * no celular, e não acrescenta nenhuma dependência ao projeto que
 * possa quebrar a compilação na Vercel. O preço é um clique a mais na
 * caixa de impressão — escolher "Salvar como PDF" no destino.
 *
 * O título da página vira o nome do arquivo sugerido pelo navegador.
 */
export function Imprimir({ titulo, voltar }: { titulo: string; voltar: string }) {
  const jaAbriu = useRef(false)

  useEffect(() => {
    document.title = titulo
    if (jaAbriu.current) return
    jaAbriu.current = true
    // Espera as fontes: imprimir antes delas carregarem gera um PDF com
    // a fonte do sistema no lugar da Poppins.
    // E espera as imagens do layout: imprimir antes delas chegarem gera
    // um PDF com o espaço da imagem em branco. Nenhuma espera passa de
    // 15 segundos, para uma imagem que não carrega não travar tudo.
    const fontes = document.fonts?.ready ?? Promise.resolve()
    const imagens = Array.from(document.images)
      .filter((img) => !img.complete)
      .map(
        (img) =>
          new Promise<void>((ok) => {
            img.addEventListener('load', () => ok(), { once: true })
            img.addEventListener('error', () => ok(), { once: true })
          }),
      )
    const limite = new Promise<void>((ok) => setTimeout(ok, 15000))
    Promise.race([Promise.all([fontes, ...imagens]), limite]).then(() =>
      setTimeout(() => window.print(), 350),
    )
  }, [titulo])

  return (
    <div className="nao-imprime barra-pdf">
      <div style={{ flex: 1, minWidth: 220 }}>
        <b>Versão para PDF.</b> Na caixa de impressão, escolha <b>Salvar como PDF</b> no
        destino.
      </div>
      <button onClick={() => window.print()} className="botao-pdf forte">
        Salvar em PDF
      </button>
      <a href={voltar} className="botao-pdf">
        Voltar ao portal
      </a>
    </div>
  )
}
