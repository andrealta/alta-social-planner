import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { mesTitulado } from '@/lib/prompt'
import {
  ETAPA,
  contaVazia,
  custoVazio,
  dolar,
  duracao,
  segundosMedios,
  segundosMediosDe,
  porcentoIntocadas,
  somarCusto,
  somarTudo,
  somarPorPlano,
  usdPorPautaAprovada,
  type Conta,
  type CorridaMedida,
  type DecisaoMedida,
  type PautaMedida,
  type VersaoMedida,
} from '@/lib/medidas'

/**
 * Precisão: o antes e o depois.
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
export default async function Precisao() {
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
      .select('id, brand_id, month, year, client_released_at, approved_at')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(72),
  ])

  const idsPlano = (planos ?? []).map((p) => p.id as string)

  // O custo vem SEMPRE, com ou sem planejamento vivo: marca que teve
  // todos os meses excluídos continua tendo gasto com IA, e é
  // exatamente o gasto que mais precisa aparecer.
  const { data: corridas } = await supabase
    .from('ai_runs')
    .select('brand_id, agent, cost_usd, status, plano_excluido_em, plano_mes, plano_ano')
    .limit(10000)

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

  const custoPorMarca = somarCusto(
    (corridas ?? []).map(
      (c): CorridaMedida => ({
        brand_id: c.brand_id as string,
        agent: (c.agent as string) ?? '',
        cost_usd: Number(c.cost_usd ?? 0),
        status: (c.status as string) ?? '',
        planoExcluido: c.plano_excluido_em
          ? `${c.plano_ano}-${String(c.plano_mes).padStart(2, '0')}`
          : null,
      }),
    ),
  )
  const custoTotal = somarTudo(custoPorMarca)

  type MesDaMarca = {
    id: string
    mes: number
    ano: number
    conta: Conta
    /** Quanto tempo do envio até o cliente aprovar a última peça. Nulo: não concluído. */
    segundosAteConcluir: number | null
  }
  const porMarca = new Map<string, MesDaMarca[]>()
  for (const p of planos ?? []) {
    const lista = porMarca.get(p.brand_id as string) ?? []
    lista.push({
      id: p.id as string,
      mes: Number(p.month),
      ano: Number(p.year),
      conta: conta.get(p.id as string) ?? contaVazia(),
      segundosAteConcluir:
        p.approved_at && p.client_released_at
          ? Math.max(
              0,
              (new Date(p.approved_at as string).getTime() -
                new Date(p.client_released_at as string).getTime()) /
                1000,
            )
          : null,
    })
    porMarca.set(p.brand_id as string, lista)
  }

  // Entra na página toda marca que tem mês planejado OU custo de IA —
  // inclusive a que teve todos os meses excluídos.
  const comDados = (marcas ?? []).filter(
    (m) =>
      (porMarca.get(m.id as string) ?? []).length > 0 ||
      (custoPorMarca.get(m.id as string)?.chamadas ?? 0) > 0,
  )

  return (
    <main className="pagina" style={{ maxWidth: 1080 }}>
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
          Precisão
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
          De cada dez pautas geradas, quantas passaram direto, sem ninguém precisar colocar a
          mão? Esse é o termômetro mais simples da qualidade: ajuda a entender se as mudanças
          na base ou no prompt fizeram o próximo mês ficar melhor que o anterior.
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
          const concluidos = meses.filter((x) => x.segundosAteConcluir !== null)
          const respostaMarca = duracao(segundosMediosDe(concluidos.map((x) => x.conta)))

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
                {respostaMarca && (
                  <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                    · o cliente responde em média em {respostaMarca}
                    {concluidos.length > 0 && ` (${concluidos.length} mês(es) concluído(s))`}
                  </span>
                )}
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

              {meses.length === 0 && (
                <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 4 }}>
                  Nenhum planejamento desta marca existe hoje — os que foram gerados foram
                  excluídos. O custo deles continua abaixo.
                </p>
              )}

              {/* Sete colunas não cabem num telefone. Em vez de
                  encolher a fonte até ninguém ler, a tabela rola de
                  lado — e a primeira coluna, o mês, é a que orienta. */}
              {meses.length > 0 && (
              <div
                className="rolar-lado"
                style={{
                  background: 'var(--surface)',
                  borderRadius: 'var(--r-lg)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13.3 }}>
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
                      // A média só aparece com o mês 100% aprovado: antes
                      // disso ela mudaria a cada clique do cliente, e um
                      // número que ainda está andando engana mais do que
                      // informa.
                      const concluido = x.segundosAteConcluir !== null
                      const media = concluido ? duracao(segundosMedios(c)) : null
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
                            {c.decisoesCliente === 0 ? (
                              '—'
                            ) : (
                              <>
                                {c.decisoesCliente} decisões
                                {concluido ? (media ? ` · média de ${media}` : '') : ' · em andamento'}
                                {concluido && (
                                  <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 2 }}>
                                    mês aprovado em {duracao(x.segundosAteConcluir)}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              )}

              {/* O custo fica ao lado da qualidade de propósito. Custo
                  sozinho empurra para economizar chamada; qualidade
                  sozinha empurra para gastar. Juntos, a conta que
                  importa aparece: quanto custou cada pauta que ficou. */}
              {(() => {
                const custo = custoPorMarca.get(m.id as string) ?? custoVazio()
                if (custo.chamadas === 0) return null
                const aprovadasTotal = meses.reduce((s, x) => s + x.conta.aprovadas, 0)
                const porPauta = usdPorPautaAprovada(custo, aprovadasTotal)
                const etapas = Object.entries(custo.porEtapa).sort((a, b) => b[1].usd - a[1].usd)

                return (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '14px 18px',
                      borderRadius: 'var(--r)',
                      background: 'var(--surface-2)',
                      fontSize: 13,
                      lineHeight: 1.7,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                      <b>Custo de IA nesta marca: {dolar(custo.usd)}</b>
                      <span style={{ color: 'var(--muted)' }}>
                        em {custo.chamadas} chamada(s)
                        {porPauta !== null && ` · ${dolar(porPauta)} por pauta aprovada`}
                      </span>
                      {custo.falhas > 0 && (
                        <span style={{ color: 'var(--laranja-tinta)', fontWeight: 600 }}>
                          {custo.falhas} falha(s) — token gasto sem resultado
                        </span>
                      )}
                    </div>
                    {custo.excluido.chamadas > 0 && (
                      <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
                        Inclui <b style={{ color: 'var(--text)' }}>{dolar(custo.excluido.usd)}</b> de{' '}
                        {custo.excluido.meses.length} planejamento(s) excluído(s) —{' '}
                        {custo.excluido.meses
                          .sort()
                          .map((am) => {
                            const [a, mm] = am.split('-').map(Number)
                            return `${mesTitulado(mm).toLowerCase()} de ${a}`
                          })
                          .join(', ')}
                        . Foram gerados e pagos, mesmo sem ter ficado.
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        gap: 16,
                        flexWrap: 'wrap',
                        marginTop: 6,
                        color: 'var(--muted)',
                        fontSize: 12.5,
                      }}
                    >
                      {etapas.map(([agente, e]) => (
                        <span key={agente}>
                          {ETAPA[agente] ?? agente}: <b style={{ color: 'var(--text)' }}>{dolar(e.usd)}</b>{' '}
                          ({e.chamadas})
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </section>
          )
        })
      )}

      {custoTotal.chamadas > 0 && (
        <section
          style={{
            marginTop: 34,
            padding: '16px 20px',
            borderRadius: 'var(--r)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            fontSize: 14,
            lineHeight: 1.6,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'baseline',
          }}
        >
          <b>Custo total de IA, todas as marcas: {dolar(custoTotal.usd)}</b>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            em {custoTotal.chamadas} chamada(s)
            {custoTotal.excluido.usd > 0 &&
              ` · ${dolar(custoTotal.excluido.usd)} vieram de planejamentos excluídos`}
          </span>
        </section>
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
        <b style={{ color: 'var(--text)' }}>Como ler estes números</b>
        <p style={{ marginTop: 4 }}>
          Uma pauta aprovada sem edição nem sempre significa que ela estava perfeita. O
          importante é acompanhar a evolução dos conteúdos da marca ao longo do tempo e olhar os
          números de alterações em conjunto.
        </p>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>
            <b style={{ color: 'var(--text)' }}>Sem edição aumenta e os pedidos de ajustes do cliente diminuem:</b> ótimo
            sinal. A IA está aprendendo a marca e acertando mais vezes de primeira.
          </li>
          <li>
            <b style={{ color: 'var(--text)' }}>Conteúdos sem edição aumentam, mas os pedidos de ajustes do cliente também
            sobem:</b> vale uma atenção na revisão interna. Pode ter coisa passando por aqui que o
            cliente acaba corrigindo depois.
          </li>
        </ul>
        <p style={{ marginTop: 6 }}>
          O objetivo é perceber se o processo está ficando mais inteligente mês após mês.
        </p>

        <b style={{ color: 'var(--text)', display: 'block', marginTop: 16 }}>Sobre o custo</b>
        <p style={{ marginTop: 4 }}>
          Aqui, o número que mais importa não é quanto foi gasto no total, mas o 
          <b style={{ color: 'var(--text)' }}>custo por pauta aprovada</b>.
        </p>
        <p style={{ marginTop: 6 }}>
          Se uma marca exige muitas tentativas, ajustes e novas gerações até chegar em poucas
          pautas aprovadas, cada peça acaba ficando mais cara. Normalmente, isso é um bom sinal
          de que a base da marca ainda pode aprender um pouco mais.
        </p>
        <p style={{ marginTop: 6 }}>
          E sim: até as tentativas que deram errado entram na conta do aprendizado. Planejamentos
          excluídos, erros e gerações descartadas também consumiram processamento da IA e,
          portanto, tiveram custo.
        </p>
        <p style={{ marginTop: 6 }}>
          Os valores aparecem em dólar porque é assim que a Anthropic faz a cobrança.
        </p>
        <p style={{ marginTop: 6 }}>
          A IA pensa em português, mas a conta ainda chega em dólar, para a tristeza do Roberto. 😄
        </p>
      </section>
    </main>
  )
}
