const etapas = [
  { nome: 'Ambiente preparado', detalhe: 'Node, npm e Git instalados e acessíveis', feito: true },
  { nome: 'Projeto criado', detalhe: 'Next.js 16 com TypeScript, rodando localmente', feito: true },
  { nome: 'Banco de dados', detalhe: '29 tabelas no Supabase, todas com isolamento por marca', feito: true },
  { nome: 'Login', detalhe: 'Contas reais com papéis e acesso por marca', feito: true },
  { nome: 'Base da marca', detalhe: 'As nove seções, lendo e gravando no banco', feito: true },
  { nome: 'Geração', detalhe: 'Planejamento do mês pela API do Claude', feito: true },
  { nome: 'Calendário e revisão', detalhe: 'Calendário, refino pela IA e criação de conteúdo', feito: true },
  { nome: 'Portal do cliente', detalhe: 'Aprovação por pauta, com histórico', feito: true },
]

function Marca() {
  return (
    <svg
      viewBox="40 50 1845 415"
      width="92"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="85"
      strokeLinecap="butt"
      strokeLinejoin="round"
      role="img"
      aria-label="Alta"
    >
      <path d="M75 345 L233.97 191.52 A62 62 0 0 1 320.03 191.52 L479 345" />
      <path d="M667 100 V337 A80 80 0 0 0 747 417 H955" />
      <path d="M965 97.5 H1167.5 A80 80 0 0 1 1247.5 177.5 V395" />
      <path d="M1447 345 L1605.97 191.52 A62 62 0 0 1 1692.03 191.52 L1851 345" />
    </svg>
  )
}

export default function Home() {
  const concluidas = etapas.filter((e) => e.feito).length
  const pct = Math.round((concluidas / etapas.length) * 100)

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px 96px',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          paddingBottom: 26,
          borderBottom: '2px solid var(--text)',
        }}
      >
        <Marca />
        <h1
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 38,
            fontWeight: 600,
            lineHeight: 1.05,
            marginTop: 6,
          }}
        >
          Social Planner
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 16 }}>
          O sistema está rodando na sua máquina. Esta página confirma que o
          projeto compila e serve — daqui em diante, tudo que construirmos
          aparece aqui.
        </p>
      </header>

      <section style={{ marginTop: 34 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--disp)',
              fontSize: 30,
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {pct}%
          </span>
          <span style={{ color: 'var(--muted)', fontSize: 14 }}>
            {concluidas} de {etapas.length} etapas
          </span>
        </div>

        <div
          style={{
            height: 6,
            borderRadius: 99,
            background: 'var(--surface-3)',
            overflow: 'hidden',
            marginBottom: 26,
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--ok)' }} />
        </div>

        <ol
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            overflow: 'hidden',
          }}
        >
          {etapas.map((e, i) => (
            <li
              key={e.nome}
              style={{
                display: 'grid',
                gridTemplateColumns: '30px 1fr',
                gap: 14,
                padding: '15px 20px',
                borderBottom:
                  i === etapas.length - 1 ? 'none' : '1px solid var(--line)',
                opacity: e.feito ? 1 : 0.62,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: e.feito ? '#fff' : 'var(--faint)',
                  background: e.feito ? 'var(--ok)' : 'transparent',
                  border: e.feito ? 'none' : '1.5px solid var(--line-2)',
                  marginTop: 2,
                }}
              >
                {e.feito ? '✓' : i + 1}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{e.nome}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13.2 }}>
                  {e.detalhe}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div style={{ marginTop: 30 }}>
        <a
          href="/entrar"
          style={{
            display: 'inline-block',
            padding: '11px 22px',
            fontSize: 14.5,
            fontWeight: 700,
            color: 'var(--paper)',
            background: 'var(--text)',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          Entrar no sistema
        </a>
      </div>

      <footer
        style={{
          marginTop: 34,
          paddingTop: 20,
          borderTop: '1px solid var(--line)',
          color: 'var(--faint)',
          fontSize: 13,
        }}
      >
        Alta Comunicazione · ambiente de desenvolvimento local ·{' '}
        <code>localhost:3000</code>
      </footer>
    </main>
  )
}
