import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { mesTitulado } from '@/lib/prompt'
import {
  contaVazia,
  horasMedias,
  porcentoIntocadas,
  somarPorPlano,
  type DecisaoMedida,
  type PautaMedida,
  type VersaoMedida,
} from '@/lib/medidas'

/**
 * Qualidade: o antes e o depois.
 *
 * Existe porque, sem medida, toda conversa sobre "a IA melhorou" é
 * troca de impressão. Estes números já estavam no banco desde o
 * primeiro mês; faltava alguém somar.
 *
 * A medida principal é a mais crua possível: de cada dez pautas que a
 * IA escreveu, quantas foram aprovadas SEM a equipe reescrever nada.
 * Pauta nunca editada tem `current_version = 1` — não há versão
 * arquivada dela. É difícil discutir com isso.
 *
 * As outras três colunas dizem de onde veio o retrabalho: mão da
 * equipe, refino pedido à IA, ou pedido do cliente. Quando a base de
 * uma marca melhora, a coluna do cliente cai primeiro.
 */
export default async function Qualidade() {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const papel = (perfil?.role as string) ?? 'client'
  if (papel === 'client') redirect('/cliente')

  // Sem filtro por marca: o banco devolve só as marcas que esta pessoa
  // alcança, e a página mostra o que vier.
  const [{ data: marcas }, { data: planos }] = await Promise.all([
    supabase.from('brands').select('id, name, slug, color').order('name'),
    supabase
      .from('plans')
      .select('id, brand_id, month, year, client_released_at')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(72),
  ])

  const idsPlano = (planos ?? []).map((p) => p.id as string)

  const [{ data: pautas }, { data: versoes }, { data: decisoes }] = idsPlano.length
    ? await Promise.all([
        supabase
          .from('content_ideas')
          .select('id, plan_id, status, current_version')
          .in('plan_id', idsPlano),
        supabase.from('content_versions').select('idea_id, trigger').limit(4000),
        supabase
          .from('approvals')
          .select('idea_id, decision, actor_kind, seconds_to_decide')
          .limit(4000),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const conta = somarPorPlano({
    pautas: (pautas ?? []).map(
      (p): PautaMedida => ({
        id: p.id as string,
        plan_id: p.plan_id as string,
        status: (p.status as string) ?? '',
        current_version: Number(p.current_version ?? 1),
      }),
    ),
    versoes: (versoes ?? []).map(
      (v): VersaoMedida => ({ idea_id: v.idea_id as string, trigger: (v.trigger as string) ?? '' }),
    ),
    decisoes: (decisoes ?? []).map(
      (d): DecisaoMedida => ({
        idea_id: d.idea_id as string,
        decision: (d.decision as string) ?? '',
        actor_kind: (d.actor_kind as string) ?? '',
        seconds_to_decide: d.seconds_to_decide === null ? null : Number(d.seconds_to_decide),
      }),
    ),
  })

  const porMarca = new Map<string, { id: string; mes: number; ano: number; conta: Conta }[]>()
  for (const p of planos ?? []) {
    const lista = porMarca.get(p.brand_id as string) ?? []
    lista.push({
      id: p.id as string,
      mes: Number(p.month),
      ano: Number(p.year),
      conta: conta.get(p.id as string) ?? contaVazia(),
    })
    porMarca.set(p.brand_id as string, lista)
  }

  const comDados = (marcas ?? []).filter((m) => (porMarca.get(m.id as string) ?? []).length > 0)

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '36px 28px 70px' }}>
      <Link href="/painel" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
        ← Painel
      </Link>

      <header style={{ marginTop: 14, marginBottom: 8, maxWidth: 720 }}>
        <div
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 6,
          }}
        >
          Qualidade
        </div>
        <h1
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 30,
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: '-.025em',
          }}
        >
          Quanto a IA acerta de primeira
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14.5, marginTop: 8, lineHeight: 1.65 }}>
          De cada dez pautas geradas, quantas foram aprovadas sem ninguém reescrever. É a
          medida mais crua que existe, e serve para uma coisa só: comparar o mês que vem com
          o mês passado depois de mexer na base ou no prompt.
        </p>
      </header>

      {comDados.length === 0 ? (
        <div
          style={{
            marginTop: 20,
            padding: '36px 24px',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            color: 'var(--muted)',
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          Nenhum planejamento gerado ainda. A medida aparece a partir do primeiro mês.
        </div>
      ) : (
        comDados.map((m) => {
          const meses = porMarca.get(m.id as string) ?? []
          const tresUltimos = meses.slice(0, 3)
          const recente = porcentoIntocadas(tresUltimos.map((x) => x.conta))
          const somaPautas = recente.pautas
          const pctRecente = recente.pct
          const cor = (m.color as string | null) ?? 'var(--accent)'

          return (
            <section key={m.id as string} style={{ marginTop: 30 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                <h2
                  style={{
                    fontFamily: 'var(--disp)',
                    fontSize: 20,
                    fontWeight: 600,
                    letterSpacing: '-.02em',
                  }}
                >
                  {m.name as string}
                </h2>
                <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                  {somaPautas > 0
                    ? `${pctRecente}% sem edição nos últimos ${tresUltimos.length} mês(es)`
                    : 'sem pautas ainda'}
                </span>
                <Link
                  href={`/painel/marca/${m.slug as string}`}
                  style={{
                    marginLeft: 'auto',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'var(--accent)',
                    textDecoration: 'none',
                  }}
                >
                  Base da marca →
                </Link>
              </div>

              <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.3 }}>
                  <thead>
                    <tr>
                      {['Mês', 'Pautas', 'Sem edição', 'Reescritas pela equipe', 'Refinos de IA', 'Pedidos do cliente', 'Resposta do cliente'].map(
                        (t, i) => (
                          <th
                            key={t}
                            style={{
                              textAlign: i === 0 ? 'left' : 'right',
                              padding: '11px 16px',
                              fontSize: 10.5,
                              fontWeight: 700,
                              letterSpacing: '.1em',
                              textTransform: 'uppercase',
                              color: 'var(--faint)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {meses.map((x) => {
                      const c = x.conta
                      const pct = c.pautas ? Math.round((c.intocadas / c.pautas) * 100) : 0
                      const horas = horasMedias(c)
                      return (
                        <tr key={x.id} style={{ borderTop: '1px solid var(--line)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {mesTitulado(x.mes)} {x.ano}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                            {c.pautas}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            {/* Barra e número juntos: a barra dá a leitura de
                                relance, o número resolve a dúvida. */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 9,
                                justifyContent: 'flex-end',
                              }}
                            >
                              <div
                                style={{
                                  width: 84,
                                  height: 6,
                                  borderRadius: 99,
                                  background: 'var(--surface-3)',
                                  overflow: 'hidden',
                                }}
                              >
                                <div style={{ width: `${pct}%`, height: '100%', background: cor }} />
                              </div>
                              <b style={{ minWidth: 62, textAlign: 'right' }}>
                                {c.intocadas}/{c.pautas} · {pct}%
                              </b>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                            {c.correcoesEquipe}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                            {c.refinosIA}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              textAlign: 'right',
                              color: c.pedidosCliente > 0 ? 'var(--laranja-tinta)' : 'var(--muted)',
                              fontWeight: c.pedidosCliente > 0 ? 700 : 400,
                            }}
                          >
                            {c.pedidosCliente}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                            {c.decisoesCliente === 0
                              ? '—'
                              : `${c.decisoesCliente} decisões${horas !== null ? ` · ~${horas}h` : ''}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })
      )}

      <section
        style={{
          marginTop: 34,
          padding: '18px 20px',
          borderRadius: 'var(--r)',
          background: 'var(--surface-2)',
          fontSize: 13.3,
          lineHeight: 1.7,
          color: 'var(--muted)',
          maxWidth: 760,
        }}
      >
        <b style={{ color: 'var(--text)' }}>Como ler isto sem se enganar.</b> "Sem edição" não é
        o mesmo que "boa": uma pauta pode passar intacta porque ninguém revisou com atenção.
        O número só vale comparado com ele mesmo, na mesma marca, entre meses — e vale mais
        quando a coluna de pedidos do cliente anda junto. Se as duas caem, melhorou. Se a
        primeira sobe e a segunda também, alguém está aprovando rápido demais.
      </section>
    </main>
  )
}
