import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { mesTitulado } from '@/lib/prompt'
import { DIAS_CURTOS, ICONE_PECA, semanasDoMes, tipoDaPeca } from '@/lib/visual'
import { ESTADO } from '@/app/painel/marca/[slug]/calendario/[ano]/[mes]/comum'

/**
 * A agenda de todas as marcas juntas.
 *
 * O calendário de cada marca responde "o que esta marca publica". Esta
 * tela responde a pergunta da produção: "o que sai em cada dia, de
 * todo mundo". É onde aparece a semana em que três marcas publicam
 * vídeo no mesmo dia.
 *
 * Só leitura. Mover data continua no calendário da marca, onde está a
 * trava de quem pode editar; cada publicação aqui é um atalho para lá.
 *
 * Sem filtro por marca no código além do que a pessoa escolhe: o banco
 * devolve só as marcas que ela alcança.
 */

type Busca = { mes?: string; marca?: string }

function hojeEmSaoPaulo(): string {
  // en-CA formata como AAAA-MM-DD.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function lerMes(texto: string | undefined, hoje: string): { ano: number; mes: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(texto ?? '')
  if (m) {
    const ano = Number(m[1])
    const mes = Number(m[2])
    if (mes >= 1 && mes <= 12 && ano >= 2020 && ano <= 2100) return { ano, mes }
  }
  return { ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) }
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')

function vizinho(ano: number, mes: number, passo: number): string {
  const d = new Date(ano, mes - 1 + passo, 1)
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}`
}

export default async function Agenda({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if ((perfil?.role ?? 'client') === 'client') redirect('/cliente')

  const hoje = hojeEmSaoPaulo()
  const { ano, mes } = lerMes(busca.mes, hoje)
  const chaveMes = `${ano}-${doisDigitos(mes)}`
  const inicio = `${chaveMes}-01`
  const fim = `${chaveMes}-${doisDigitos(new Date(ano, mes, 0).getDate())}`

  const { data: marcas } = await supabase.from('brands').select('id, name, slug, color').order('name')
  const filtro = (marcas ?? []).find((m) => m.slug === busca.marca) ?? null

  let consultaCanais = supabase
    .from('content_channels')
    .select('idea_id, brand_id, format, scheduled_date')
    .gte('scheduled_date', inicio)
    .lte('scheduled_date', fim)
  if (filtro) consultaCanais = consultaCanais.eq('brand_id', filtro.id as string)
  const { data: canais } = await consultaCanais

  const idsPauta = [...new Set((canais ?? []).map((c) => c.idea_id as string))]
  const { data: pautas } = idsPauta.length
    ? await supabase.from('content_ideas').select('id, title, status, plan_id').in('id', idsPauta)
    : { data: [] }
  const idsPlano = [...new Set((pautas ?? []).map((p) => p.plan_id as string))]
  const { data: planos } = idsPlano.length
    ? await supabase.from('plans').select('id, month, year').in('id', idsPlano)
    : { data: [] }

  const marcaPorId = new Map<string, Record<string, unknown>>((marcas ?? []).map((m) => [m.id as string, m]))
  const pautaPorId = new Map<string, Record<string, unknown>>((pautas ?? []).map((p) => [p.id as string, p]))
  const planoPorId = new Map<string, Record<string, unknown>>((planos ?? []).map((p) => [p.id as string, p]))

  type Publicacao = {
    chave: string
    pautaId: string
    titulo: string
    status: string
    formato: string | null
    marca: { name: string; slug: string; color: string | null }
    link: string
  }

  // Uma pauta pode ter mais de um canal no mesmo dia (Instagram e
  // Facebook, por exemplo). Na agenda ela aparece uma vez por dia.
  const porDia = new Map<string, Publicacao[]>()
  const vistas = new Set<string>()
  for (const c of canais ?? []) {
    const data = String(c.scheduled_date).slice(0, 10)
    const pauta = pautaPorId.get(c.idea_id as string)
    const marca = marcaPorId.get(c.brand_id as string)
    if (!pauta || !marca) continue
    const chave = `${data}:${pauta.id}`
    if (vistas.has(chave)) continue
    vistas.add(chave)
    const plano = planoPorId.get(pauta.plan_id as string)
    const link = plano
      ? `/painel/marca/${marca.slug}/calendario/${plano.year}/${plano.month}?pauta=${pauta.id}`
      : `/painel/marca/${marca.slug}`
    const lista = porDia.get(data) ?? []
    lista.push({
      chave,
      pautaId: pauta.id as string,
      titulo: (pauta.title as string) ?? '',
      status: (pauta.status as string) ?? '',
      formato: (c.format as string | null) ?? null,
      marca: {
        name: marca.name as string,
        slug: marca.slug as string,
        color: (marca.color as string | null) ?? null,
      },
      link,
    })
    porDia.set(data, lista)
  }
  for (const lista of porDia.values()) {
    lista.sort((a, b) => a.marca.name.localeCompare(b.marca.name) || a.titulo.localeCompare(b.titulo))
  }

  const total = [...porDia.values()].reduce((s, l) => s + l.length, 0)
  const marcasNoMes = new Set([...porDia.values()].flat().map((p) => p.marca.slug)).size
  const maisCheio = [...porDia.entries()].sort((a, b) => b[1].length - a[1].length)[0]
  const semanas = semanasDoMes(ano, mes)

  const url = (m: string, marca: string | null) =>
    `/painel/agenda?mes=${m}${marca ? `&marca=${marca}` : ''}`
  const marcaAtual = filtro ? (filtro.slug as string) : null

  const botaoNav = {
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 12px',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    background: 'var(--surface)',
    color: 'var(--text)',
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  }

  return (
    <main className="pagina-equipe">
      <Link href="/painel" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
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
        <div style={{ flex: 1, minWidth: 220 }}>
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
            Agenda de todas as marcas
          </div>
          <h1 style={{ fontFamily: 'var(--disp)', fontSize: 32, fontWeight: 600, lineHeight: 1.1 }}>
            {mesTitulado(mes)} de {ano}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            {total === 0
              ? 'Nenhuma publicação marcada neste mês.'
              : `${total} ${total === 1 ? 'publicação' : 'publicações'}` +
                (filtro ? '' : ` de ${marcasNoMes} ${marcasNoMes === 1 ? 'marca' : 'marcas'}`) +
                (maisCheio && maisCheio[1].length > 1
                  ? ` · dia mais cheio: dia ${Number(maisCheio[0].slice(8, 10))} (${maisCheio[1].length} publicações)`
                  : '')}
          </p>
        </div>
        <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={url(vizinho(ano, mes, -1), marcaAtual)} style={botaoNav} aria-label="Mês anterior">
            ‹ {mesTitulado(Number(vizinho(ano, mes, -1).slice(5, 7)))}
          </Link>
          <Link href={url(hoje.slice(0, 7), marcaAtual)} style={botaoNav}>
            Hoje
          </Link>
          <Link href={url(vizinho(ano, mes, 1), marcaAtual)} style={botaoNav} aria-label="Próximo mês">
            {mesTitulado(Number(vizinho(ano, mes, 1).slice(5, 7)))} ›
          </Link>
        </nav>
      </header>

      {/* Filtro por marca: links, não estado na tela. Dá para mandar o
          endereço para alguém e ela abre na mesma visão. */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '16px 0 18px' }}>
        {[{ slug: null as string | null, name: 'Todas as marcas', color: null as string | null }]
          .concat(
            (marcas ?? []).map((m) => ({
              slug: m.slug as string,
              name: m.name as string,
              color: (m.color as string | null) ?? null,
            })),
          )
          .map((m) => {
            const ativo = m.slug === marcaAtual
            return (
              <Link
                key={m.slug ?? 'todas'}
                href={url(chaveMes, m.slug)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: 99,
                  border: ativo ? '1px solid var(--text)' : '1px solid var(--line-2)',
                  background: ativo ? 'var(--text)' : 'var(--surface)',
                  color: ativo ? 'var(--paper)' : 'var(--text)',
                  textDecoration: 'none',
                }}
              >
                {m.slug && (
                  <span
                    aria-hidden
                    style={{ width: 8, height: 8, borderRadius: 99, background: m.color ?? 'var(--accent)' }}
                  />
                )}
                {m.name}
              </Link>
            )
          })}
      </div>

      <div className="grade-mes">
        {DIAS_CURTOS.map((d) => (
          <div
            key={d}
            className="cab-semana"
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--faint)',
              textAlign: 'center',
              paddingBottom: 3,
            }}
          >
            {d}
          </div>
        ))}

        {semanas.flat().map((dia, i) => {
          if (dia === null) return <div key={`v${i}`} className="dia-vazio" />
          const data = `${chaveMes}-${doisDigitos(dia)}`
          const doDia = porDia.get(data) ?? []
          const ehHoje = data === hoje
          const fds = i % 7 === 0 || i % 7 === 6
          return (
            <div
              key={data}
              className={doDia.length ? 'dia-cheio' : 'dia-vazio'}
              style={{
                // Sem isto, título comprido estica a coluna e a grade
                // passa da largura da tela.
                minWidth: 0,
                minHeight: 110,
                padding: 9,
                borderRadius: 'var(--r)',
                background: 'var(--surface)',
                boxShadow: ehHoje ? 'inset 0 0 0 2px var(--accent)' : fds ? 'none' : 'var(--shadow)',
                opacity: fds && !doDia.length ? 0.72 : 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: ehHoje ? 'var(--accent)' : 'var(--faint)',
                  marginBottom: 5,
                }}
              >
                <span>
                  <span className="so-celular">{DIAS_CURTOS[i % 7]} · </span>
                  {dia}
                  {ehHoje && ' · hoje'}
                </span>
                {doDia.length > 1 && (
                  <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{doDia.length} posts</span>
                )}
              </div>

              {doDia.map((p) => {
                const e = ESTADO[p.status] ?? ESTADO.ai_generated
                const tipo = tipoDaPeca(p.formato)
                return (
                  <Link
                    key={p.chave}
                    href={p.link}
                    title={`${p.marca.name}: ${p.titulo}\n${tipo} · ${e.rotulo}`}
                    style={{
                      display: 'block',
                      marginBottom: 5,
                      padding: '7px 9px 7px 10px',
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--surface-2)',
                      borderLeft: `3px solid ${p.marca.color ?? 'var(--accent)'}`,
                      fontSize: 11.5,
                      lineHeight: 1.35,
                      color: 'inherit',
                      textDecoration: 'none',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.marca.name}
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {p.titulo}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        marginTop: 3,
                        fontSize: 10,
                        color: 'var(--muted)',
                        minWidth: 0,
                      }}
                    >
                      <span aria-hidden title={tipo}>
                        {ICONE_PECA[tipo]}
                      </span>
                      <span
                        aria-hidden
                        style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: e.cor }}
                      />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.curto}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--faint)', marginTop: 16, lineHeight: 1.6 }}>
        A cor da borda é a da marca; o ponto mostra a situação da pauta. Para mudar uma data,
        abra a publicação: ela leva ao calendário da marca.
      </p>
    </main>
  )
}
