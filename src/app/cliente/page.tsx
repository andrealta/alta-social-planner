import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { mesTitulado } from '@/lib/prompt'
import { pilula, ponto } from '@/lib/visual'
import { Sair } from '@/app/painel/sair'
import { ordenarMeses } from '@/lib/ordem'
import { calcularStatus } from '@/lib/status'
import { duracao } from '@/lib/medidas'

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
    .select('id, brand_id, month, year, approved_at, client_released_at')
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  const [{ data: pautas }, { data: decisoes }, { data: comentarios }] = await Promise.all([
    supabase.from('content_ideas').select('id, plan_id, status'),
    // Para o status geral: o que o cliente decidiu e o que escreveu ao
    // pedir alteração. As políticas do banco só devolvem o da marca dele.
    supabase
      .from('approvals')
      .select('idea_id, decision, actor_kind, seconds_to_decide, comment_id')
      .eq('actor_kind', 'client'),
    supabase.from('comments').select('id, body').eq('author_kind', 'client'),
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

  return (
    <main className="pagina" style={{ maxWidth: 1180 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 26,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: '.22em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
            flex: 1,
          }}
        >
          Alta Comunicazione
        </div>
        <Sair />
      </div>

      {/* A saudação existe para dar nome a quem entrou — o cliente
          pode ter três pessoas avaliando, e cada uma precisa saber
          que está na própria conta. */}
      <div style={{ marginBottom: 34, maxWidth: 720 }}>
        <h1
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 30,
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: '-.025em',
          }}
        >
          {primeiroNome ? `Olá, ${primeiroNome}.` : 'Seu planejamento de conteúdo'}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15, marginTop: 6, lineHeight: 1.6 }}>
          {aguardandoTotal > 0 ? (
            <>
              <b style={{ color: 'var(--text)' }}>
                {aguardandoTotal} publicaç{aguardandoTotal === 1 ? 'ão' : 'ões'} aguardando você.
              </b>{' '}
              Abra o mês e avance nas respostas. Tudo o que você avaliar será salvo automaticamente.
            </>
          ) : (
            'Nada aguardando você no momento. Quando a equipe enviar um mês novo, ele aparece aqui.'
          )}
        </p>
      </div>

      {comPlano.length === 0 ? (
        <div
          style={{
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
            <section key={m.id as string} style={{ marginBottom: 42 }}>
              {/* O nome da marca é o maior elemento da tela, e o selo
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
                  marginBottom: 18,
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

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))',
                  gap: 14,
                }}
              >
                {lista.map((p) => {
                  const pct = p.total ? Math.round((p.aprovadas / p.total) * 100) : 0
                  const etiqueta = p.fechado
                    ? { texto: 'Aprovado', cor: 'var(--st-aprovado)', wash: 'var(--surface)' }
                    : p.aguardando > 0
                      ? {
                          texto: `${p.aguardando} aguardando`,
                          cor: 'var(--st-cliente)',
                          wash: 'var(--st-cliente-wash)',
                        }
                      : { texto: 'Em andamento', cor: 'var(--faint)', wash: 'var(--surface-2)' }

                  return (
                    <Link
                      key={p.id}
                      href={`/cliente/${m.slug as string}/${p.ano}/${p.mes}`}
                      style={{
                        display: 'block',
                        textDecoration: 'none',
                        color: 'inherit',
                        padding: '20px 22px 18px',
                        borderRadius: 'var(--r-lg)',
                        // Mês aprovado por inteiro: verde claro, e sem a
                        // sombra — está resolvido, não pede o olho.
                        background: p.fechado ? 'var(--st-aprovado-wash)' : 'var(--surface)',
                        boxShadow: p.fechado ? 'none' : 'var(--shadow)',
                        border: p.fechado ? '1px solid var(--st-aprovado-wash)' : 'none',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
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
                          <div style={{ color: 'var(--faint)', fontSize: 13, marginTop: 1 }}>
                            {p.ano}
                          </div>
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
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              background: p.fechado ? 'var(--st-aprovado)' : cor,
                            }}
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 16,
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--accent)',
                        }}
                      >
                        {p.aguardando > 0 ? 'Avaliar' : 'Ver planejamento'} →
                      </div>
                    </Link>
                  )
                })}
              </div>

              {status.conteudos > 0 && <StatusGeral status={status} />}
            </section>
          )
        })
      )}
    </main>
  )
}

/**
 * O status geral da parceria, abaixo dos meses.
 *
 * Fica DEPOIS dos cards de propósito: quem entra aqui vem responder o
 * que está pendente, e isso tem de ser a primeira coisa na tela. O
 * status é o que se olha com calma, depois.
 *
 * Só números e texto, sem gráfico: são seis quantidades soltas, e um
 * número grande com um rótulo claro lê melhor do que qualquer barra.
 */
function StatusGeral({ status }: { status: ReturnType<typeof calcularStatus> }) {
  const pctPrimeira = status.aprovadas
    ? Math.round((status.aprovadasDePrimeira / status.aprovadas) * 100)
    : null
  const tempo = duracao(status.segundosMedios)

  const numeros: { valor: string; rotulo: string; nota?: string }[] = [
    { valor: String(status.meses), rotulo: status.meses === 1 ? 'mês planejado' : 'meses planejados' },
    { valor: String(status.conteudos), rotulo: 'conteúdos criados' },
    { valor: String(status.aprovadas), rotulo: 'aprovados' },
    {
      valor: String(status.aprovadasDePrimeira),
      rotulo: 'aprovados de primeira',
      nota: pctPrimeira !== null ? `${pctPrimeira}% dos aprovados` : undefined,
    },
    {
      valor: String(status.devolvidas),
      rotulo: 'devolvidos para ajuste',
      nota: 'vezes em que você pediu alteração',
    },
    ...(tempo ? [{ valor: tempo, rotulo: 'seu tempo médio de resposta' }] : []),
  ]

  return (
    <div
      style={{
        marginTop: 22,
        padding: '20px 22px',
        borderRadius: 'var(--r-lg)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--disp)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: 'var(--faint)',
          marginBottom: 14,
        }}
      >
        Status geral
      </div>

      <div
        style={{
          display: 'grid',
          // 120px: duas colunas no celular em vez de seis linhas soltas.
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '18px 20px',
        }}
      >
        {numeros.map((n) => (
          <div key={n.rotulo}>
            <div
              style={{
                fontFamily: 'var(--disp)',
                fontSize: 26,
                fontWeight: 600,
                lineHeight: 1.1,
                letterSpacing: '-.02em',
                color: 'var(--text)',
              }}
            >
              {n.valor}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{n.rotulo}</div>
            {n.nota && (
              <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 1 }}>{n.nota}</div>
            )}
          </div>
        ))}
      </div>

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
    </div>
  )
}
