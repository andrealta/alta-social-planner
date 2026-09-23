import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { mesTitulado } from '@/lib/prompt'
import { ICONE_PECA, pilula, ponto, tipoDaPeca } from '@/lib/visual'
import { ordenarMeses } from '@/lib/ordem'
import { calcularStatus } from '@/lib/status'
import { duracao } from '@/lib/medidas'
import { Quadro, type Numero } from '@/lib/quadro'

/**
 * A primeira tela do cliente depois de entrar.
 *
 * O que ela precisa responder, em ordem: de quem é este lugar (a
 * marca dele, não a da Alta), tem algo esperando por mim, e onde
 * estão os meses anteriores.
 *
 * Um bloco por mês, agrupados por marca — um cliente pode acompanhar
 * mais de uma marca, e nesse caso cada uma tem o próprio cabeçalho,
 * com a própria cor.
 *
 * Nenhuma consulta filtra por marca ou por "já foi liberado": quem
 * decide o que este usuário enxerga são as políticas do banco.
 */
export default async function PortalDoCliente() {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('name, email, role')
    .eq('id', user.id)
    .single()

  // Quem é da Alta tem o painel interno; este portal é do cliente.
  if (perfil?.role === 'admin' || perfil?.role === 'staff') redirect('/painel')

  const { data: marcas } = await supabase
    .from('brands')
    .select('id, name, slug, color')
    .order('name')

  const { data: planos } = await supabase
    .from('plans')
    .select('id, brand_id, month, year, approved_at, client_released_at, estrategia_cliente')
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  const [{ data: pautas }, { data: decisoes }, { data: comentarios }, { data: canais }] = await Promise.all([
    // A vista da migração 0027, não a tabela: ver `dados.ts`.
    supabase.from('pautas_do_cliente').select('id, plan_id, title, status'),
    // Para o status geral: o que o cliente decidiu e o que escreveu ao
    // pedir alteração. As políticas do banco só devolvem o da marca dele.
    supabase
      .from('approvals')
      .select('idea_id, decision, actor_kind, seconds_to_decide, comment_id')
      .eq('actor_kind', 'client'),
    supabase.from('comments').select('id, body').eq('author_kind', 'client'),
    // As datas das publicações, para o bloco "Próximas publicações".
    supabase.from('content_channels').select('idea_id, format, scheduled_date'),
  ])

  const conta = new Map<string, { total: number; aguardando: number; aprovadas: number }>()
  for (const p of pautas ?? []) {
    const id = p.plan_id as string
    const c = conta.get(id) ?? { total: 0, aguardando: 0, aprovadas: 0 }
    c.total++
    if (p.status === 'sent_to_client') c.aguardando++
    if (p.status === 'client_approved') c.aprovadas++
    conta.set(id, c)
  }

  type Plano = {
    id: string
    mes: number
    ano: number
    fechado: boolean
    total: number
    aguardando: number
    aprovadas: number
  }

  const porMarca = new Map<string, Plano[]>()
  for (const p of planos ?? []) {
    const c = conta.get(p.id as string) ?? { total: 0, aguardando: 0, aprovadas: 0 }
    const lista = porMarca.get(p.brand_id as string) ?? []
    lista.push({
      id: p.id as string,
      mes: Number(p.month),
      ano: Number(p.year),
      fechado: p.approved_at !== null,
      total: c.total,
      aguardando: c.aguardando,
      aprovadas: c.aprovadas,
    })
    porMarca.set(p.brand_id as string, lista)
  }
  // Os meses que ainda pedem resposta vêm primeiro; os aprovados por
  // inteiro vão para o fim da fila. Dentro de cada grupo, do mais
  // próximo para o mais distante (ver lib/ordem.ts).
  for (const [marca, lista] of porMarca) {
    porMarca.set(
      marca,
      ordenarMeses(lista, (p) => p.ano, (p) => p.mes, { concluido: (p) => p.fechado }),
    )
  }

  const comPlano = (marcas ?? []).filter((m) => (porMarca.get(m.id as string) ?? []).length > 0)
  const aguardandoTotal = (planos ?? []).reduce(
    (s, p) => s + (conta.get(p.id as string)?.aguardando ?? 0),
    0,
  )
  const primeiroNome = (perfil?.name as string | null)?.trim().split(' ')[0] ?? null

  // ---------- o que a tela inicial precisa além dos meses ----------
  const agora = new Date()
  const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const hojeTexto = agora.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const mesHoje = Number(hoje.slice(5, 7))
  const anoHoje = Number(hoje.slice(0, 4))

  // O próximo passo: o mês pendente mais próximo, de qualquer marca.
  const pendentes = comPlano
    .flatMap((m) =>
      (porMarca.get(m.id as string) ?? [])
        .filter((p) => p.aguardando > 0)
        .map((p) => ({ ...p, slug: m.slug as string, marca: m.name as string })),
    )
    .sort((a, b) => a.ano * 12 + a.mes - (b.ano * 12 + b.mes))
  const proximo = pendentes[0] ?? null

  const planoPorId = new Map<string, Record<string, unknown>>((planos ?? []).map((p) => [p.id as string, p]))
  const pautaPorId = new Map<string, Record<string, unknown>>((pautas ?? []).map((p) => [p.id as string, p]))

  /** As próximas publicações de uma marca, a partir de hoje. */
  function proximasDa(marcaId: string) {
    const vistas = new Set<string>()
    const itens: { id: string; data: string; titulo: string; status: string; formato: string | null; link: string }[] = []
    for (const c of canais ?? []) {
      const data = String(c.scheduled_date ?? '').slice(0, 10)
      if (!data || data < hoje) continue
      const pauta = pautaPorId.get(c.idea_id as string)
      const plano = pauta && planoPorId.get(pauta.plan_id as string)
      if (!pauta || !plano || plano.brand_id !== marcaId || !plano.client_released_at) continue
      if (vistas.has(pauta.id as string)) continue
      vistas.add(pauta.id as string)
      const marca = comPlano.find((m) => m.id === marcaId)
      itens.push({
        id: pauta.id as string,
        data,
        titulo: (pauta.title as string) ?? '',
        status: (pauta.status as string) ?? '',
        formato: (c.format as string | null) ?? null,
        link: `/cliente/${marca?.slug as string}/${plano.year}/${plano.month}`,
      })
    }
    return itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)).slice(0, 5)
  }

  /** A estratégia do mês corrente, ou do mês enviado mais próximo. */
  function estrategiaDa(marcaId: string) {
    const com = (planos ?? [])
      .filter((p) => p.brand_id === marcaId && p.client_released_at && ((p.estrategia_cliente as string | null) ?? '').trim())
      .map((p) => ({
        mes: Number(p.month),
        ano: Number(p.year),
        texto: (p.estrategia_cliente as string).trim(),
        distancia: Math.abs(Number(p.year) * 12 + Number(p.month) - (anoHoje * 12 + mesHoje)),
      }))
      .sort((a, b) => a.distancia - b.distancia)
    return com[0] ?? null
  }

  const SITUACAO: Record<string, { texto: string; cor: string; wash: string }> = {
    sent_to_client: { texto: 'aguardando você', cor: 'var(--st-cliente)', wash: 'var(--st-cliente-wash)' },
    client_changes_requested: { texto: 'alteração pedida', cor: 'var(--st-ajuste)', wash: 'var(--st-ajuste-wash)' },
    client_approved: { texto: 'aprovada', cor: 'var(--st-aprovado)', wash: 'var(--st-aprovado-wash)' },
  }

  const rotulo = {
    fontFamily: 'var(--disp)',
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '.16em',
    textTransform: 'uppercase' as const,
    color: 'var(--faint)',
    marginBottom: 12,
  }

  return (
    <main className="pagina-larga">
      {/* A saudação dá nome a quem entrou: o cliente pode ter três
          pessoas avaliando, e cada uma precisa saber que está na
          própria conta. Ao lado, o próximo passo, que é o motivo de a
          pessoa ter entrado. */}
      <div className="painel-colunas" style={{ alignItems: 'stretch' }}>
        <div style={{ alignSelf: 'center' }}>
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
              fontSize: 34,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: '-.025em',
            }}
          >
            {primeiroNome ? `Olá, ${primeiroNome}.` : 'Seu planejamento de conteúdo'}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, marginTop: 8, lineHeight: 1.6, maxWidth: 620 }}>
            Aqui ficam os planejamentos de conteúdo que a Alta prepara para você. Abra o mês e
            avance nas respostas. Tudo o que você avaliar será salvo automaticamente.
          </p>
        </div>

        {proximo ? (
          <Link
            href={`/cliente/${proximo.slug}/${proximo.ano}/${proximo.mes}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 18,
              padding: '22px 24px',
              borderRadius: 'var(--r-lg)',
              background: 'var(--accent)',
              color: '#fff',
              textDecoration: 'none',
              boxShadow: 'var(--shadow-botao)',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, letterSpacing: '.04em' }}>
                Próximo passo
              </div>
              <div
                style={{
                  fontFamily: 'var(--disp)',
                  fontSize: 23,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  marginTop: 6,
                }}
              >
                {aguardandoTotal} {aguardandoTotal === 1 ? 'publicação aguardando' : 'publicações aguardando'} você
              </div>
              <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>
                {comPlano.length > 1 ? `${proximo.marca} · ` : ''}
                {mesTitulado(proximo.mes)} de {proximo.ano}
              </div>
            </div>
            <span
              style={{
                alignSelf: 'flex-start',
                fontSize: 14,
                fontWeight: 700,
                padding: '9px 16px',
                borderRadius: 99,
                background: '#fff',
                color: 'var(--accent)',
              }}
            >
              Avaliar agora →
            </span>
          </Link>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '22px 24px',
              borderRadius: 'var(--r-lg)',
              background: 'var(--st-aprovado-wash)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--st-aprovado)',
                color: '#fff',
                fontSize: 20,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              ✓
            </span>
            <div>
              <div style={{ fontFamily: 'var(--disp)', fontSize: 19, fontWeight: 600 }}>Tudo em dia</div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 2, lineHeight: 1.5 }}>
                Nada aguardando você no momento. Quando a equipe enviar um mês novo, ele aparece aqui.
              </div>
            </div>
          </div>
        )}
      </div>

      {comPlano.length === 0 ? (
        <div
          style={{
            marginTop: 28,
            padding: '44px 28px',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: 14.5,
            lineHeight: 1.7,
          }}
        >
          <b style={{ color: 'var(--text)', display: 'block', marginBottom: 6, fontSize: 16 }}>
            Nenhum mês para avaliar ainda
          </b>
          Assim que a equipe da Alta enviar um planejamento, ele aparece aqui.
        </div>
      ) : (
        comPlano.map((m) => {
          const cor = (m.color as string | null) ?? 'var(--accent)'
          const nome = m.name as string
          const inicial = nome.trim().charAt(0).toUpperCase()
          const lista = porMarca.get(m.id as string) ?? []
          const esperando = lista.reduce((s, p) => s + p.aguardando, 0)
          const proximas = proximasDa(m.id as string)
          const estrategia = estrategiaDa(m.id as string)

          const planosDaMarca = (planos ?? []).filter((p) => p.brand_id === m.id)
          const idsPlanos = new Set(planosDaMarca.map((p) => p.id as string))
          const status = calcularStatus({
            planos: planosDaMarca.map((p) => ({
              id: p.id as string,
              liberado: p.client_released_at !== null,
            })),
            pautas: (pautas ?? [])
              .filter((p) => idsPlanos.has(p.plan_id as string))
              .map((p) => ({
                id: p.id as string,
                plan_id: p.plan_id as string,
                status: (p.status as string) ?? '',
              })),
            decisoes: (decisoes ?? []).map((d) => ({
              idea_id: d.idea_id as string,
              decision: (d.decision as string) ?? '',
              actor_kind: (d.actor_kind as string) ?? '',
              seconds_to_decide:
                d.seconds_to_decide === null || d.seconds_to_decide === undefined
                  ? null
                  : Number(d.seconds_to_decide),
              comment_id: (d.comment_id as string | null) ?? null,
            })),
            comentarios: (comentarios ?? []).map((k) => ({
              id: k.id as string,
              body: (k.body as string) ?? '',
            })),
          })

          return (
            <section key={m.id as string} style={{ marginTop: 30 }}>
              {/* O nome da marca é o maior elemento do bloco, e o selo
                  usa a cor dela. É a marca do cliente que manda aqui. */}
              <header
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                  padding: '20px 24px',
                  borderRadius: 'var(--r-lg)',
                  background: 'var(--surface)',
                  boxShadow: 'var(--shadow)',
                  borderTop: `4px solid ${cor}`,
                  marginBottom: 22,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 16,
                    display: 'grid',
                    placeItems: 'center',
                    background: cor,
                    color: '#fff',
                    fontFamily: 'var(--disp)',
                    fontSize: 22,
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
                      fontSize: 25,
                      fontWeight: 600,
                      lineHeight: 1.15,
                      letterSpacing: '-.025em',
                    }}
                  >
                    {nome}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 3 }}>
                    {lista.length} {lista.length === 1 ? 'mês' : 'meses'} de planejamento
                    {esperando > 0 && ` · ${esperando} aguardando você`}
                  </div>
                </div>
              </header>

              <div className="painel-colunas">
                <div>
                  <h2 style={rotulo}>Meses</h2>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))',
                      gap: 14,
                    }}
                  >
                    {lista.map((p) => (
                      <CartaoMes key={p.id} p={p} slug={m.slug as string} cor={cor} />
                    ))}
                  </div>
                </div>

                <aside style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
                  {estrategia && (
                    <div>
                      <h2 style={rotulo}>
                        A estratégia de {mesTitulado(estrategia.mes).toLowerCase()}
                      </h2>
                      <div
                        style={{
                          padding: '18px 20px',
                          borderRadius: 'var(--r-lg)',
                          background: 'var(--surface)',
                          boxShadow: 'var(--shadow)',
                          borderLeft: `3px solid ${cor}`,
                          fontSize: 14.5,
                          lineHeight: 1.65,
                        }}
                      >
                        <div
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 5,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {estrategia.texto}
                        </div>
                        <Link
                          href={`/cliente/${m.slug as string}/${estrategia.ano}/${estrategia.mes}`}
                          style={{
                            display: 'inline-block',
                            marginTop: 10,
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--accent)',
                            textDecoration: 'none',
                          }}
                        >
                          Abrir o mês →
                        </Link>
                      </div>
                    </div>
                  )}

                  <div>
                    <h2 style={rotulo}>Próximas publicações</h2>
                    <div
                      style={{
                        borderRadius: 'var(--r-lg)',
                        background: 'var(--surface)',
                        boxShadow: 'var(--shadow)',
                        overflow: 'hidden',
                      }}
                    >
                      {proximas.length === 0 ? (
                        <div style={{ padding: '18px 20px', fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
                          Nenhuma publicação marcada daqui para a frente nos meses enviados.
                        </div>
                      ) : (
                        proximas.map((x, i) => {
                          const sit = SITUACAO[x.status] ?? SITUACAO.sent_to_client
                          const tipo = tipoDaPeca(x.formato)
                          const dia = Number(x.data.slice(8, 10))
                          const mesCurto = mesTitulado(Number(x.data.slice(5, 7))).slice(0, 3).toLowerCase()
                          return (
                            <Link
                              key={x.id}
                              href={x.link}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 14,
                                padding: '12px 18px',
                                borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                                textDecoration: 'none',
                                color: 'inherit',
                              }}
                            >
                              <div
                                style={{
                                  width: 44,
                                  flexShrink: 0,
                                  textAlign: 'center',
                                  padding: '5px 0',
                                  borderRadius: 10,
                                  background: 'var(--surface-2)',
                                }}
                              >
                                <div style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 600, lineHeight: 1.1 }}>
                                  {dia}
                                </div>
                                <div style={{ fontSize: 10.5, color: 'var(--faint)', textTransform: 'uppercase' }}>
                                  {mesCurto}
                                </div>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: 14,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {x.titulo}
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginTop: 3,
                                    fontSize: 12,
                                    color: 'var(--muted)',
                                  }}
                                >
                                  <span>
                                    <span aria-hidden>{ICONE_PECA[tipo]}</span> {tipo}
                                  </span>
                                  <span style={{ ...pilula(sit.wash, true), whiteSpace: 'nowrap' }}>
                                    <i aria-hidden style={ponto(sit.cor)} />
                                    {sit.texto}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          )
                        })
                      )}
                    </div>
                  </div>
                </aside>
              </div>

              {status.conteudos > 0 && <StatusGeral status={status} />}
            </section>
          )
        })
      )}
    </main>
  )
}

type CartaoDoMes = {
  id: string
  mes: number
  ano: number
  fechado: boolean
  total: number
  aguardando: number
  aprovadas: number
}

/** O cartão de um mês: situação, progresso e o que fazer. */
function CartaoMes({ p, slug, cor }: { p: CartaoDoMes; slug: string; cor: string }) {
  const pct = p.total ? Math.round((p.aprovadas / p.total) * 100) : 0
  const etiqueta = p.fechado
    ? { texto: 'Aprovado', cor: 'var(--st-aprovado)', wash: 'var(--surface)' }
    : p.aguardando > 0
      ? { texto: `${p.aguardando} aguardando`, cor: 'var(--st-cliente)', wash: 'var(--st-cliente-wash)' }
      : { texto: 'Em andamento', cor: 'var(--faint)', wash: 'var(--surface-2)' }

  return (
    <Link
      href={`/cliente/${slug}/${p.ano}/${p.mes}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        padding: '20px 22px 18px',
        borderRadius: 'var(--r-lg)',
        // Mês aprovado por inteiro: verde claro, e sem a sombra. Está
        // resolvido, não pede o olho.
        background: p.fechado ? 'var(--st-aprovado-wash)' : 'var(--surface)',
        boxShadow: p.fechado ? 'none' : 'var(--shadow)',
        border: p.fechado ? '1px solid var(--st-aprovado-wash)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--disp)',
              fontSize: 21,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: '-.02em',
            }}
          >
            {mesTitulado(p.mes)}
          </div>
          <div style={{ color: 'var(--faint)', fontSize: 13, marginTop: 1 }}>{p.ano}</div>
        </div>
        <span style={pilula(etiqueta.wash, true)}>
          <i aria-hidden style={ponto(etiqueta.cor)} />
          {etiqueta.texto}
        </span>
      </div>

      <div style={{ marginTop: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12.5,
            color: 'var(--muted)',
            marginBottom: 6,
          }}
        >
          <span>
            {p.aprovadas} de {p.total} aprovadas
          </span>
          <span>{pct}%</span>
        </div>
        <div
          style={{
            height: 5,
            borderRadius: 99,
            background: p.fechado ? 'var(--surface)' : 'var(--surface-3)',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: p.fechado ? 'var(--st-aprovado)' : cor }} />
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
        {p.aguardando > 0 ? 'Avaliar' : 'Ver planejamento'} →
      </div>
    </Link>
  )
}
/**
 * O status geral da parceria, abaixo dos meses.
 *
 * Fica DEPOIS dos cards de propósito: quem entra aqui vem responder o
 * que está pendente, e isso tem de ser a primeira coisa na tela. O
 * status é o que se olha com calma, depois.
 *
 * Sem gráfico: são seis quantidades soltas, e um número grande com um
 * rótulo claro lê melhor do que qualquer barra. O ícone só ajuda o olho
 * a achar cada número; o rótulo continua dizendo o que ele é.
 */
function StatusGeral({ status }: { status: ReturnType<typeof calcularStatus> }) {
  const pctPrimeira = status.aprovadas
    ? Math.round((status.aprovadasDePrimeira / status.aprovadas) * 100)
    : null
  const tempo = duracao(status.segundosMedios)

  const numeros: Numero[] = [
    { valor: String(status.meses), rotulo: status.meses === 1 ? 'mês planejado' : 'meses planejados', icone: 'calendario' },
    { valor: String(status.conteudos), rotulo: 'conteúdos criados', icone: 'conteudo' },
    { valor: String(status.aprovadas), rotulo: 'aprovados', icone: 'aprovado' },
    {
      valor: String(status.aprovadasDePrimeira),
      rotulo: 'aprovados de primeira',
      icone: 'primeira',
      nota: pctPrimeira !== null ? `${pctPrimeira}% dos aprovados` : undefined,
    },
    {
      valor: String(status.devolvidas),
      rotulo: 'devolvidos para ajuste',
      icone: 'ajuste',
      nota: 'vezes em que você pediu alteração',
    },
    ...(tempo ? [{ valor: tempo, rotulo: 'seu tempo médio de resposta', icone: 'tempo' as const }] : []),
  ]

  return (
    <Quadro titulo="Status geral" numeros={numeros}>
      {status.temas.length > 0 && (
        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid var(--line)',
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: 'var(--muted)' }}>O que você mais pediu para ajustar: </span>
          {status.temas.map((t, i) => (
            <span key={t.tema}>
              {i > 0 && ', '}
              <b>{t.tema}</b>
              <span style={{ color: 'var(--faint)' }}> ({t.vezes})</span>
            </span>
          ))}
        </div>
      )}
    </Quadro>
  )
}
