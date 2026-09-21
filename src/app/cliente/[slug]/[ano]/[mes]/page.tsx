import Link from 'next/link'
import { mesTitulado } from '@/lib/prompt'
import { botao } from '@/lib/visual'
import { Sair } from '@/app/painel/sair'
import { Avaliacao } from './avaliacao'
import { carregarMesDoCliente } from './dados'

export default async function MesDoCliente({
  params,
}: {
  params: Promise<{ slug: string; ano: string; mes: string }>
}) {
  const { slug, ano: anoTexto, mes: mesTexto } = await params
  const { ano, mes, marca, fechado, pautas, eu } = await carregarMesDoCliente(
    slug,
    anoTexto,
    mesTexto,
  )

  const corDaMarca = marca.cor ?? 'var(--accent)'
  const inicial = (marca.nome || '?').trim().charAt(0).toUpperCase()

  return (
    <main className="pagina" style={{ maxWidth: 1280 }}>
      <Link href="/cliente" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
        ← Todos os meses
      </Link>

      {/* A marca do cliente vem primeiro, e grande. Ele não entra aqui
          para ver a Alta: entra para ver a marca dele. O selo usa a cor
          cadastrada na base — é a única cor forte da tela. */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginTop: 12,
          padding: '20px 22px',
          background: 'var(--surface)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow)',
          borderTop: `4px solid ${corDaMarca}`,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            display: 'grid',
            placeItems: 'center',
            background: corDaMarca,
            color: '#fff',
            fontFamily: 'var(--disp)',
            fontSize: 19,
            fontWeight: 700,
            flex: '0 0 auto',
          }}
        >
          {inicial}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              fontFamily: 'var(--disp)',
              fontSize: 22,
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: '-.02em',
            }}
          >
            {marca.nome}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 2 }}>
            Planejamento de {mesTitulado(mes).toLowerCase()} de {ano}
          </div>
        </div>
        {/* Abre numa aba própria: a versão para impressão chama a caixa
            de "salvar como PDF" sozinha, e quem fecha a caixa continua
            com o portal intacto na aba de trás. */}
        <a
          href={`/cliente/${slug}/${ano}/${mes}/pdf`}
          target="_blank"
          rel="noopener"
          style={{
            ...botao(false),
            border: '1px solid var(--line-2)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Baixar PDF do mês
        </a>
        <Sair />
      </header>

      {fechado ? (
        <div
          style={{
            marginTop: 18,
            padding: '16px 20px',
            borderRadius: 'var(--r)',
            background: 'var(--ok-wash)',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <b>Mês aprovado por completo.</b> Nada mais precisa de você aqui — a equipe da Alta
          segue para a produção.
        </div>
      ) : (
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 18, lineHeight: 1.65, maxWidth: 760 }}>
          Leia cada publicação e responda. <b>Aprovar</b> libera a peça para produção;{' '}
          <b>Pedir alteração</b> devolve à equipe com o que você escrever. Pode responder aos
          poucos — o que você já decidiu fica salvo.
        </p>
      )}

      <div style={{ marginTop: 22 }}>
        <Avaliacao
          slug={slug}
          ano={ano}
          mes={mes}
          pautas={pautas}
          cor={corDaMarca}
          euNome={eu.nome}
        />
      </div>
    </main>
  )
}
