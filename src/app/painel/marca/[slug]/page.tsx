import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { SECOES, situacao } from '@/lib/base'
import { Editor } from './editor'
import { Cor } from './cor'
import { calcularStatusEquipe } from '@/lib/status'
import { duracao } from '@/lib/medidas'
import { Quadro, type Numero } from '@/lib/quadro'

export default async function BaseDaMarca({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const papel = (perfil?.role as string) ?? 'client'
  // A base alimenta toda a geração: estragá-la estraga os meses
  // seguintes, não só uma peça. Por isso ela tem permissão própria
  // desde a 0028, e não basta ser da equipe.
  const { data: podeBase } = await supabase.rpc('pode', { p: 'base' })
  const podeEditar = (papel === 'admin' || papel === 'staff') && podeBase === true

  // Sem filtro por marca no código: se as políticas do banco não
  // deixarem, a consulta volta vazia e a página some. É o teste de
  // isolamento acontecendo em produção, a cada carregamento.
  const { data: marca } = await supabase
    .from('brands')
    .select('id, name, slug, segment, color')
    .eq('slug', slug)
    .maybeSingle()

  if (!marca) notFound()

  const [{ data: secoes }, { data: escopo }] = await Promise.all([
    supabase.from('brand_knowledge').select('section, content, updated_at').eq('brand_id', marca.id),
    supabase
      .from('brand_scope')
      .select('label, monthly_quota, position')
      .eq('brand_id', marca.id)
      .eq('active', true)
      .order('position'),
  ])

  // O status desta marca: a mesma conta da tela inicial, só com ela.
  const [{ data: planos }, { data: pautas }, { data: decisoes }] = await Promise.all([
    supabase.from('plans').select('id, brand_id').eq('brand_id', marca.id),
    supabase.from('content_ideas').select('id, plan_id, status').eq('brand_id', marca.id),
    supabase
      .from('approvals')
      .select('idea_id, actor_kind, seconds_to_decide')
      .eq('brand_id', marca.id)
      .eq('actor_kind', 'client'),
  ])
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
  const numeros: Numero[] = [
    { valor: String(status.meses), rotulo: status.meses === 1 ? 'mês planejado' : 'meses planejados', icone: 'calendario' },
    { valor: String(status.conteudos), rotulo: 'pautas criadas', icone: 'conteudo' },
    { valor: String(status.aprovadas), rotulo: 'aprovadas pelo cliente', icone: 'aprovado' },
    { valor: String(status.naEquipe), rotulo: 'com a equipe', icone: 'equipe' },
    { valor: String(status.comCliente), rotulo: 'com o cliente', icone: 'cliente' },
    {
      valor: String(status.ajustes),
      rotulo: 'ajustes para fazer',
      icone: 'ajuste',
      destaque: status.ajustes > 0,
    },
    { valor: tempo ?? 'sem dados', rotulo: 'resposta média do cliente', icone: 'tempo' },
  ]

  const iniciais: Record<string, Record<string, string>> = {}
  for (const s of SECOES) iniciais[s.chave] = {}
  for (const linha of secoes ?? []) {
    const chave = linha.section as string
    if (!(chave in iniciais)) continue
    const conteudo = (linha.content ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(conteudo)) {
      iniciais[chave][k] = typeof v === 'string' ? v : JSON.stringify(v)
    }
  }

  const cota = (escopo ?? []).reduce((s, e) => s + Number(e.monthly_quota ?? 0), 0)
  const atualizadaEm = (secoes ?? [])
    .map((s) => s.updated_at as string)
    .sort()
    .at(-1)

  const proibidas = situacao(iniciais['voice']?.['v_nao'])

  // A última varredura dos concorrentes. Fica aqui, e não numa tela
  // própria, porque ela pertence à base: é consequência do campo
  // Concorrentes, e quem preenche um deve ver o outro.
  const { data: varreduras } = await supabase
    .from('research_runs')
    .select('id, started_at, queries, discarded')
    .eq('brand_id', marca.id)
    .eq('kind', 'competitors')
    .eq('status', 'done')
    .order('started_at', { ascending: false })
    .limit(1)

  const varredura = (varreduras ?? [])[0]
  const { count: publicacoes } = varredura
    ? await supabase
        .from('research_sources')
        .select('id', { count: 'exact', head: true })
        .eq('research_run_id', varredura.id as string)
    : { count: 0 }

  const arrobasCitados = [
    ...new Set(
      (iniciais['identity']?.['i_conc'] ?? '')
        .match(/@([A-Za-z0-9._]{2,30})/g)
        ?.map((a) => a.replace(/\.+$/, '').toLowerCase()) ?? [],
    ),
  ]
  const lidos = Array.isArray(varredura?.queries) ? (varredura.queries as string[]) : []
  const recusados = Array.isArray(varredura?.discarded)
    ? (varredura.discarded as { handle?: string; motivo?: string }[])
    : []
  const diasDaVarredura = varredura
    ? Math.floor(
        (Date.now() - new Date(varredura.started_at as string).getTime()) / 86400000,
      )
    : null

  return (
    <main className="pagina-equipe">
      <Link
        href="/painel"
        style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}
      >
        ← Painel
      </Link>

      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
          marginTop: 12,
          paddingBottom: 18,
          borderBottom: '2px solid var(--text)',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <div
            style={{
              fontFamily: 'var(--disp)',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              marginBottom: 6,
            }}
          >
            Base da marca
          </div>
          <h1 style={{ fontFamily: 'var(--disp)', fontSize: 34, fontWeight: 600, lineHeight: 1.08 }}>
            {marca.name as string}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            {(marca.segment as string) ?? 'sem segmento definido'}
            {atualizadaEm &&
              ` · última alteração em ${new Date(atualizadaEm).toLocaleDateString('pt-BR')}`}
          </p>
          <div style={{ marginTop: 10 }}>
            <Cor
              slug={slug}
              inicial={(marca.color as string | null) ?? null}
              podeTrocar={papel === 'admin'}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {cota > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--disp)', fontSize: 28, fontWeight: 600, lineHeight: 1 }}>
                {cota}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>peças por mês</div>
            </div>
          )}
          {podeEditar && (
            <Link
              href={`/painel/marca/${slug}/plano`}
              style={{
                display: 'inline-block',
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--paper)',
                background: 'var(--text)',
                borderRadius: 8,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Planejamento
            </Link>
          )}
        </div>
      </header>

      {(escopo ?? []).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {(escopo ?? []).map((e) => (
            <span
              key={e.label as string}
              style={{
                fontSize: 12.5,
                padding: '4px 11px',
                borderRadius: 99,
                border: '1px solid var(--line-2)',
                background: 'var(--surface)',
                color: 'var(--muted)',
              }}
            >
              {e.label as string}{' '}
              <b style={{ color: 'var(--text)' }}>{Number(e.monthly_quota)}</b>
            </span>
          ))}
        </div>
      )}

      {status.meses > 0 && <Quadro titulo="Status da marca" numeros={numeros} minimo={108} />}

      {proibidas !== 'ok' && (
        <div
          style={{
            marginTop: 18,
            padding: '14px 18px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--warn)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--warn-wash)',
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          <b>As expressões proibidas ainda não estão definidas.</b> É o único
          campo que o sistema vai conferir em código antes de gravar uma pauta.
          Sem ele, a verificação não tem o que verificar.
        </div>
      )}

      {podeEditar && (
        <div
          style={{
            marginTop: 18,
            padding: '15px 18px',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r)',
            background: 'var(--surface)',
            fontSize: 13.5,
            lineHeight: 1.65,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 4,
            }}
          >
            <b>Concorrência</b>
            {varredura && (
              <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>
                varrido em{' '}
                {new Date(varredura.started_at as string).toLocaleDateString('pt-BR')}
                {diasDaVarredura !== null && diasDaVarredura > 45 && ' · já tem mais de mês e meio'}
              </span>
            )}
          </div>

          {varredura ? (
            <div style={{ color: 'var(--muted)' }}>
              {publicacoes ?? 0} publicação(ões) de {lidos.length} perfil(is):{' '}
              {lidos.map((h) => '@' + h).join(', ')}. Isto entra na geração do mês como
              restrição: o que já está ocupado não se repete, e a brecha é onde o mês ganha.
              {recusados.length > 0 && (
                <>
                  {' '}
                  <b style={{ color: 'var(--text)' }}>
                    Não deu para ler {recusados.map((r) => '@' + r.handle).join(', ')}
                  </b>{' '}
                  . Quase sempre é conta pessoal, fechada, ou @ digitado errado.
                </>
              )}
            </div>
          ) : arrobasCitados.length > 0 ? (
            <div style={{ color: 'var(--muted)' }}>
              {arrobasCitados.length} perfil(is) citado(s) no campo Concorrentes, nenhuma
              varredura feita ainda. A geração do mês segue funcionando sem ela.
            </div>
          ) : (
            <div style={{ color: 'var(--muted)' }}>
              Nenhum concorrente com @ no campo <b>Concorrentes</b>, ali embaixo em
              Identidade. Sem o @ não há como consultar o perfil. Escreva assim:
              {' '}Marca X (@marcax).
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 6 }}>
            Para varrer ou atualizar, rode o <b>18-concorrentes.cmd</b> na pasta do projeto.
          </div>
        </div>
      )}

      <Editor slug={slug} iniciais={iniciais} podeEditar={podeEditar} />
    </main>
  )
}
