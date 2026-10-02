import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteServidor } from '@/lib/supabase/server'
import { mesTitulado } from '@/lib/prompt'
import { reais } from '@/lib/midia'
import {
  lerCotacao,
  cotacaoDoDia,
  FONTES_DE_COTACAO,
  emReais,
  diaEmSaoPaulo,
  fatorCartao,
  IOF_CARTAO,
  SPREAD_CARTAO,
  type Cotacao,
} from '@/lib/cambio'
import {
  ETAPA,
  contaVazia,
  custoVazio,
  dolar,
  duracao,
  segundosMedios,
  segundosMediosDe,
  porcentoIntocadas,
  pautasDaEquipe,
  somarCusto,
  somarCustoPorMes,
  somarTudo,
  somarPorPlano,
  usdPorPautaAprovada,
  brlPorPautaAprovada,
  type Conta,
  type CorridaMedida,
  type Custo,
  type DecisaoMedida,
  type PautaMedida,
  type VersaoMedida,
} from '@/lib/medidas'
import { Quadro, type Numero } from '@/lib/quadro'

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
 * DUAS LEITURAS DO MESMO DADO. Por mês responde "como foi outubro na
 * agência inteira"; por marca responde "como esta conta vem andando".
 * A mesma soma, dois agrupamentos, e a escolha fica na barra de cima.
 *
 * QUEM VÊ O QUÊ. A equipe vê qualidade; o custo é da administração.
 * A separação é de banco, não de tela: desde a 0043 a política de
 * `ai_runs` só devolve ao não-administrador as chamadas que ele mesmo
 * disparou. Esconder o bloco aqui seria enfeite.
 */

type MesDaMarca = {
  id: string
  mes: number
  ano: number
  marcaId: string
  marcaNome: string
  marcaSlug: string
  cor: string
  conta: Conta
  /** Quanto tempo do envio até o cliente aprovar a última peça. Nulo: não concluído. */
  segundosAteConcluir: number | null
}

/**
 * Garante que o dia de hoje tenha cotação guardada.
 *
 * Busca uma vez por dia, no primeiro acesso da administração à página.
 * Falhou a busca, veio em formato estranho, veio um número implausível:
 * não grava nada e a página mostra dólar, avisando. Cotação chutada
 * numa tela de custo é pior que cotação faltando, porque ninguém
 * desconfia de um número que já está lá.
 */
async function garantirCotacaoDeHoje(
  supabase: SupabaseClient,
  cotacoes: Cotacao[],
): Promise<{ cotacoes: Cotacao[]; falha: string | null }> {
  const hoje = diaEmSaoPaulo(new Date())
  if (!hoje || cotacoes.some((c) => c.dia === hoje)) return { cotacoes, falha: null }

  const tropecos: string[] = []

  for (const fonte of FONTES_DE_COTACAO) {
    try {
      const r = await fetch(fonte.url(), {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      })
      if (!r.ok) {
        tropecos.push(`${fonte.nome} respondeu HTTP ${r.status}`)
        continue
      }
      const valor = lerCotacao(await r.json())
      if (valor === null) {
        tropecos.push(`${fonte.nome} respondeu num formato que não reconheci`)
        continue
      }

      const { data, error } = await supabase.rpc('registrar_cotacao', {
        p_dia: hoje,
        p_valor: valor,
        p_fonte: fonte.nome,
      })
      if (error) {
        tropecos.push(`${fonte.nome} trouxe ${valor}, mas o banco recusou: ${error.message}`)
        continue
      }
      const guardado = Number(data ?? valor)
      return {
        cotacoes: [...cotacoes, { dia: hoje, valor: Number.isFinite(guardado) ? guardado : valor }],
        falha: null,
      }
    } catch (e) {
      // Página de métrica não cai porque uma API de câmbio piscou.
      tropecos.push(`${fonte.nome}: ${e instanceof Error ? e.message : 'não respondeu'}`)
    }
  }

  return { cotacoes, falha: tropecos.join(' · ') || 'nenhuma fonte respondeu' }
}

export default async function Precisao({
  searchParams,
}: {
  searchParams: Promise<{ por?: string }>
}) {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const papel = (perfil?.role as string) ?? 'client'
  if (papel === 'client') redirect('/cliente')
  const admin = papel === 'admin'

  const por = (await searchParams)?.por === 'marca' ? 'marca' : 'mes'

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

  // O custo é da administração. Para o resto da equipe nem a consulta
  // sai: o banco recusaria as linhas que não são dela, e pedir para
  // depois descartar seria trabalho à toa.
  const { data: corridas } = admin
    ? await supabase
        .from('ai_runs')
        .select('brand_id, plan_id, agent, cost_usd, status, created_at, plano_excluido_em, plano_mes, plano_ano')
        .limit(10000)
    : { data: null }

  const { data: cotacoesBrutas } = admin
    ? await supabase.from('cotacao_dolar').select('dia, valor').order('dia')
    : { data: null }

  let cotacoes: Cotacao[] = (cotacoesBrutas ?? []).map((c) => ({
    dia: String(c.dia),
    valor: Number(c.valor),
  }))
  let falhaDoCambio: string | null = null
  if (admin && (corridas ?? []).length > 0) {
    const r = await garantirCotacaoDeHoje(supabase, cotacoes)
    cotacoes = r.cotacoes
    falhaDoCambio = r.falha
  }

  /**
   * Quantas chamadas foram convertidas pela cotação de OUTRO dia.
   *
   * Converter pelo dia mais próximo é honesto e é melhor que não
   * converter, mas a tela precisa dizer que fez isso — senão um valor
   * aproximado passa por exato, que é o defeito que esta página toda
   * existe para não cometer.
   */
  let aproximadas = 0

  /** Converte pela cotação do dia da chamada, com o acréscimo do cartão. */
  const converter = (usd: number, dia: string | undefined): number => {
    if (!dia) return 0
    const c = cotacaoDoDia(cotacoes, dia)
    if (!c) return 0
    if (!c.exata && usd > 0) aproximadas++
    return emReais(usd, c.valor)
  }
  const temReal = cotacoes.length > 0

  const [{ data: pautas }, { data: versoes }, { data: decisoes }] = idsPlano.length
    ? await Promise.all([
        supabase
          .from('content_ideas')
          .select('id, plan_id, status, current_version, origem')
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
        origem: (p.origem as string) ?? 'ia',
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

  // O mês de cada planejamento, para a chamada de IA saber a que mês
  // pertence. Mês excluído já vem carimbado na própria chamada (0019).
  const mesDoPlano = new Map<string, string>()
  for (const p of planos ?? []) {
    mesDoPlano.set(p.id as string, `${p.year}-${String(p.month).padStart(2, '0')}`)
  }

  const corridasMedidas: CorridaMedida[] = (corridas ?? []).map((c) => ({
    brand_id: c.brand_id as string,
    agent: (c.agent as string) ?? '',
    cost_usd: Number(c.cost_usd ?? 0),
    status: (c.status as string) ?? '',
    dia: c.created_at ? diaEmSaoPaulo(c.created_at as string) : undefined,
    mes:
      mesDoPlano.get(c.plan_id as string) ??
      (c.plano_ano ? `${c.plano_ano}-${String(c.plano_mes).padStart(2, '0')}` : null),
    planoExcluido: c.plano_excluido_em
      ? `${c.plano_ano}-${String(c.plano_mes).padStart(2, '0')}`
      : null,
  }))

  const custoPorMarca = somarCusto(corridasMedidas, converter)
  const custoPorMes = somarCustoPorMes(corridasMedidas, converter)
  const custoTotal = somarTudo(custoPorMarca)

  type DadosDaMarca = { nome: string; slug: string; cor: string }
  const nomeDaMarca = new Map<string, DadosDaMarca>(
    (marcas ?? []).map((m): [string, DadosDaMarca] => [
      m.id as string,
      {
        nome: m.name as string,
        slug: m.slug as string,
        cor: (m.color as string | null) ?? 'var(--accent)',
      },
    ]),
  )

  const todosOsMeses: MesDaMarca[] = (planos ?? []).map((p) => {
    const marca = nomeDaMarca.get(p.brand_id as string)
    return {
      id: p.id as string,
      mes: Number(p.month),
      ano: Number(p.year),
      marcaId: p.brand_id as string,
      marcaNome: marca?.nome ?? 'marca que não alcanço',
      marcaSlug: marca?.slug ?? '',
      cor: marca?.cor ?? 'var(--accent)',
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
    }
  })

  const porMarca = new Map<string, MesDaMarca[]>()
  for (const x of todosOsMeses) {
    const lista = porMarca.get(x.marcaId) ?? []
    lista.push(x)
    porMarca.set(x.marcaId, lista)
  }

  const porMes = new Map<string, MesDaMarca[]>()
  for (const x of todosOsMeses) {
    const chave = `${x.ano}-${String(x.mes).padStart(2, '0')}`
    const lista = porMes.get(chave) ?? []
    lista.push(x)
    porMes.set(chave, lista)
  }
  const mesesOrdenados = [...porMes.keys()].sort().reverse()

  // Entra na página toda marca que tem mês planejado OU custo de IA —
  // inclusive a que teve todos os meses excluídos.
  const comDados = (marcas ?? []).filter(
    (m) =>
      (porMarca.get(m.id as string) ?? []).length > 0 ||
      (custoPorMarca.get(m.id as string)?.chamadas ?? 0) > 0,
  )

  /** O dinheiro como a tela mostra: real quando dá, dólar quando não dá. */
  const dinheiro = (c: { usd: number; brl: number }): string =>
    temReal && c.brl > 0 ? reais(c.brl, true) : dolar(c.usd)
  const dinheiroDe = (brl: number | null, usd: number | null): string =>
    temReal && brl !== null && brl > 0 ? reais(brl, true) : usd !== null ? dolar(usd) : 'sem dados'

  const soma = (lista: MesDaMarca[], f: (c: Conta) => number) =>
    lista.reduce((t, x) => t + f(x.conta), 0)

  const vazio = (
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
  )

  return (
    <main className="pagina-equipe">
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

      {/* A mesma soma, dois agrupamentos. Por mês para olhar a agência;
          por marca para olhar uma conta ao longo do tempo. */}
      <nav
        role="tablist"
        aria-label="Como agrupar os números"
        style={{ display: 'flex', gap: 6, marginTop: 16, marginBottom: 4, flexWrap: 'wrap' }}
      >
        {[
          { chave: 'mes', texto: 'Por mês', href: '/painel/qualidade' },
          { chave: 'marca', texto: 'Por marca', href: '/painel/qualidade?por=marca' },
        ].map((a) => {
          const ativo = por === a.chave
          return (
            <Link
              key={a.chave}
              href={a.href}
              role="tab"
              aria-selected={ativo}
              style={{
                fontSize: 13,
                fontWeight: ativo ? 700 : 600,
                padding: '7px 15px',
                borderRadius: 99,
                textDecoration: 'none',
                background: ativo ? 'var(--accent)' : 'var(--surface)',
                color: ativo ? '#fff' : 'var(--text)',
                boxShadow: ativo ? 'var(--shadow-botao)' : '0 1px 2px rgba(29, 37, 48, .06)',
              }}
            >
              {a.texto}
            </Link>
          )
        })}
      </nav>

      {comDados.length === 0 && vazio}

      {/* ---------------------------------------------------------- */}
      {/* POR MÊS                                                     */}
      {/* ---------------------------------------------------------- */}
      {por === 'mes' &&
        comDados.length > 0 &&
        mesesOrdenados.map((chave) => {
          const lista = (porMes.get(chave) ?? []).sort((a, b) =>
            a.marcaNome.localeCompare(b.marcaNome, 'pt-BR'),
          )
          const [ano, mes] = chave.split('-').map(Number)
          const recente = porcentoIntocadas(lista.map((x) => x.conta))
          const daEquipe = pautasDaEquipe(lista.map((x) => x.conta))
          const custo = custoPorMes.get(chave) ?? custoVazio()
          const aprovadas = soma(lista, (c) => c.aprovadas)
          const concluidos = lista.filter((x) => x.segundosAteConcluir !== null)

          const numeros: Numero[] = [
            {
              valor: recente.pautas > 0 ? `${recente.pct}%` : 'sem dados',
              rotulo: 'sem edição',
              nota: recente.pautas > 0 ? `${recente.intocadas} de ${recente.pautas} da IA` : undefined,
              icone: 'alvo',
            },
            {
              valor: String(soma(lista, (c) => c.pautas)),
              rotulo: 'pautas no mês',
              nota: daEquipe > 0 ? `${daEquipe} ${daEquipe === 1 ? 'escrita' : 'escritas'} pela equipe` : undefined,
              icone: 'conteudo',
            },
            { valor: String(lista.length), rotulo: lista.length === 1 ? 'marca' : 'marcas', icone: 'marca' },
            {
              valor: String(soma(lista, (c) => c.correcoesEquipe)),
              rotulo: 'reescritas pela equipe',
              icone: 'editado',
            },
            {
              valor: String(soma(lista, (c) => c.pedidosCliente)),
              rotulo: 'pedidos do cliente',
              icone: 'ajuste',
            },
            {
              valor: duracao(segundosMediosDe(concluidos.map((x) => x.conta))) ?? 'sem dados',
              rotulo: 'resposta média do cliente',
              nota: concluidos.length === 0 ? 'só conta mês 100% aprovado' : undefined,
              icone: 'tempo',
            },
            ...(admin
              ? [
                  {
                    valor: custo.chamadas > 0 ? dinheiro(custo) : 'sem dados',
                    rotulo: 'custo de IA no mês',
                    nota:
                      aprovadas > 0 && custo.chamadas > 0
                        ? `${dinheiroDe(brlPorPautaAprovada(custo, aprovadas), usdPorPautaAprovada(custo, aprovadas))} por pauta aprovada`
                        : undefined,
                    icone: 'custo' as const,
                  },
                ]
              : []),
          ]

          return (
            <section key={chave} style={{ marginTop: 30 }}>
              <h2
                style={{
                  fontFamily: 'var(--disp)',
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: '-.02em',
                  marginBottom: 12,
                }}
              >
                {mesTitulado(mes)} de {ano}
              </h2>

              <div style={{ marginBottom: 12 }}>
                <Quadro titulo="O mês na agência" numeros={numeros} marginTop={0} />
              </div>

              <div
                style={{
                  overflowX: 'auto',
                  background: 'var(--surface)',
                  borderRadius: 'var(--r-lg)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13.3 }}>
                  <thead>
                    <tr>
                      {['Marca', 'Pautas', 'Sem edição', 'Reescritas', 'Refinos de IA', 'Pedidos do cliente'].map(
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
                    {lista.map((x) => {
                      const c = x.conta
                      const pct = c.daIA ? Math.round((c.intocadas / c.daIA) * 100) : 0
                      return (
                        <tr key={x.id} style={{ borderTop: '1px solid var(--line)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            <span
                              aria-hidden
                              style={{
                                display: 'inline-block',
                                width: 8,
                                height: 8,
                                borderRadius: 99,
                                background: x.cor,
                                marginRight: 8,
                              }}
                            />
                            <Link
                              href={`/painel/marca/${x.marcaSlug}/calendario/${x.ano}/${x.mes}`}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                            >
                              {x.marcaNome}
                            </Link>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                            {c.pautas}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
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
                                <div style={{ width: `${pct}%`, height: '100%', background: x.cor }} />
                              </div>
                              <b style={{ minWidth: 62, textAlign: 'right' }}>
                                {c.intocadas}/{c.daIA} · {pct}%
                              </b>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                            {c.correcoesEquipe}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                            {c.refinosIA}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                            {c.pedidosCliente}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {admin && custo.chamadas > 0 && <BlocoDeCusto custo={custo} dinheiro={dinheiro} />}
            </section>
          )
        })}

      {/* ---------------------------------------------------------- */}
      {/* POR MARCA                                                   */}
      {/* ---------------------------------------------------------- */}
      {por === 'marca' &&
        comDados.map((m) => {
          const meses = porMarca.get(m.id as string) ?? []
          const tresUltimos = meses.slice(0, 3)
          const recente = porcentoIntocadas(tresUltimos.map((x) => x.conta))
          const daEquipe = pautasDaEquipe(meses.map((x) => x.conta))
          const cor = (m.color as string | null) ?? 'var(--accent)'
          const concluidos = meses.filter((x) => x.segundosAteConcluir !== null)
          const respostaMarca = duracao(segundosMediosDe(concluidos.map((x) => x.conta)))
          const custoMarca = custoPorMarca.get(m.id as string) ?? custoVazio()
          const aprovadas = soma(meses, (c) => c.aprovadas)

          const numeros: Numero[] = [
            {
              valor: recente.pautas > 0 ? `${recente.pct}%` : 'sem dados',
              rotulo: 'sem edição',
              nota:
                recente.pautas > 0
                  ? tresUltimos.length === 1
                    ? 'no último mês'
                    : `nos últimos ${tresUltimos.length} meses`
                  : undefined,
              icone: 'alvo',
            },
            {
              valor: String(soma(meses, (c) => c.pautas)),
              rotulo: 'pautas no mês',
              nota: daEquipe > 0 ? `${daEquipe} ${daEquipe === 1 ? 'escrita' : 'escritas'} pela equipe` : undefined,
              icone: 'conteudo',
            },
            { valor: String(soma(meses, (c) => c.correcoesEquipe)), rotulo: 'reescritas pela equipe', icone: 'editado' },
            { valor: String(soma(meses, (c) => c.refinosIA)), rotulo: 'refinos de IA', icone: 'refino' },
            {
              valor: String(soma(meses, (c) => c.pedidosCliente)),
              rotulo: 'pedidos do cliente',
              icone: 'ajuste',
            },
            {
              valor: respostaMarca ?? 'sem dados',
              rotulo: 'resposta média do cliente',
              nota:
                concluidos.length === 0
                  ? 'só conta mês 100% aprovado'
                  : concluidos.length === 1
                    ? '1 mês concluído'
                    : `${concluidos.length} meses concluídos`,
              icone: 'tempo',
            },
            ...(admin
              ? [
                  {
                    valor: dinheiroDe(
                      brlPorPautaAprovada(custoMarca, aprovadas),
                      usdPorPautaAprovada(custoMarca, aprovadas),
                    ),
                    rotulo: 'custo por pauta aprovada',
                    icone: 'custo' as const,
                  },
                ]
              : []),
          ]

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

              <div style={{ marginBottom: 12 }}>
                <Quadro titulo="Resumo da marca" numeros={numeros} marginTop={0} />
              </div>

              {meses.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 4 }}>
                  Nenhum planejamento desta marca existe hoje. Os que foram gerados foram
                  excluídos, e o custo deles continua na conta abaixo.
                </p>
              ) : (
                <div
                  style={{
                    overflowX: 'auto',
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
                        const pct = c.daIA ? Math.round((c.intocadas / c.daIA) * 100) : 0
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
                                  {c.intocadas}/{c.daIA} · {pct}%
                                </b>
                              </div>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                              {c.correcoesEquipe}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                              {c.refinosIA}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                              {c.pedidosCliente}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                              {c.decisoesCliente === 0 ? (
                                'sem respostas'
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
              {admin && custoMarca.chamadas > 0 && (
                <BlocoDeCusto custo={custoMarca} dinheiro={dinheiro} aprovadas={aprovadas} />
              )}
            </section>
          )
        })}

      {admin && custoTotal.chamadas > 0 && (
        <section
          style={{
            marginTop: 34,
            padding: '16px 20px',
            borderRadius: 'var(--r)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <b>Custo total de IA, todas as marcas: {dinheiro(custoTotal)}</b>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>
              em {custoTotal.chamadas} chamada(s)
              {custoTotal.excluido.usd > 0 &&
                ` · ${dinheiro(custoTotal.excluido)} vieram de planejamentos excluídos`}
            </span>
          </div>
          <div style={{ color: 'var(--faint)', fontSize: 12.3, marginTop: 6, lineHeight: 1.6 }}>
            {temReal ? (
              <>
                Em dólar, {dolar(custoTotal.usd)}. Cada chamada foi convertida pela cotação
                comercial do dia em que aconteceu, mais {(SPREAD_CARTAO * 100).toFixed(0)}% de
                spread do banco e {(IOF_CARTAO * 100).toFixed(1).replace('.', ',')}% de IOF — um
                acréscimo de {((fatorCartao() - 1) * 100).toFixed(1).replace('.', ',')}% sobre a
                cotação, que é o que chega na fatura do cartão.
                {custoTotal.semCotacao > 0 &&
                  ` ${custoTotal.semCotacao} chamada(s) ficaram sem cotação do dia e entram só no total em dólar.`}
                {aproximadas > 0 && (
                  <>
                    {' '}
                    <b style={{ color: 'var(--text)' }}>
                      {aproximadas} chamada(s) foram convertidas pela cotação de outro dia
                    </b>
                    , o mais próximo com cotação guardada. Rodar o <code>25-cotacao.cmd</code>{' '}
                    preenche os dias que faltam.
                  </>
                )}
              </>
            ) : (
              <>
                Ainda não há cotação guardada, então os valores aparecem em dólar.
                {falhaDoCambio ? (
                  <>
                    {' '}
                    Tentei buscar agora e não consegui: <b style={{ color: 'var(--text)' }}>{falhaDoCambio}</b>.
                    O <code>25-cotacao.cmd</code> testa as mesmas fontes a partir da sua máquina e
                    mostra a resposta crua de cada uma.
                  </>
                ) : (
                  ' A primeira cotação é buscada automaticamente no próximo acesso a esta página.'
                )}
              </>
            )}
          </div>
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
        <p style={{ marginTop: 6 }}>
          Pauta que a equipe acrescentou à mão não entra nesta conta. A pergunta aqui é quanto a
          IA acerta de primeira, e peça escrita por uma pessoa chega inteira na versão 1 — ela
          inflaria a medida sem a IA ter escrito uma linha. Ela continua contando na coluna de
          pautas do mês.
        </p>

        {admin && (
          <>
            <b style={{ color: 'var(--text)', display: 'block', marginTop: 16 }}>Sobre o custo</b>
            <p style={{ marginTop: 4 }}>
              Aqui, o número que mais importa não é quanto foi gasto no total, mas o{' '}
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
              A Anthropic cobra em dólar. Cada chamada é convertida pela cotação do dia em que
              ela aconteceu, e não pela de hoje: assim um mês fechado mostra sempre o mesmo
              valor. Ao lado da cotação entram o spread do banco e o IOF, para o número bater
              com a fatura do cartão em vez de ficar abaixo dela.
            </p>
            <p style={{ marginTop: 6 }}>
              O custo é visível só para a administração. A equipe vê a qualidade, que é o que
              ajuda a melhorar a base das marcas.
            </p>
          </>
        )}
      </section>
    </main>
  )
}

/**
 * O detalhe do custo: total, falhas, meses excluídos e as etapas.
 *
 * Uma função só porque as duas leituras da página mostram o mesmo
 * bloco. Duas cópias divergiriam no dia em que uma etapa nova
 * aparecesse.
 */
function BlocoDeCusto({
  custo,
  dinheiro,
  aprovadas,
}: {
  custo: Custo
  dinheiro: (c: { usd: number; brl: number }) => string
  aprovadas?: number
}) {
  const etapas = Object.entries(custo.porEtapa).sort((a, b) => b[1].usd - a[1].usd)
  const porPautaBrl = aprovadas !== undefined ? brlPorPautaAprovada(custo, aprovadas) : null
  const porPautaUsd = aprovadas !== undefined ? usdPorPautaAprovada(custo, aprovadas) : null

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
        <b>Custo de IA: {dinheiro(custo)}</b>
        <span style={{ color: 'var(--muted)' }}>
          em {custo.chamadas} chamada(s)
          {porPautaUsd !== null &&
            ` · ${porPautaBrl !== null && custo.brl > 0 ? reais(porPautaBrl, true) : dolar(porPautaUsd)} por pauta aprovada`}
        </span>
        {custo.falhas > 0 && (
          <span style={{ color: 'var(--laranja-tinta)', fontWeight: 600 }}>
            {custo.falhas} falha(s): token gasto sem resultado
          </span>
        )}
      </div>
      {custo.excluido.chamadas > 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
          Inclui <b style={{ color: 'var(--text)' }}>{dinheiro(custo.excluido)}</b> de{' '}
          {custo.excluido.meses.length} planejamento(s) excluído(s):{' '}
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
            {ETAPA[agente] ?? agente}: <b style={{ color: 'var(--text)' }}>{dinheiro(e)}</b>{' '}
            ({e.chamadas})
          </span>
        ))}
      </div>
    </div>
  )
}
