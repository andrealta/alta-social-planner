import Link from 'next/link'
import { mesTitulado } from '@/lib/prompt'
import { botao } from '@/lib/visual'
import { reais } from '@/lib/midia'
import { Avaliacao } from './avaliacao'
import { carregarMesDoCliente } from './dados'
import { FeedbackDoMes } from './feedback'

export default async function MesDoCliente({
  params,
}: {
  params: Promise<{ slug: string; ano: string; mes: string }>
}) {
  const { slug, ano: anoTexto, mes: mesTexto } = await params
  const { ano, mes, marca, fechado, pautas, eu, estrategia, meuFeedback, investimentoTotal } =
    await carregarMesDoCliente(slug, anoTexto, mesTexto)

  // O mês só fala de mídia se houver mídia. Quem não investe em
  // tráfego não precisa saber que este bloco existe.
  const impulsionadas = pautas.filter((p) => (p.midiaInvestimento ?? 0) > 0)
  const somaDaMidia =
    Math.round(impulsionadas.reduce((a, p) => a + (p.midiaInvestimento ?? 0), 0) * 100) / 100
  const temMidia = somaDaMidia > 0

  const corDaMarca = marca.cor ?? 'var(--accent)'
  const inicial = (marca.nome || '?').trim().charAt(0).toUpperCase()

  return (
    <main className="pagina-larga">
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
      </header>

      {estrategia && (
        <section
          style={{
            marginTop: 18,
            padding: '20px 24px',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            borderLeft: `4px solid ${corDaMarca}`,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--disp)',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              color: 'var(--faint)',
              marginBottom: 8,
            }}
          >
            A estratégia deste mês
          </div>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxWidth: 820 }}>
            {estrategia}
          </p>
        </section>
      )}

      {temMidia && (
        <section
          style={{
            marginTop: 18,
            padding: '18px 22px',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            gap: 22,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--disp)',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                color: 'var(--faint)',
                marginBottom: 4,
              }}
            >
              Investimento em mídia
            </div>
            <div style={{ fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 600, lineHeight: 1.1 }}>
              {reais(somaDaMidia)}
            </div>
          </div>
          <p
            style={{
              flex: '1 1 320px',
              minWidth: 0,
              fontSize: 14,
              lineHeight: 1.65,
              color: 'var(--muted)',
              margin: 0,
            }}
          >
            Distribuídos entre <b style={{ color: 'var(--text)' }}>{impulsionadas.length}</b> das{' '}
            {pautas.length} publicações do mês
            {investimentoTotal !== null && investimentoTotal > somaDaMidia + 0.005
              ? `, de um total previsto de ${reais(investimentoTotal)}`
              : ''}
            . Em cada publicação impulsionada você vê o valor e o objetivo da campanha.
          </p>
        </section>
      )}

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
          <b>Mês aprovado por completo.</b> Nada mais precisa de você aqui. A equipe da Alta
          segue para a produção.
        </div>
      ) : (
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 18, lineHeight: 1.65, maxWidth: 760 }}>
          Cada publicação vem com a legenda final e, quando já existe, o layout. Leia e
          responda: <b>Aprovar</b> libera a peça para produção; <b>Pedir alteração</b> devolve à
          equipe com o que você escrever. Pode responder aos poucos: o que você já decidiu fica
          salvo.
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

      <FeedbackDoMes slug={slug} ano={ano} mes={mes} inicial={meuFeedback} />
    </main>
  )
}
