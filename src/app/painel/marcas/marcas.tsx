'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { conferirMarca, type LinhaDeEscopo } from '@/lib/marca'
import { rotuloDaAcao } from '@/lib/registro-admin'
import {
  arquivarMarca,
  reabrirMarca,
  apagarMarca,
  contarDaMarca,
  salvarEscopo,
} from './acoes'

export type MarcaAdmin = {
  id: string
  nome: string
  slug: string
  segmento: string
  arquivadaEm: string | null
  escopo: { label: string; quota: number }[]
  planejamentos: number
}

export type LinhaDoRegistro = {
  id: number
  quando: string
  quem: string
  acao: string
  marca: string
  detalhe: Record<string, unknown>
}

/** Uma coisa aberta por vez. Duas gavetas abertas viram clique errado. */
type Aberta = { slug: string; modo: 'escopo' | 'arquivar' | 'apagar' } | null

export function Marcas({
  marcas,
  registro,
}: {
  marcas: MarcaAdmin[]
  registro: LinhaDoRegistro[]
}) {
  const router = useRouter()
  const [trabalhando, comecar] = useTransition()
  const [aberta, setAberta] = useState<Aberta>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const ativas = marcas.filter((m) => !m.arquivadaEm)
  const arquivadas = marcas.filter((m) => m.arquivadaEm)

  function abrir(slug: string, modo: 'escopo' | 'arquivar' | 'apagar') {
    setErro(null)
    setAviso(null)
    setAberta((a) => (a && a.slug === slug && a.modo === modo ? null : { slug, modo }))
  }

  /** Toda ação termina igual: fecha a gaveta, mostra o que houve, recarrega. */
  function depois(r: { ok: boolean; erro?: string; aviso?: string }, feito: string) {
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui completar.')
      return
    }
    setErro(null)
    setAviso(r.aviso ?? feito)
    setAberta(null)
    router.refresh()
  }

  return (
    <div>
      {erro && <Caixa cor="accent">{erro}</Caixa>}
      {aviso && <Caixa cor="ok">{aviso}</Caixa>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 26 }}>
        <Link href="/painel/marcas/nova" style={{ ...botao(true), textDecoration: 'none' }}>
          + nova marca
        </Link>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {ativas.length === 1 ? '1 marca ativa' : `${ativas.length} marcas ativas`}
          {arquivadas.length === 0
            ? ''
            : arquivadas.length === 1
              ? ', 1 arquivada'
              : `, ${arquivadas.length} arquivadas`}
        </span>
      </div>

      <Titulo>Marcas ativas</Titulo>

      {ativas.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Nenhuma marca ativa. Crie a primeira em &quot;nova marca&quot;, aqui em cima.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {ativas.map((m) => (
            <Cartao key={m.id}>
              <Cabecalho marca={m} />

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button style={botao(false)} onClick={() => abrir(m.slug, 'escopo')}>
                  {aberta?.slug === m.slug && aberta.modo === 'escopo'
                    ? 'fechar'
                    : 'alterar escopo'}
                </button>
                <button style={botao(false)} onClick={() => abrir(m.slug, 'arquivar')}>
                  arquivar
                </button>
                <Link
                  href={`/painel/marca/${m.slug}`}
                  style={{ ...botao(false), textDecoration: 'none' }}
                >
                  abrir a marca
                </Link>
              </div>

              {aberta?.slug === m.slug && aberta.modo === 'escopo' && (
                <EditorDeEscopo
                  marca={m}
                  trabalhando={trabalhando}
                  onCancelar={() => setAberta(null)}
                  onSalvar={(linhas) =>
                    comecar(async () => {
                      depois(await salvarEscopo(m.slug, linhas), `Escopo de ${m.nome} gravado.`)
                    })
                  }
                />
              )}

              {aberta?.slug === m.slug && aberta.modo === 'arquivar' && (
                <Arquivamento
                  marca={m}
                  trabalhando={trabalhando}
                  onCancelar={() => setAberta(null)}
                  onArquivar={(motivo) =>
                    comecar(async () => {
                      depois(
                        await arquivarMarca(m.slug, motivo),
                        `${m.nome} foi arquivada. O histórico continua inteiro.`,
                      )
                    })
                  }
                />
              )}
            </Cartao>
          ))}
        </div>
      )}

      {arquivadas.length > 0 && (
        <>
          <Titulo>Arquivadas</Titulo>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
            Somem das listas da equipe, param de gerar planejamento e o cliente perde o
            acesso ao portal. Tudo que já foi feito continua gravado.
          </p>

          <div style={{ display: 'grid', gap: 12 }}>
            {arquivadas.map((m) => (
              <Cartao key={m.id} apagada>
                <Cabecalho marca={m} />

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <button
                    style={botao(false, trabalhando)}
                    disabled={trabalhando}
                    onClick={() =>
                      comecar(async () => {
                        depois(await reabrirMarca(m.slug), `${m.nome} voltou para as ativas.`)
                      })
                    }
                  >
                    reabrir
                  </button>
                  <button style={botao(false)} onClick={() => abrir(m.slug, 'apagar')}>
                    apagar de vez
                  </button>
                </div>

                {aberta?.slug === m.slug && aberta.modo === 'apagar' && (
                  <Exclusao
                    marca={m}
                    trabalhando={trabalhando}
                    onCancelar={() => setAberta(null)}
                    onApagar={(confirmacao) =>
                      comecar(async () => {
                        depois(
                          await apagarMarca(m.slug, confirmacao),
                          `${m.nome} foi apagada. O registro guarda quem apagou e quando.`,
                        )
                      })
                    }
                  />
                )}
              </Cartao>
            ))}
          </div>
        </>
      )}

      <Titulo>Registro</Titulo>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
        Quem criou, arquivou, apagou marca ou mexeu no escopo. Não se apaga e não se
        corrige: linha errada fica, e a linha seguinte conta o que aconteceu.
      </p>

      {registro.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Nada registrado ainda. A primeira alteração feita por aqui aparece nesta lista.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            overflow: 'hidden',
          }}
        >
          {registro.map((l, i) => (
            <li
              key={l.id}
              style={{
                padding: '11px 16px',
                borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                fontSize: 13.5,
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                {quando(l.quando)}
              </span>{' '}
              <b>{l.quem}</b> {rotuloDaAcao(l.acao)} <b>{l.marca}</b>
              <Detalhe acao={l.acao} detalhe={l.detalhe} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Cabecalho({ marca }: { marca: MarcaAdmin }) {
  const total = marca.escopo.reduce((s, l) => s + l.quota, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{marca.nome}</span>
        <span style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 12 }}>
          /{marca.slug}
        </span>
        {marca.segmento ? (
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{marca.segmento}</span>
        ) : null}
      </div>

      <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
        {marca.planejamentos === 0
          ? 'nenhum planejamento gerado'
          : marca.planejamentos === 1
            ? '1 planejamento gerado'
            : `${marca.planejamentos} planejamentos gerados`}
        {marca.arquivadaEm ? ` · arquivada em ${quando(marca.arquivadaEm)}` : ''}
      </div>

      {marca.escopo.length > 0 ? (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
          {marca.escopo.map((l) => (
            <span key={l.label} style={pilula}>
              {l.label} <b style={{ color: 'var(--text)' }}>{l.quota}</b>
            </span>
          ))}
          <span style={{ ...pilula, border: 'none', color: 'var(--faint)' }}>
            {total} por mês
          </span>
        </div>
      ) : (
        <div style={{ color: 'var(--laranja)', fontSize: 13, marginTop: 10 }}>
          Sem escopo. O planejamento desta marca não roda enquanto não houver ao menos uma
          linha.
        </div>
      )}
    </div>
  )
}

function EditorDeEscopo({
  marca,
  trabalhando,
  onSalvar,
  onCancelar,
}: {
  marca: MarcaAdmin
  trabalhando: boolean
  onSalvar: (linhas: LinhaDeEscopo[]) => void
  onCancelar: () => void
}) {
  const [linhas, setLinhas] = useState<{ label: string; quota: string }[]>(
    marca.escopo.length > 0
      ? marca.escopo.map((l) => ({ label: l.label, quota: String(l.quota) }))
      : [{ label: '', quota: '' }],
  )

  const limpas: LinhaDeEscopo[] = linhas
    .filter((l) => l.label.trim() !== '' || l.quota.trim() !== '')
    .map((l) => ({ label: l.label.trim(), quota: Number(l.quota) }))

  const problema =
    conferirMarca({ nome: marca.nome, slug: marca.slug, escopo: limpas }).find(
      (p) => p.campo === 'escopo',
    )?.texto ?? null

  const antes = marca.escopo.map((l) => `${l.label}=${l.quota}`).sort().join(', ')
  const agora = limpas.map((l) => `${l.label}=${l.quota}`).sort().join(', ')
  const mudou = antes !== agora

  const saindo = marca.escopo.filter((v) => !limpas.some((l) => l.label === v.label))
  const total = limpas.reduce((s, l) => s + (Number.isFinite(l.quota) ? l.quota : 0), 0)

  function mudar(i: number, campo: 'label' | 'quota', v: string) {
    setLinhas((a) => a.map((l, j) => (i === j ? { ...l, [campo]: v } : l)))
  }

  return (
    <Gaveta>
      <div style={rotuloForte}>Cotas mensais</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
        Quantas publicações de cada tipo por mês. A IA fecha exatamente estes números ao
        gerar, então mexer aqui muda o que o próximo planejamento vai entregar. Os meses já
        gerados ficam como estão.
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {linhas.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              style={{ ...campo, flex: 1 }}
              value={l.label}
              onChange={(e) => mudar(i, 'label', e.target.value)}
              placeholder={i === 0 ? 'Feed' : 'Nome da linha'}
              aria-label={`Nome da linha ${i + 1}`}
            />
            <input
              style={{ ...campo, width: 92 }}
              inputMode="numeric"
              value={l.quota}
              onChange={(e) => mudar(i, 'quota', e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="8"
              aria-label={`Quantidade por mês de ${l.label || 'linha ' + (i + 1)}`}
            />
            <button
              type="button"
              style={botao(false, linhas.length <= 1)}
              disabled={linhas.length <= 1}
              onClick={() => setLinhas((a) => a.filter((_, j) => j !== i))}
              title="Remover esta linha"
            >
              remover
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
        <button
          type="button"
          style={botao(false)}
          onClick={() => setLinhas((a) => [...a, { label: '', quota: '' }])}
        >
          + outra linha
        </button>
        {total > 0 ? (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {total} publicações por mês no total
          </span>
        ) : null}
      </div>

      {problema ? (
        <div style={{ color: 'var(--laranja)', fontSize: 13, marginTop: 10 }}>{problema}</div>
      ) : null}

      {saindo.length > 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
          Sai do escopo: <b>{saindo.map((l) => l.label).join(', ')}</b>. A linha não é
          apagada, só deixa de valer: os meses antigos precisam dela para explicar de onde
          veio cada pauta.
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
        <button
          style={botao(true, !!problema || !mudou || limpas.length === 0 || trabalhando)}
          disabled={!!problema || !mudou || limpas.length === 0 || trabalhando}
          onClick={() => onSalvar(limpas)}
        >
          {trabalhando ? 'Gravando…' : 'Gravar escopo'}
        </button>
        <button style={botao(false)} onClick={onCancelar}>
          cancelar
        </button>
      </div>
    </Gaveta>
  )
}

function Arquivamento({
  marca,
  trabalhando,
  onArquivar,
  onCancelar,
}: {
  marca: MarcaAdmin
  trabalhando: boolean
  onArquivar: (motivo: string) => void
  onCancelar: () => void
}) {
  const [motivo, setMotivo] = useState('')

  return (
    <Gaveta>
      <div style={rotuloForte}>Arquivar {marca.nome}</div>
      <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.65 }}>
        É o que se faz quando o contrato acaba. A marca some das listas da equipe, para de
        gerar planejamento e o cliente perde o acesso ao portal. Nada é apagado, e dá para
        reabrir a qualquer momento.
      </div>

      <div style={{ marginTop: 12 }}>
        <label htmlFor={`motivo-${marca.slug}`} style={rotuloForte}>
          Motivo (fica no registro)
        </label>
        <input
          id={`motivo-${marca.slug}`}
          style={campo}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Contrato encerrado em setembro"
        />
      </div>

      <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
        <button
          style={botao(true, trabalhando)}
          disabled={trabalhando}
          onClick={() => onArquivar(motivo)}
        >
          {trabalhando ? 'Arquivando…' : 'Arquivar'}
        </button>
        <button style={botao(false)} onClick={onCancelar}>
          cancelar
        </button>
      </div>
    </Gaveta>
  )
}

/**
 * Apagar, com o tamanho do estrago na frente.
 *
 * O primeiro clique não apaga nada: vai ao banco contar o que está
 * pendurado na marca e mostra. "Tem certeza?" sozinho não informa
 * nada; "4 planejamentos e 212 pautas" informa.
 */
function Exclusao({
  marca,
  trabalhando,
  onApagar,
  onCancelar,
}: {
  marca: MarcaAdmin
  trabalhando: boolean
  onApagar: (confirmacao: string) => void
  onCancelar: () => void
}) {
  const [contas, setContas] = useState<Record<string, number> | null>(null)
  const [erroConta, setErroConta] = useState<string | null>(null)
  const [digitado, setDigitado] = useState('')

  useEffect(() => {
    let vivo = true
    contarDaMarca(marca.slug).then((r) => {
      if (!vivo) return
      if (r.ok) setContas(r.contas ?? {})
      else setErroConta(r.erro ?? 'Não consegui contar o que existe nesta marca.')
    })
    return () => {
      vivo = false
    }
  }, [marca.slug])

  const contando = contas === null && erroConta === null

  const NOMES: Record<string, string> = {
    planejamentos: 'planejamentos',
    pautas: 'pautas com o conteúdo escrito',
    pessoas: 'vínculos de pessoas',
    jobs: 'jobs copiados do Operand',
  }

  return (
    <Gaveta cor="laranja">
      <div style={rotuloForte}>Apagar {marca.nome} para sempre</div>

      {contando ? (
        <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6 }}>
          Contando o que existe nesta marca…
        </div>
      ) : erroConta ? (
        <div style={{ fontSize: 13.5, color: 'var(--laranja)', marginTop: 6 }}>{erroConta}</div>
      ) : (
        <div style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.7 }}>
          Vão embora junto, sem volta:
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            {Object.entries(contas ?? {}).map(([k, n]) => (
              <li key={k}>
                <b>{n}</b> {NOMES[k] ?? k}
              </li>
            ))}
          </ul>
          <div style={{ color: 'var(--muted)', marginTop: 8 }}>
            O backup é diário, então desfazer isto pode custar um dia de trabalho de todo
            mundo. Se a ideia é só encerrar o contrato, deixe arquivada: o histórico fica
            inteiro e não atrapalha ninguém.
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <label htmlFor={`confirma-${marca.slug}`} style={rotuloForte}>
          Para confirmar, digite{' '}
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--laranja)' }}>{marca.slug}</span>
        </label>
        <input
          id={`confirma-${marca.slug}`}
          style={{ ...campo, fontFamily: 'var(--mono)' }}
          value={digitado}
          onChange={(e) => setDigitado(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
        <button
          style={botao(true, digitado.trim() !== marca.slug || trabalhando)}
          disabled={digitado.trim() !== marca.slug || trabalhando}
          onClick={() => onApagar(digitado)}
        >
          {trabalhando ? 'Apagando…' : 'Apagar para sempre'}
        </button>
        <button style={botao(false)} onClick={onCancelar}>
          cancelar
        </button>
      </div>
    </Gaveta>
  )
}

/** "1 pessoa" e não "1 pessoas". O registro é lido por gente. */
function umOuVarios(chave: string, n: number): string {
  const NOMES: Record<string, [string, string]> = {
    planejamentos: ['planejamento', 'planejamentos'],
    pautas: ['pauta', 'pautas'],
    pessoas: ['pessoa vinculada', 'pessoas vinculadas'],
    jobs: ['job do Operand', 'jobs do Operand'],
  }
  const par = NOMES[chave]
  if (!par) return chave
  return n === 1 ? par[0] : par[1]
}

function Detalhe({ acao, detalhe }: { acao: string; detalhe: Record<string, unknown> }) {
  if (acao === 'escopo_alterado') {
    const antes = String(detalhe.antes ?? '')
    const depois = String(detalhe.depois ?? '')
    return (
      <div style={{ color: 'var(--muted)', fontSize: 12.8, marginTop: 3 }}>
        de <span style={{ fontFamily: 'var(--mono)' }}>{antes || 'nada'}</span> para{' '}
        <span style={{ fontFamily: 'var(--mono)' }}>{depois || 'nada'}</span>
      </div>
    )
  }

  if (acao === 'marca_arquivada' && detalhe.motivo) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: 12.8, marginTop: 3 }}>
        motivo: {String(detalhe.motivo)}
      </div>
    )
  }

  if (acao === 'marca_apagada') {
    const contas = (detalhe.contas ?? {}) as Record<string, number>
    const texto = Object.entries(contas)
      .filter(([, n]) => Number(n) > 0)
      .map(([k, n]) => `${n} ${umOuVarios(k, Number(n))}`)
      .join(', ')
    return (
      <div style={{ color: 'var(--muted)', fontSize: 12.8, marginTop: 3 }}>
        levou junto: {texto || 'nada pendurado'}
      </div>
    )
  }

  return null
}

/* ------------------------------------------------------------------ */

function quando(iso: string): string {
  // Fuso fixo de propósito: a agência é uma só, e a data de um registro
  // não pode mudar conforme de onde a pessoa abre a tela.
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: 'var(--disp)',
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '.16em',
        textTransform: 'uppercase',
        color: 'var(--faint)',
        margin: '34px 0 12px',
      }}
    >
      {children}
    </h2>
  )
}

function Cartao({ children, apagada }: { children: React.ReactNode; apagada?: boolean }) {
  return (
    <section
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        background: apagada ? 'var(--surface-2)' : 'var(--surface)',
        padding: '16px 18px',
      }}
    >
      {children}
    </section>
  )
}

function Gaveta({
  children,
  cor = 'accent',
}: {
  children: React.ReactNode
  cor?: 'accent' | 'laranja'
}) {
  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 14,
        borderTop: `2px solid var(--${cor})`,
        // Campo de texto que atravessa a tela inteira é desconfortável
        // de ler e de mirar. A mesma largura do formulário de marca nova.
        maxWidth: 620,
      }}
    >
      {children}
    </div>
  )
}

function Caixa({ cor, children }: { cor: 'warn' | 'accent' | 'ok'; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: '13px 17px',
        border: '1px solid var(--line)',
        borderLeft: `3px solid var(--${cor})`,
        borderRadius: '0 var(--r) var(--r) 0',
        background: `var(--${cor}-wash)`,
        fontSize: 13.5,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  )
}

const pilula: React.CSSProperties = {
  fontSize: 12.5,
  padding: '4px 11px',
  borderRadius: 99,
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--muted)',
}

// Os mesmos estilos da tela de pessoas. O projeto não tem classe de
// botão nem de campo no CSS: o padrão é objeto de estilo no arquivo da
// tela, e inventar uma classe nova aqui criaria dois padrões.
const rotuloForte: React.CSSProperties = {
  display: 'block',
  fontWeight: 700,
  fontSize: 13,
  marginBottom: 5,
}

const campo: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  fontFamily: 'inherit',
  fontSize: 14,
  color: 'var(--text)',
  background: 'var(--surface)',
  border: '1px solid var(--line-2)',
  borderRadius: 8,
  outline: 'none',
}

function botao(forte: boolean, desligado = false): React.CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 13.5,
    fontWeight: forte ? 700 : 600,
    padding: '9px 17px',
    border: forte ? 'none' : '1px solid var(--line-2)',
    borderRadius: 8,
    background: forte ? 'var(--text)' : 'var(--surface)',
    color: forte ? 'var(--paper)' : 'var(--text)',
    cursor: desligado ? 'not-allowed' : 'pointer',
    opacity: desligado ? 0.45 : 1,
  }
}
