'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { moverPauta, mudarStatus, aprovarTodas, enviarAoCliente } from './acoes'
import { Painel } from './painel'
import {
  DIAS_CURTOS,
  ESTADO,
  ICONE_PECA,
  SITUACOES,
  botao,
  cartao,
  corDaLinha,
  pilula,
  ponto,
  semanasDoMes,
  tipoDaPeca,
  type ConteudoPauta,
  type Critica,
  type Editaveis,
  type Pauta,
} from './comum'
import { reais, resumoDoMes, somarInvestimento } from '@/lib/midia'

/** A cor de cada veredito do crítico. Nunca sozinha: vem com a nota. */
const JUIZO: Record<string, { rotulo: string; cor: string; wash: string }> = {
  fraca: { rotulo: 'fraca', cor: 'var(--laranja)', wash: 'var(--laranja-wash)' },
  revisar: { rotulo: 'revisar', cor: 'var(--st-avaliacao)', wash: 'var(--amarelo-wash)' },
  boa: { rotulo: 'boa', cor: 'var(--st-aprovado)', wash: 'var(--st-aprovado-wash)' },
}

export function Calendario({
  slug,
  planoId,
  ano,
  mes,
  pautas: iniciais,
  nivel,
  critica,
  investimentoTotal = null,
  abrir = null,
  admin = false,
}: {
  slug: string
  planoId: string
  ano: number
  mes: number
  pautas: Pauta[]
  /** 'owner' responde pela marca · 'editor' escreve · 'viewer' só lê. */
  nivel: string
  /** O juízo da IA sobre o mês, quando alguém já pediu a avaliação. */
  critica: Critica | null
  /** A verba de mídia do mês. Nulo: ninguém informou verba. */
  investimentoTotal?: number | null
  /** Pauta para abrir assim que a tela carrega (link da fila de trabalho). */
  abrir?: string | null
  /** Administração: troca o layout mesmo com a publicação aprovada. */
  admin?: boolean
}) {
  // Esconder botão não é segurança: quem tem a sessão aberta consegue
  // montar a requisição na mão. A trava de verdade está no banco. Isto
  // aqui existe para a pessoa não clicar no que vai ser recusado.
  const podeEditar = nivel === 'owner' || nivel === 'editor'
  const podeEnviar = nivel === 'owner'

  const [pautas, setPautas] = useState(iniciais)
  const [aberta, setAberta] = useState<string | null>(
    abrir && iniciais.some((p) => p.id === abrir) ? abrir : null,
  )
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [pendente, comecar] = useTransition()
  const [avaliando, setAvaliando] = useState(false)
  const [segundosIA, setSegundosIA] = useState(0)
  const router = useRouter()

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

  // Quanto as OUTRAS publicações já levam, calculado aqui e não no
  // painel: é o painel que muda um valor por vez, e a conta precisa
  // enxergar o mês inteiro para dizer quanto ainda sobra.
  const distribuido = useMemo(() => somarInvestimento(pautas), [pautas])
  const midia = resumoDoMes(investimentoTotal, distribuido)

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
    // Desde a 0025, o cliente recebe a peça com a legenda final. Sem
    // conteúdo escrito, o banco recusa o envio; a tela diz antes.
    const semConteudo = pautas.filter(
      (p) => p.status === 'internally_approved' && !(p.conteudo?.caption ?? '').trim(),
    ).length
    if (semConteudo > 0) {
      setAviso({
        tipo: 'erro',
        texto:
          semConteudo === 1
            ? '1 publicação ainda está sem conteúdo escrito. O cliente recebe a peça com a legenda final: abra a pauta, aba Conteúdo, e escreva antes de enviar.'
            : `${semConteudo} publicações ainda estão sem conteúdo escrito. O cliente recebe a peça com a legenda final: escreva o conteúdo delas antes de enviar.`,
      })
      return
    }
    // Layout é opcional, mas quase sempre esquecimento: avisa antes.
    const semLayout = pautas.filter((p) => p.status === 'internally_approved' && p.layouts.length === 0).length
    if (
      semLayout > 0 &&
      !window.confirm(
        semLayout === 1
          ? '1 publicação vai sem layout: o cliente verá só a legenda. Enviar assim mesmo?'
          : `${semLayout} publicações vão sem layout: o cliente verá só a legenda. Enviar assim mesmo?`,
      )
    ) {
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

  async function avaliar() {
    if (avaliando) return
    setAvaliando(true)
    setAviso(null)
    setSegundosIA(0)
    const t = setInterval(() => setSegundosIA((x) => x + 1), 1000)
    try {
      const r = await fetch('/api/critica', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planoId }),
      })
      const corpo = await r.json()
      if (!r.ok || corpo.erro) {
        setAviso({ tipo: 'erro', texto: corpo.erro ?? 'Não consegui avaliar o mês.' })
        return
      }
      // A crítica é gravada no servidor; recarregar é o que a traz para
      // a tela sem eu ter que recriar o estado inteiro aqui.
      router.refresh()
      setAviso({ tipo: 'ok', texto: 'Mês avaliado. As pautas fracas estão marcadas no calendário.' })
    } catch {
      setAviso({ tipo: 'erro', texto: 'A conexão caiu durante a avaliação. Tente de novo.' })
    } finally {
      clearInterval(t)
      setAvaliando(false)
    }
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

  // A grade do mês é a mesma do portal do cliente: uma conta só, em
  // `lib/visual`, para as duas telas não discordarem sobre em que dia
  // da semana o mês começa.
  const semanas = semanasDoMes(ano, mes)

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '16px 20px',
          ...cartao,
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
          {midia.temVerba && (
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>
              Mídia: <b style={{ color: 'var(--text)' }}>{reais(midia.distribuido)}</b> de{' '}
              {reais(midia.total)} distribuídos ·{' '}
              <span style={{ color: midia.sobra < -0.005 ? 'var(--laranja-tinta)' : 'inherit' }}>
                {midia.frase}
              </span>
            </div>
          )}
          <div
            style={{
              height: 5,
              borderRadius: 99,
              background: 'var(--surface-3)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: 'var(--accent)',
                transition: 'width .25s ease',
              }}
            />
          </div>
        </div>
        {/* Uma ação forte por área. Aprovar em massa é frequente mas
            reversível; enviar ao cliente é a que sai da agência — essa
            leva o azul. */}
        {podeEditar && (
          <button
            onClick={avaliar}
            disabled={avaliando || pendente}
            title="Um segundo passe de IA lê o mês contra a base da marca e aponta o que está genérico."
            style={botao(false, avaliando || pendente)}
          >
            {avaliando
              ? `Avaliando… ${segundosIA}s`
              : critica
                ? 'Avaliar de novo'
                : 'Avaliar o mês (IA)'}
          </button>
        )}
        {emAvaliacao > 0 && podeEditar && (
          <button onClick={aprovarPendentes} disabled={pendente} style={botao(false, pendente)}>
            Aprovar as {emAvaliacao} pendentes
          </button>
        )}
        {prontasParaEnviar > 0 && podeEnviar && (
          <button onClick={enviar} disabled={pendente} style={botao(true, pendente)}>
            Enviar ao cliente ({prontasParaEnviar})
          </button>
        )}
      </div>

      {!podeEditar && (
        <div
          style={{
            marginBottom: 14,
            padding: '13px 17px',
            borderRadius: 'var(--r)',
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
            padding: '13px 17px',
            borderRadius: 'var(--r)',
            background: 'var(--accent-wash)',
            fontSize: 13.3,
            lineHeight: 1.6,
          }}
        >
          <b>{prontasParaEnviar} pauta(s) prontas para o cliente.</b> Quem envia é a pessoa
          responsável pela marca e avise que este mês está pronto.
        </div>
      )}

      {critica && critica.veredito && (
        <div
          style={{
            marginBottom: 14,
            padding: '15px 18px',
            borderRadius: 'var(--r)',
            background: 'var(--surface-2)',
            fontSize: 13.5,
            lineHeight: 1.65,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 6,
            }}
          >
            <b>O que a IA achou deste mês</b>
            {(() => {
              const fracas = Object.values(critica.itens).filter((i) => i.veredito === 'fraca').length
              const revisar = Object.values(critica.itens).filter((i) => i.veredito === 'revisar').length
              return (
                <>
                  {fracas > 0 && (
                    <span style={pilula(JUIZO.fraca.wash, true)}>
                      <i aria-hidden style={ponto(JUIZO.fraca.cor)} />
                      {fracas} fraca(s)
                    </span>
                  )}
                  {revisar > 0 && (
                    <span style={pilula(JUIZO.revisar.wash, true)}>
                      <i aria-hidden style={ponto(JUIZO.revisar.cor)} />
                      {revisar} para revisar
                    </span>
                  )}
                </>
              )
            })()}
            {critica.quando && (
              <span style={{ fontSize: 11.5, color: 'var(--faint)', marginLeft: 'auto' }}>
                avaliado em{' '}
                {new Date(critica.quando).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
          <div style={{ color: 'var(--muted)' }}>{critica.veredito}</div>
        </div>
      )}

      {pedidosDoCliente > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: '14px 18px',
            borderRadius: 'var(--r)',
            background: 'var(--laranja-wash)',
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
            padding: '13px 17px',
            borderRadius: 'var(--r)',
            background: `var(--${aviso.tipo === 'erro' ? 'laranja' : 'ok'}-wash)`,
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
            padding: '13px 17px',
            borderRadius: 'var(--r)',
            background: 'var(--surface-2)',
            fontSize: 13.5,
          }}
        >
          <b>{semData.length} pauta(s) sem data.</b> Elas não aparecem no calendário. Abra pela
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

      {/* Mesma grade do portal do cliente: a classe cuida do celular. */}
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
          const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
          const doDia = porDia.get(data) ?? []
          const fds = i % 7 === 0 || i % 7 === 6
          return (
            <div
              key={data}
              className={doDia.length ? 'dia-cheio' : 'dia-vazio'}
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
                minHeight: 104,
                padding: 9,
                borderRadius: 'var(--r)',
                background: alvo === data ? 'var(--accent-wash)' : 'var(--surface)',
                boxShadow:
                  alvo === data
                    ? 'inset 0 0 0 2px var(--accent)'
                    : fds
                      ? 'none'
                      : 'var(--shadow)',
                opacity: fds && !alvo ? 0.72 : 1,
                transition: 'background .12s, box-shadow .12s',
              }}
            >
              <div
                style={{ fontSize: 11.5, color: 'var(--faint)', fontWeight: 600, marginBottom: 4 }}
              >
                <span className="so-celular">{DIAS_CURTOS[i % 7]} · </span>
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
                      marginBottom: 5,
                      padding: '9px 10px',
                      borderRadius: 'var(--r-sm)',
                      // A linha de produto virou um ponto ao lado do nome
                      // dela, embaixo. Era uma barra de 3px na lateral; num
                      // mês cheio, quatorze barras coloridas empilhadas
                      // viravam listra, não informação.
                      background: 'var(--surface-2)',
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
                      <span
                        aria-hidden
                        style={{
                          width: 17,
                          height: 17,
                          borderRadius: 5,
                          background: 'var(--surface-3)',
                          display: 'inline-grid',
                          placeItems: 'center',
                          fontSize: 9,
                        }}
                      >
                        {ICONE_PECA[tipo]}
                      </span>
                      <span>{tipo}</span>
                      {/* Ponto verde: conteúdo escrito. Amarelo: a pauta
                          está aprovada mas ainda sem legenda, e o cliente
                          recebe a peça com a legenda final. */}
                      {(p.conteudo || p.status === 'internally_approved') && (
                        <span
                          title={p.conteudo ? 'conteúdo escrito' : 'falta escrever o conteúdo'}
                          style={{
                            marginLeft: 'auto',
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: p.conteudo ? 'var(--st-aprovado)' : 'var(--st-avaliacao)',
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
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          color: 'var(--muted)',
                          fontSize: 10,
                          marginTop: 4,
                        }}
                      >
                        <i aria-hidden style={ponto(corDaLinha(p.linhaIndice), 7)} />
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

                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {/* Na célula estreita o rótulo quebra linha em vez de
                          vazar para fora do cartão. */}
                      <div style={{ ...pilula(e.wash, true), whiteSpace: 'normal', maxWidth: '100%' }}>
                        <i aria-hidden style={{ ...ponto(e.cor), flexShrink: 0 }} />
                        {e.curto}
                      </div>
                      {(() => {
                        const j = critica?.itens[p.id]
                        if (!j || j.veredito === 'boa') return null
                        const cor = JUIZO[j.veredito]
                        return (
                          <div
                            style={{ ...pilula(cor.wash, true), opacity: j.vencida ? 0.5 : 1 }}
                            title={`${j.porque}${j.arrume ? ' → ' + j.arrume : ''}`}
                          >
                            <i aria-hidden style={ponto(cor.cor)} />
                            {cor.rotulo} {j.nota}
                          </div>
                        )
                      })()}
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
          padding: '4px 2px',
          display: 'flex',
          gap: 28,
          flexWrap: 'wrap',
        }}
      >
        {linhasUsadas.length > 0 && (
          <div>
            <div style={rotuloLegenda}>Linha de produto (a cor da lateral)</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {linhasUsadas.map(([nome, indice]) => (
                <span key={nome} style={itemLegenda}>
                  <i aria-hidden style={ponto(corDaLinha(indice), 8)} />
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
                <span key={st} style={pilula(e.wash)}>
                  <i aria-hidden style={ponto(e.cor)} />
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
          juizo={critica?.itens[pautaAberta.id] ?? null}
          aoFechar={() => setAberta(null)}
          aoTrocarEstado={(para) => trocarEstado(pautaAberta, para)}
          aoSalvar={(campos: Editaveis, versao: number) =>
            atualizar(pautaAberta.id, { ...campos, current_version: versao })
          }
          aoGerarConteudo={(c: ConteudoPauta) => atualizar(pautaAberta.id, { conteudo: c })}
          admin={admin}
          aoMudarLayouts={(layouts) => atualizar(pautaAberta.id, { layouts })}
          investimentoTotal={investimentoTotal}
          jaDistribuido={
            Math.round((distribuido - (pautaAberta.midia.investimento ?? 0)) * 100) / 100
          }
          aoMudarMidia={(midia) => atualizar(pautaAberta.id, { midia })}
          aoAtenderCliente={(campos: Editaveis, versao: number, estado: string | null) =>
            atualizar(pautaAberta.id, {
              ...campos,
              current_version: versao,
              // A rota já mudou o estado no banco; aqui a tela só
              // acompanha, sem uma segunda viagem ao servidor.
              ...(estado ? { status: estado } : {}),
            })
          }
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
