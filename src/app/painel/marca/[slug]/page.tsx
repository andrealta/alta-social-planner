import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { SECOES, situacao } from '@/lib/base'
import { Editor } from './editor'
import { Cor } from './cor'

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
  const podeEditar = papel === 'admin' || papel === 'staff'

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

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px 60px' }}>
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

      <Editor slug={slug} iniciais={iniciais} podeEditar={podeEditar} />
    </main>
  )
}
