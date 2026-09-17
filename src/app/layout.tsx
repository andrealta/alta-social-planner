import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Alta Social Planner',
  description: 'Planejamento de conteúdo de redes sociais da Alta Comunicazione',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Link direto em vez de next/font de propósito: next/font busca a
            fonte no momento do build, e um soluço de rede derrubaria a
            compilação. Aqui, no pior caso, a fonte de sistema assume. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
