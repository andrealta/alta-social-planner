import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { MESES, mesTitulado } from '@/lib/prompt'

type Achado = { gravidade: 'erro' | 'aviso'; texto: string }
type Territorio = { nome: string; peso: number; cobre?: string; posts?: number; novo?: boolean }

const SITUACAO: Record<string, string> = {
  draft: 'rascunho',
  generating: 'gerando…',
  internal_review: 'em revisão interna',
  sent_to_client: 'com o cliente',
  approved: 'aprovado',
  archived: 'arquivado',
}

export default async function Plano({
  params,
}: {
  params: Promise<{ slug: string; ano: string; mes: string }>
}) {
  const { slug, ano: anoTexto, mes: mesTexto } = await params
  const ano = Number(anoTexto)
  const mes = Number(mesTexto)
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) notFound()

  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: marca } = await supabase
    .from('brands')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()
  if (!marca) notFound()

  const { data: plano } = await supabase
    .from('plans')
    .select('id, status, briefing, analysis, created_at')
    .eq('brand_id', marca.id)
    .eq('year', ano)
    .eq('month', mes)
    .maybeSingle()
  if (!plano) notFound()

  const [{ data: pautas }, { data: canais }, { data: linhas }] = await Promise.all([
    supabase
      .from('content_ideas')
      .select('id, title, theme, concept, description, editorial_line, objective, rationale, cta, scope_id, status, position')
      .eq('plan_id', plano.id)
      .order('position'),
    supabase
      .from('content_channels')
      .select('idea_id, platform, format, scheduled_date')
      .eq('brand_id', marca.id),
    supabase.from('brand_scope').select('id, label').eq('brand_id', marca.id),
  ])

  const nomeDaLinha = new Map((linhas ?? []).map((l) => [l.id as string, l.label as string]))
  type Canal = { platform?: string; format?: string; scheduled_date?: string }
  const canalDaPauta = new Map<string, Canal>(
    (canais ?? []).map((c): [string, Canal] => [
      c.idea_id as string,
      {
        platform: c.platform as string | undefined,
        format: c.format as string | undefined,
        scheduled_date: c.scheduled_date as string | undefined,
      },
    ]),
  )

  const analise = (plano.analysis ?? {}) as {
    leitura?: string
    territorios?: Territorio[]
    nao_fazer?: string[]
    alertas?: string[]
    achados?: Achado[]
    modelo?: string
  }

  const ordenadas = [...(pautas ?? [])].sort((a, b) => {
    const da = String(canalDaPauta.get(a.id as string)?.scheduled_date ?? '9999')
    const db = String(canalDaPauta.get(b.id as string)?.scheduled_date ?? '9999')
    return da < db ? -1 : da > db ? 1 : 0
  })

  const erros = (analise.achados ?? []).filter((a) => a.gravidade === 'erro')
  const avisos = (analise.achados ?? []).filter((a) => a.gravidade === 'aviso')

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 70px' }}>
      <Link
        href={`/painel/marca/${slug}/plano`}
        style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}
      >
        ← Planejamento
      </Link>

      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 14,
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
            {marca.name as string}
          </div>
          <h1
            style={{
              fontFamily: 'var(--disp)',
              fontSize: 34,
              fontWeight: 600,
              lineHeight: 1.08,
            }}
          >
            {mesTitulado(mes)} de {ano}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            {ordenadas.length} pautas · {SITUACAO[plano.status as string] ?? plano.status}
          </p>
        </div>
      </header>

      {analise.leitura && (
        <section
          style={{
            marginTop: 22,
            padding: '20px 22px',
            border: '1px solid var(--line)',
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
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              color: 'var(--faint)',
              marginBottom: 8,
            }}
          >
            A tensão do mês
          </div>
          <p style={{ fontSize: 15.5, lineHeight: 1.65 }}>{analise.leitura}</p>
        </section>
      )}

      {(erros.length > 0 || avisos.length > 0) && (
        <section
          style={{
            marginTop: 16,
            padding: '15px 18px',
            border: '1px solid var(--line)',
            borderLeft: `3px solid var(--${erros.length > 0 ? 'accent' : 'warn'})`,
            borderRadius: '0 var(--r) var(--r) 0',
            background: `var(--${erros.length > 0 ? 'accent' : 'warn'}-wash)`,
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          <b style={{ display: 'block', marginBottom: 5 }}>
            Conferência automática{erros.length > 0 ? ' — com problema' : ''}
          </b>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {[...erros, ...avisos].map((a, i) => (
              <li key={i}>{a.texto}</li>
            ))}
          </ul>
        </section>
      )}

      {(analise.territorios ?? []).length > 0 && (
        <section style={{ marginTop: 24 }}>
          <Rotulo>Territórios</Rotulo>
          <div style={{ display: 'grid', gap: 10 }}>
            {(analise.territorios ?? []).map((t) => (
              <div key={t.nome}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 10,
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {t.nome}
                    {t.novo && (
                      <span style={{ color: 'var(--accent)', fontSize: 11, marginLeft: 6, fontWeight: 700 }}>
                        NOVO
                      </span>
                    )}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {t.peso}% · {t.posts ?? 0} posts
                  </span>
                </div>
                <div
                  style={{
                    height: 5,
                    borderRadius: 99,
                    background: 'var(--surface-3)',
                    overflow: 'hidden',
                    marginTop: 4,
                  }}
                >
                  <div style={{ width: `${Math.min(100, t.peso)}%`, height: '100%', background: 'var(--ok)' }} />
                </div>
                {t.cobre && (
                  <p style={{ color: 'var(--muted)', fontSize: 12.6, marginTop: 4 }}>{t.cobre}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <Link
          href={`/painel/marca/${slug}/calendario/${ano}/${mes}`}
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
          Abrir o calendário e revisar
        </Link>
      </section>

      <section style={{ marginTop: 28 }}>
        <Rotulo>As pautas</Rotulo>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {ordenadas.map((p) => {
            const canal = canalDaPauta.get(p.id as string)
            const data = canal?.scheduled_date
            const dia = data ? Number(data.slice(8, 10)) : null
            return (
              <li
                key={p.id as string}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 1fr',
                  gap: 14,
                  padding: '16px 18px',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r-lg)',
                  background: 'var(--surface)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 600, lineHeight: 1 }}>
                    {dia ?? '—'}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    {MESES[mes - 1].slice(0, 3)}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 5 }}>
                    {p.scope_id && <Etiqueta>{nomeDaLinha.get(p.scope_id as string) ?? '—'}</Etiqueta>}
                    {canal?.format ? <Etiqueta>{canal.format}</Etiqueta> : null}
                    {p.editorial_line ? <Etiqueta>{p.editorial_line as string}</Etiqueta> : null}
                  </div>

                  <h3 style={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.3 }}>{p.title as string}</h3>

                  {p.concept ? (
                    <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 4, lineHeight: 1.55 }}>
                      {p.concept as string}
                    </p>
                  ) : null}

                  {p.description ? (
                    <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 7, lineHeight: 1.6 }}>
                      {p.description as string}
                    </p>
                  ) : null}

                  {p.cta ? (
                    <p style={{ fontSize: 13, marginTop: 7 }}>
                      <b>CTA:</b> {p.cta as string}
                    </p>
                  ) : null}

                  {p.rationale ? (
                    <p
                      style={{
                        fontSize: 12.8,
                        color: 'var(--muted)',
                        marginTop: 9,
                        paddingTop: 9,
                        borderTop: '1px solid var(--line)',
                        lineHeight: 1.55,
                      }}
                    >
                      {p.rationale as string}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {(analise.nao_fazer ?? []).length > 0 && (
        <section style={{ marginTop: 28 }}>
          <Rotulo>O que decidimos não fazer</Rotulo>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.8, lineHeight: 1.7, color: 'var(--muted)' }}>
            {(analise.nao_fazer ?? []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </section>
      )}

      {(analise.alertas ?? []).length > 0 && (
        <section style={{ marginTop: 24 }}>
          <Rotulo>Lacunas da base que limitaram o resultado</Rotulo>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.8, lineHeight: 1.7, color: 'var(--muted)' }}>
            {(analise.alertas ?? []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </section>
      )}

      {plano.briefing ? (
        <section style={{ marginTop: 24 }}>
          <Rotulo>Obrigatoriedades informadas</Rotulo>
          <p style={{ fontSize: 13.8, color: 'var(--muted)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {plano.briefing as string}
          </p>
        </section>
      ) : null}
    </main>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: 'var(--disp)',
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '.16em',
        textTransform: 'uppercase',
        color: 'var(--faint)',
        marginBottom: 12,
      }}
    >
      {children}
    </h2>
  )
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 9px',
        borderRadius: 99,
        background: 'var(--surface-3)',
        color: 'var(--muted)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}
