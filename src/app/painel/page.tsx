import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { calcularStatusEquipe, type Fila } from '@/lib/status'
import { duracao } from '@/lib/medidas'
import { Quadro, Icone, type Numero } from '@/lib/quadro'
import { montarFila } from '@/lib/fila'
import { Fila as FilaDeTrabalho } from './fila'

const PAPEL: Record<string, string> = {
  admin: 'Administração',
  staff: 'Equipe',
  client: 'Cliente',
}

const ACESSO: Record<string, string> = {
  owner: 'responsável',
  editor: 'edita',
  viewer: 'visualiza',
  client: 'cliente',
}

export default async function Painel() {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/entrar')

  // Cada consulta abaixo passa pelas políticas do banco com a identidade
  // desta pessoa. Não há filtro por marca no código — e é esse o ponto.
  const { data: perfil } = await supabase
    .from('profiles')
    .select('name, email, role')
    .eq('id', user.id)
    .single()

  const { data: marcas } = await supabase
    .from('brands')
    .select('id, name, slug, segment, color')
    .order('name')

  const { data: vinculos } = await supabase
    .from('brand_members')
    .select('brand_id, access')
    .eq('user_id', user.id)

  const acessoPorMarca = new Map(
    (vinculos ?? []).map((v) => [v.brand_id as string, v.access as string]),
  )

  const papel = perfil?.role ?? 'client'

  // O cliente tem uma casa própria. O painel interno mostraria a ele
  // uma tela cheia de coisas que as políticas do banco vão negar uma
  // a uma — funciona, mas é uma péssima recepção.
  if (papel === 'client') redirect('/cliente')

  // A fila de trabalho: onde está cada pauta agora. Mesmas políticas
  // do banco, então cada pessoa vê a fila das marcas que alcança.
  const [{ data: planos }, { data: pautas }, { data: conteudos }, { data: decisoes }] = await Promise.all([
    supabase
      .from('plans')
      .select('id, brand_id, month, year, client_released_at, estrategia_cliente'),
    supabase.from('content_ideas').select('id, plan_id, title, status').limit(10000),
    supabase.from('idea_content').select('idea_id, caption').limit(10000),
    supabase
      .from('approvals')
      .select('idea_id, decision, actor_kind, comment_id, seconds_to_decide, created_at')
      .eq('actor_kind', 'client')
      .limit(10000),
  ])

  // Quem já tem legenda escrita: o cliente recebe a peça pronta (0025).
  const comConteudo = new Set(
    (conteudos ?? [])
      .filter((c) => ((c.caption as string | null) ?? '').trim())
      .map((c) => c.idea_id as string),
  )

  const status = calcularStatusEquipe({
    planos: (planos ?? []).map((p) => ({ id: p.id as string, brand_id: p.brand_id as string })),
    pautas: (pautas ?? []).map((p) => ({
      id: p.id as string,
      plan_id: p.plan_id as string,
      status: (p.status as string) ?? '',
    })),
    decisoes: (decisoes ?? []).map((d) => ({
      idea_id: d.idea_id as string,
      actor_kind: (d.actor_kind as string) ?? '',
      seconds_to_decide: d.seconds_to_decide === null ? null : Number(d.seconds_to_decide),
    })),
  })
  const tempo = duracao(status.segundosMedios)

  // O texto do pedido de alteração: só dos pedidos que ainda estão
  // abertos, que são os que aparecem na fila.
  const abertas = new Set(
    (pautas ?? []).filter((p) => p.status === 'client_changes_requested').map((p) => p.id as string),
  )
  const idsPedido = (decisoes ?? [])
    .filter((d) => d.decision === 'changes_requested' && d.comment_id && abertas.has(d.idea_id as string))
    .map((d) => d.comment_id as string)
  const { data: comentarios } = idsPedido.length
    ? await supabase.from('comments').select('id, body').in('id', idsPedido)
    : { data: [] }

  const fila = montarFila({
    marcas: (marcas ?? []).map((m) => ({
      id: m.id as string,
      name: m.name as string,
      slug: m.slug as string,
      color: (m.color as string | null) ?? null,
    })),
    planos: (planos ?? []).map((p) => ({
      id: p.id as string,
      brand_id: p.brand_id as string,
      month: Number(p.month),
      year: Number(p.year),
      client_released_at: (p.client_released_at as string | null) ?? null,
      estrategia_cliente: (p.estrategia_cliente as string | null) ?? null,
    })),
    pautas: (pautas ?? []).map((p) => ({
      id: p.id as string,
      plan_id: p.plan_id as string,
      title: (p.title as string) ?? '',
      status: (p.status as string) ?? '',
      temConteudo: comConteudo.has(p.id as string),
    })),
    decisoes: (decisoes ?? []).map((d) => ({
      idea_id: d.idea_id as string,
      decision: (d.decision as string) ?? '',
      actor_kind: (d.actor_kind as string) ?? '',
      comment_id: (d.comment_id as string | null) ?? null,
      created_at: (d.created_at as string) ?? '',
    })),
    comentarios: (comentarios ?? []).map((c) => ({ id: c.id as string, body: (c.body as string) ?? '' })),
  })
  const numeros: Numero[] = [
    { valor: String(marcas?.length ?? 0), rotulo: (marcas?.length ?? 0) === 1 ? 'marca' : 'marcas', icone: 'marca' },
    { valor: String(status.meses), rotulo: status.meses === 1 ? 'mês planejado' : 'meses planejados', icone: 'calendario' },
    { valor: String(status.conteudos), rotulo: 'pautas criadas', icone: 'conteudo' },
    { valor: String(status.aprovadas), rotulo: 'aprovadas pelo cliente', icone: 'aprovado' },
    {
      valor: String(status.naEquipe),
      rotulo: 'com a equipe',
      nota: 'geradas, em revisão ou em correção',
      icone: 'equipe',
    },
    { valor: String(status.comCliente), rotulo: 'com o cliente', nota: 'esperando resposta', icone: 'cliente' },
    {
      valor: String(status.ajustes),
      rotulo: 'ajustes para fazer',
      nota: 'o cliente pediu alteração',
      icone: 'ajuste',
      destaque: status.ajustes > 0,
    },
    {
      valor: tempo ?? 'sem dados',
      rotulo: 'resposta média do cliente',
      icone: 'tempo',
    },
  ]

  // Saudação e data no fuso de Ribeirão Preto, não no do servidor.
  const agora = new Date()
  const hora = Number(
    agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }),
  )
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const hojeTexto = agora.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const primeiroNome = ((perfil?.name as string | null) ?? '').trim().split(' ')[0] || null

  return (
    <main className="pagina-equipe">
      <header>
        <div
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            marginBottom: 8,
          }}
        >
          {hojeTexto}
        </div>
        <h1
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 32,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-.02em',
          }}
        >
          {saudacao}
          {primeiroNome ? `, ${primeiroNome}` : ''}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14.5, marginTop: 6 }}>
          {fila.length === 0
            ? 'Nada esperando pela equipe agora.'
            : fila.length === 1
              ? '1 item esperando pela equipe.'
              : `${fila.length} itens esperando pela equipe.`}{' '}
          <span style={{ color: 'var(--faint)' }}>· {PAPEL[papel] ?? papel}</span>
        </p>
      </header>

      <Quadro titulo="Status geral" numeros={numeros} marginTop={24} />

      <div className="painel-colunas" style={{ marginTop: 30 }}>
      <FilaDeTrabalho itens={fila} marginTop={0} />

      <section>
        <h2
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
            marginBottom: 14,
          }}
        >
          Marcas que você alcança
        </h2>

        {marcas && marcas.length > 0 ? (
          <ul
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
            {marcas.map((m, i) => (
              <li
                key={m.id as string}
                style={{
                  borderBottom: i === marcas.length - 1 ? 'none' : '1px solid var(--line)',
                }}
              >
                <Link
                  href={`/painel/marca/${m.slug as string}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 14,
                    padding: '15px 20px',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
                    <Inicial nome={m.name as string} cor={(m.color as string | null) ?? null} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name as string}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                        {(m.segment as string) ?? 'sem segmento'}
                        <span style={{ color: 'var(--faint)' }}>
                          {' · '}
                          {ACESSO[acessoPorMarca.get(m.id as string) ?? ''] ??
                            (papel === 'admin' ? 'administração' : 'sem vínculo')}
                        </span>
                      </div>
                      <Selos fila={status.porMarca.get(m.id as string)} />
                    </div>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--faint)', fontSize: 16 }} aria-hidden>
                      &rsaquo;
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div
            style={{
              border: '1px dashed var(--line-2)',
              borderRadius: 'var(--r-lg)',
              padding: '32px 24px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <b style={{ color: 'var(--text)', display: 'block', marginBottom: 6 }}>
              Nenhuma marca ainda
            </b>
            O banco está vazio. As marcas entram na próxima etapa. Se você
            esperava ver alguma aqui, é porque o seu papel ou o seu vínculo
            ainda não foi definido.
          </div>
        )}
      </section>

      </div>

      <section
        style={{
          marginTop: 30,
          padding: '16px 20px',
          border: '1px solid var(--line)',
          borderLeft: '3px solid var(--ok)',
          borderRadius: '0 var(--r) var(--r) 0',
          background: 'var(--ok-wash)',
          fontSize: 13.5,
          lineHeight: 1.6,
        }}
      >
        <b>O isolamento está valendo.</b> Esta página não filtra nada por
        marca: ela pede &ldquo;todas as marcas&rdquo; ao banco, e o banco
        devolve só as que você pode ver. Uma consulta esquecida no futuro não
        vaza dado de cliente.
      </section>
    </main>
  )
}

/** A inicial da marca num círculo com a cor dela, como no portal do cliente. */
function Inicial({ nome, cor }: { nome: string; cor: string | null }) {
  return (
    <div
      aria-hidden
      style={{
        width: 40,
        height: 40,
        flexShrink: 0,
        borderRadius: 99,
        background: cor ?? 'var(--accent)',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--disp)',
        fontWeight: 600,
        fontSize: 16,
      }}
    >
      {nome.trim().charAt(0).toUpperCase()}
    </div>
  )
}

/**
 * O que está pendente naquela marca, em selos. Só aparece o que
 * existe: marca sem nada pendente fica limpa, e é isso que chama o olho
 * para as que têm.
 */
function Selos({ fila }: { fila: Fila | undefined }) {
  if (!fila) return null
  const selos = [
    { n: fila.ajustes, texto: fila.ajustes === 1 ? 'ajuste para fazer' : 'ajustes para fazer', cor: 'var(--laranja-tinta)', fundo: 'var(--laranja-wash)', icone: 'ajuste' as const },
    { n: fila.naEquipe, texto: 'com a equipe', cor: 'var(--amarelo-tinta)', fundo: 'var(--amarelo-wash)', icone: 'equipe' as const },
    { n: fila.comCliente, texto: 'com o cliente', cor: 'var(--accent)', fundo: 'var(--accent-wash)', icone: 'cliente' as const },
  ].filter((x) => x.n > 0)
  if (selos.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
      {selos.map((x) => (
        <span
          key={x.texto}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11.5,
            fontWeight: 600,
            padding: '2px 9px 2px 3px',
            borderRadius: 99,
            background: x.fundo,
            color: x.cor,
            whiteSpace: 'nowrap',
          }}
        >
          <Icone nome={x.icone} tamanho={18} />
          {x.n} {x.texto}
        </span>
      ))}
    </div>
  )
}
