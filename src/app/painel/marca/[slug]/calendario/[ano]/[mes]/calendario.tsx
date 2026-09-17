'use client'

import { useMemo, useState, useTransition } from 'react'
import { moverPauta, mudarStatus, aprovarTodas, enviarAoCliente } from './acoes'
import { Painel } from './painel'
import {
  ESTADO,
  ICONE_PECA,
  SITUACOES,
  botao,
  corDaLinha,
  tipoDaPeca,
  type ConteudoPauta,
  type Editaveis,
  type Pauta,
} from './comum'

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function Calendario({
  slug,
  planoId,
  ano,
  mes,
  pautas: iniciais,
  nivel,
}: {
  slug: string
  planoId: string
  ano: number
  mes: number
  pautas: Pauta[]
  /** 'owner' responde pela marca · 'editor' escreve · 'viewer' só lê. */
  nivel: string
}) {
  // Esconder botão não é segurança: quem tem a sessão aberta consegue
  // montar a requisição na mão. A trava de verdade está no banco. Isto
  // aqui existe para a pessoa não clicar no que vai ser recusado.
  const podeEditar = nivel === 'owner' || nivel === 'editor'
  const podeEnviar = nivel === 'owner'

  const [pautas, setPautas] = useState(iniciais)
  const [aberta, setAberta] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [pendente, comecar] = useTransition()

  const diasNoMes = new Date(ano, mes, 0).getDate()
  const primeiroDia = new Date(ano, mes - 1, 1).getDay()

  const porDia = useMemo(() => {
    const m = new Map<string, Pauta[]>()
    for (const p of pautas) {
      if (!p.data) continue
      const lista = m.get(p.data) ?? []
      lista.push(p)
      m.set(p.data, lista)
    }
    return m
  }, [pautas])

  const semData = pautas.filter((p) => !p.data)
  const pautaAberta = pautas.find((p) => p.id === aberta) ?? null

  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of pautas) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [pautas])

  const comConteudo = pautas.filter((p) => p.conteudo).length

  function atualizar(id: string, mudanca: Partial<Pauta>) {
    setPautas((lista) => lista.map((p) => (p.id === id ? { ...p, ...mudanca } : p)))
  }

  function soltar(data: string) {
    if (!podeEditar) return
    const id = arrastando
    setArrastando(null)
    setAlvo(null)
    if (!id) return

    const antes = pautas
    const pauta = pautas.find((p) => p.id === id)
    if (!pauta || pauta.data === data) return

    // Move na tela antes de o servidor responder. Arrastar precisa ser
    // instantâneo; se o servidor recusar, a gente desfaz.
    atualizar(id, { data })

    comecar(async () => {
      const r = await moverPauta(slug, id, data, ano, mes)
      if (!r.ok) {
        setPautas(antes)
        setAviso({ tipo: 'erro', texto: r.erro ?? 'Não consegui mover.' })
      }
    })
  }

  function trocarEstado(p: Pauta, para: string) {
    const antes = pautas
    atualizar(p.id, { status: para })
    comecar(async () => {
      const r = await mudarStatus(slug, p.id, p.status, para, ano, mes)
      if (!r.ok) {
        setPautas(antes)
        setAviso({ tipo: 'erro', texto: r.erro ?? 'Não consegui mudar o estado.' })
      }
    })
  }

  function aprovarPendentes() {
    const antes = pautas
    setPautas((lista) =>
      lista.map((p) =>
        p.status === 'ai_generated' || p.status === 'internal_review'
          ? { ...p, status: 'internally_approved' }
          : p,
      ),
    )
    comecar(async () => {
      const r = await aprovarTodas(slug, planoId, ano, mes)
      if (!r.ok) {
        setPautas(antes)
        setAviso({ tipo: 'erro', texto: r.erro ?? 'Não consegui aprovar.' })
      } else {
        setAviso({ tipo: 'ok', texto: `${r.quantas} pauta(s) aprovadas.` })
      }
    })
  }

  function enviar() {
    const pendentes = pautas.filter(
      (p) => !['internally_approved', 'sent_to_client', 'client_approved'].includes(p.status),
    ).length
    if (pendentes > 0) {
      setAviso({
        tipo: 'erro',
        texto: `${pendentes} pauta(s) ainda não foram aprovadas. Aprove todas antes de enviar ao cliente.`,
      })
      return
    }
    comecar(async () => {
      const r = await enviarAoCliente(slug, planoId, ano, mes)
      if (!r.ok) {
        setAviso({ tipo: 'erro', texto: r.erro ?? 'Não consegui enviar.' })
      } else {
        setPautas((lista) =>
          lista.map((p) =>
            p.status === 'internally_approved' ? { ...p, status: 'sent_to_client' } : p,
          ),
        )
        setAviso({
          tipo: 'ok',
          texto:
            r.enviadas === 0
              ? 'O mês já estava com o cliente. Nada novo a enviar.'
              : `${r.enviadas} pauta(s) enviadas. O cliente já consegue ver e responder.`,
        })
      }
    })
  }

  const emAvaliacao = (contagem['ai_generated'] ?? 0) + (contagem['internal_review'] ?? 0)
  const aprovadas =
    (contagem['internally_approved'] ?? 0) +
    (contagem['sent_to_client'] ?? 0) +
    (contagem['client_approved'] ?? 0)
  const pct = pautas.length ? Math.round((aprovadas / pautas.length) * 100) : 0
  const prontasParaEnviar = contagem['internally_approved'] ?? 0
  const pedidosDoCliente = contagem['client_changes_requested'] ?? 0

  // Só as linhas que este mês usa entram na legenda: legenda que
  // explica cor que não está na tela é ruído.
  const linhasUsadas: [string, number | null][] = [
    ...new Map<string, number | null>(
      pautas
        .filter((p) => p.linha)
        .map((p): [string, number | null] => [p.linha as string, p.linhaIndice]),
    ),
  ]
  const situacoesUsadas = SITUACOES.filter((st) => pautas.some((p) => p.status === st))

  const semanas: (number | null)[][] = []
  {
    let semana: (number | null)[] = Array(primeiroDia).fill(null)
    for (let d = 1; d <= diasNoMes; d++) {
      semana.push(d)
      if (semana.length === 7) {
        semanas.push(semana)
        semana = []
      }
    }
    if (semana.length > 0) {
      while (semana.length < 7) semana.push(null)
      semanas.push(semana)
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '13px 18px',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow)',
          marginBottom: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 6 }}>
            <b style={{ color: 'var(--text)' }}>
              {aprovadas} de {pautas.length} aprovadas
            </b>
            {comConteudo > 0 && ` · ${comConteudo} com conteúdo escrito`}
            {pendente && ' · salvando…'}
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 99,
              background: 'var(--surface-3)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: 'var(--st-aprovado)',
                transition: 'width .25s ease',
              }}
            />
          </div>
        </div>
        {emAvaliacao > 0 && podeEditar && (
          <button onClick={aprovarPendentes} disabled={pendente} style={botao(true)}>
            Aprovar as {emAvaliacao} pendentes
          </button>
        )}
        {prontasParaEnviar > 0 && podeEnviar && (
          <button
            onClick={enviar}
            disabled={pendente}
            style={{ ...botao(true), background: 'var(--st-cliente)', color: '#fff' }}
          >
            Enviar ao cliente ({prontasParaEnviar})
          </button>
        )}
      </div>

      {!podeEditar && (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 16px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--line-2)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--surface-2)',
            fontSize: 13.3,
            lineHeight: 1.6,
            color: 'var(--muted)',
          }}
        >
          <b style={{ color: 'var(--text)' }}>Você acompanha esta marca.</b> Dá para abrir
          tudo e ler o histórico; alterar pauta, aprovar e enviar ao cliente são de quem
          edita. Se precisar mexer, peça à administração para mudar o seu nível.
        </div>
      )}

      {prontasParaEnviar > 0 && podeEditar && !podeEnviar && (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 16px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--st-cliente)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--surface-2)',
            fontSize: 13.3,
            lineHeight: 1.6,
          }}
        >
          <b>{prontasParaEnviar} pauta(s) prontas para o cliente.</b> Quem envia é a pessoa
          responsável pela marca — avise que este mês está pronto.
        </div>
      )}

      {pedidosDoCliente > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: '13px 17px',
            border: '1px solid var(--line)',
            borderLeft: '3px solid var(--st-ajuste)',
            borderRadius: '0 var(--r) var(--r) 0',
            background: 'var(--accent-wash)',
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          <b>
            O cliente pediu alteração em {pedidosDoCliente}{' '}
            {pedidosDoCliente === 1 ? 'pauta' : 'pautas'}.
          </b>{' '}
          Abra cada uma para ler o pedido, ajuste, aprove de novo e envie outra vez. Só
          volta ao cliente o que você reenviar.
        </div>
      )}

      {aviso && (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 16px',
            border: '1px solid var(--line)',
            borderLeft: `3px solid var(--${aviso.tipo === 'erro' ? 'accent' : 'ok'})`,
            borderRadius: '0 var(--r) var(--r) 0',
            background: `var(--${aviso.tipo === 'erro' ? 'accent' : 'ok'}-wash)`,
            fontSize: 13.5,
            display: 'flex',
            gap: 10,
          }}
        >
          <span style={{ flex: 1 }}>{aviso.texto}</span>
          <button
            onClick={() => setAviso(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              fontSize: 16,
            }}
            aria-label="fechar"
          >
            ×
          </button>
        </div>
      )}

      {semData.length > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 16px',
            border: '1px dashed var(--line-2)',
            borderRadius: 'var(--r)',
            fontSize: 13.5,
          }}
        >
          <b>{semData.length} pauta(s) sem data.</b> Elas não aparecem no calendário — abra pela
          lista abaixo e marque um dia.
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {semData.map((p) => (
              <button key={p.id} onClick={() => setAberta(p.id)} style={botao(false)}>
                {p.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
        {DIAS.map((d) => (
          <div
            key={d}
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
          if (dia === null) return <div key={`v${i}`} />
          const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
          const doDia = porDia.get(data) ?? []
          const fds = i % 7 === 0 || i % 7 === 6
          return (
            <div
              key={data}
              onDragOver={(ev) => {
                ev.preventDefault()
                if (alvo !== data) setAlvo(data)
              }}
              onDragLeave={() => setAlvo((a) => (a === data ? null : a))}
              onDrop={(ev) => {
                ev.preventDefault()
                soltar(data)
              }}
              style={{
                minHeight: 92,
                padding: 6,
                borderRadius: 8,
                border: `1px solid ${alvo === data ? 'var(--accent)' : 'var(--line)'}`,
                background:
                  alvo === data ? 'var(--accent-wash)' : fds ? 'var(--surface-2)' : 'var(--surface)',
                transition: 'background .12s, border-color .12s',
              }}
            >
              <div
                style={{ fontSize: 11.5, color: 'var(--faint)', fontWeight: 600, marginBottom: 4 }}
              >
                {dia}
              </div>
              {doDia.map((p) => {
                const e = ESTADO[p.status] ?? ESTADO.ai_generated
                const tipo = tipoDaPeca(p.formato)
                return (
                  <div
                    key={p.id}
                    draggable={podeEditar}
                    onDragStart={() => podeEditar && setArrastando(p.id)}
                    onDragEnd={() => {
                      setArrastando(null)
                      setAlvo(null)
                    }}
                    onClick={() => setAberta(p.id)}
                    title={`${p.title}\n${p.linha ?? ''} · ${tipo} · ${e.rotulo}`}
                    style={{
                      marginBottom: 4,
                      padding: '5px 7px',
                      borderRadius: 6,
                      // A cor da esquerda é a LINHA de produto. A situação
                      // tem lugar próprio embaixo, com símbolo e palavra —
                      // duas informações não cabem numa cor só.
                      borderLeft: `3px solid ${corDaLinha(p.linhaIndice)}`,
                      background: 'var(--surface-3)',
                      fontSize: 11.5,
                      lineHeight: 1.35,
                      cursor: podeEditar ? 'grab' : 'pointer',
                      opacity: arrastando === p.id ? 0.4 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        color: 'var(--muted)',
                        fontSize: 10,
                        marginBottom: 2,
                      }}
                    >
                      <span aria-hidden>{ICONE_PECA[tipo]}</span>
                      <span>{tipo}</span>
                      {p.conteudo && (
                        <span
                          title="conteúdo escrito"
                          style={{
                            marginLeft: 'auto',
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: 'var(--st-aprovado)',
                          }}
                        />
                      )}
                    </div>

                    <div
                      style={{
                        fontWeight: 700,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {p.title}
                    </div>

                    {p.linha && (
                      <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 2 }}>
                        {p.linha}
                      </div>
                    )}

                    {ultimoAvaliador(p) && (
                      <div
                        style={{
                          color: 'var(--muted)',
                          fontSize: 9.5,
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ultimoAvaliador(p)}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        marginTop: 4,
                        padding: '1px 6px',
                        borderRadius: 99,
                        border: `1px solid ${e.cor}`,
                        // O tom fraco de "em avaliação" no fundo claro é
                        // inevitável — é uma cor reservada de situação. O
                        // fundo tingido faz a forma se ler mesmo quando o
                        // texto não se impõe.
                        background: `color-mix(in srgb, ${e.cor} 14%, transparent)`,
                        color: e.cor,
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: '.02em',
                      }}
                    >
                      <span aria-hidden>{e.simbolo}</span>
                      {e.curto}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: '14px 18px',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          background: 'var(--surface)',
          display: 'flex',
          gap: 28,
          flexWrap: 'wrap',
        }}
      >
        {linhasUsadas.length > 0 && (
          <div>
            <div style={rotuloLegenda}>Linha de produto — a cor da lateral</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {linhasUsadas.map(([nome, indice]) => (
                <span key={nome} style={itemLegenda}>
                  <span
                    aria-hidden
                    style={{
                      width: 3,
                      height: 14,
                      borderRadius: 2,
                      background: corDaLinha(indice),
                      display: 'inline-block',
                    }}
                  />
                  {nome}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={rotuloLegenda}>Situação</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {situacoesUsadas.map((st) => {
              const e = ESTADO[st]
              return (
                <span key={st} style={{ ...itemLegenda, color: e.cor, fontWeight: 700 }}>
                  <span aria-hidden>{e.simbolo}</span>
                  {e.rotulo}
                </span>
              )
            })}
          </div>
        </div>

        <div>
          <div style={rotuloLegenda}>Tipo de peça</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[...new Set(pautas.map((p) => tipoDaPeca(p.formato)))].map((t) => (
              <span key={t} style={itemLegenda}>
                <span aria-hidden>{ICONE_PECA[t]}</span>
                {t}
              </span>
            ))}
            <span style={itemLegenda}>
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--st-aprovado)',
                  display: 'inline-block',
                }}
              />
              conteúdo escrito
            </span>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--faint)', fontSize: 12.5, marginTop: 10 }}>
        {podeEditar
          ? 'Arraste uma pauta para outro dia para remarcar. Clique para abrir, editar e escrever o conteúdo.'
          : 'Clique numa pauta para abrir e ler.'}
      </p>

      {pautaAberta && (
        <Painel
          key={pautaAberta.id}
          slug={slug}
          ano={ano}
          mes={mes}
          pauta={pautaAberta}
          podeEditar={podeEditar}
          aoFechar={() => setAberta(null)}
          aoTrocarEstado={(para) => trocarEstado(pautaAberta, para)}
          aoSalvar={(campos: Editaveis, versao: number) =>
            atualizar(pautaAberta.id, { ...campos, current_version: versao })
          }
          aoGerarConteudo={(c: ConteudoPauta) => atualizar(pautaAberta.id, { conteudo: c })}
        />
      )}
    </div>
  )
}

const rotuloLegenda: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color: 'var(--faint)',
  marginBottom: 7,
}

const itemLegenda: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 12,
  color: 'var(--muted)',
}

/** Quem tomou a última decisão sobre a pauta, para caber no cartão. */
function ultimoAvaliador(p: Pauta): string | null {
  const d = p.decisoes[0]
  if (!d) return null
  const quem = (d.autor ?? d.email ?? '').split(' ')[0]
  if (!quem) return null
  return `${d.decisao === 'approved' ? '✓' : '!'} ${quem}`
}
