'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { conferirMarca, corValida, type LinhaDeEscopo } from '@/lib/marca'
import { rotuloDaAcao } from '@/lib/registro-admin'
import { Inicial, FioDaMarca } from '@/lib/inicial'
// O sistema tem duas gerações de estilo convivendo: a antiga, com
// contorno cinza e canto quadrado, e a de `lib/visual.ts`, com botão
// redondo no azul da marca e cartão sem moldura. Esta tela nasceu
// copiando a antiga, da tela de pessoas. Passa para a nova.
import { botao, cartao, caixaTexto, pilula } from '@/lib/visual'
import {
  arquivarMarca,
  editarMarca,
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
  /** A mesma cor que o cliente vê no portal dele. */
  cor: string | null
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

/** Sem acento e sem caixa, para a busca achar o que a pessoa quis dizer. */
function achatar(t: string): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Uma coisa aberta por vez. Duas gavetas abertas viram clique errado. */
type Aberta = { slug: string; modo: 'editar' | 'escopo' | 'arquivar' | 'apagar' } | null

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

  /**
   * A busca.
   *
   * Com oito marcas ela é dispensável, e é por isso que ela some
   * sozinha abaixo de oito: campo de busca numa lista que cabe na tela
   * é uma pergunta que ninguém fez. Acima disso a rolagem começa, e
   * junto com ela o registro lá no fim sai de vista.
   *
   * Procura no nome, no endereço curto e no segmento, sem acento e sem
   * caixa: quem digita "canto" acha "Canto de Minas", e quem digita
   * "aliment" acha as três contas de alimentos.
   */
  const [busca, setBusca] = useState('')
  const alvo = achatar(busca)
  const cabe = (m: MarcaAdmin) =>
    alvo === '' ||
    achatar(m.nome).includes(alvo) ||
    achatar(m.slug).includes(alvo) ||
    achatar(m.segmento).includes(alvo)

  const [verRegistro, setVerRegistro] = useState(false)

  const ativas = marcas.filter((m) => !m.arquivadaEm && cabe(m))
  const arquivadas = marcas.filter((m) => m.arquivadaEm && cabe(m))
  const temBusca = marcas.length >= 8
  const escondidas = marcas.filter((m) => !cabe(m)).length

  function abrir(slug: string, modo: 'editar' | 'escopo' | 'arquivar' | 'apagar') {
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
          {escondidas > 0 ? `, ${escondidas} fora da busca` : ''}
        </span>

        {temBusca && (
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar por nome, endereço ou segmento"
            aria-label="Procurar marca"
            style={{ ...caixaTexto, maxWidth: 320, marginLeft: 'auto' }}
          />
        )}
      </div>

      <Titulo>Marcas ativas</Titulo>

      {ativas.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          {alvo
            ? `Nenhuma marca ativa com "${busca.trim()}".`
            : 'Nenhuma marca ativa. Crie a primeira em "nova marca", aqui em cima.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {ativas.map((m) => (
            <Cartao key={m.id} cor={m.cor}>
              {/* Identificação à esquerda, ação à direita. Numa tela
                  larga a linha inteira trabalha; numa estreita os
                  botões descem sozinhos, sem regra de tela. */}
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <Cabecalho marca={m} />

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={botao(false)} onClick={() => abrir(m.slug, 'editar')}>
                    {aberta?.slug === m.slug && aberta.modo === 'editar' ? 'fechar' : 'editar'}
                  </button>
                  <button style={botao(false)} onClick={() => abrir(m.slug, 'escopo')}>
                    {aberta?.slug === m.slug && aberta.modo === 'escopo' ? 'fechar' : 'escopo'}
                  </button>
                  <button style={botao(false)} onClick={() => abrir(m.slug, 'arquivar')}>
                    arquivar
                  </button>
                  <Link
                    href={`/painel/marca/${m.slug}`}
                    style={{ ...botao(true), textDecoration: 'none' }}
                  >
                    abrir a marca
                  </Link>
                </div>
              </div>

              {aberta?.slug === m.slug && aberta.modo === 'editar' && (
                <Identidade
                  marca={m}
                  trabalhando={trabalhando}
                  onCancelar={() => setAberta(null)}
                  onSalvar={(dados) =>
                    comecar(async () => {
                      depois(await editarMarca(m.slug, dados), `${m.nome} atualizada.`)
                    })
                  }
                />
              )}

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
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                  }}
                >
                  <Cabecalho marca={m} />

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

      {/* O registro fica recolhido: ele cresce para sempre e empurra a
          lista de marcas para cima da tela, que é o oposto do que
          alguém veio fazer aqui. Quem precisa dele, abre. */}
      <Titulo>Registro</Titulo>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
        Quem criou, editou, arquivou, apagou marca ou mexeu no escopo. Não se apaga e não
        se corrige: linha errada fica, e a linha seguinte conta o que aconteceu.
      </p>

      {!verRegistro ? (
        <button style={botao(false)} onClick={() => setVerRegistro(true)}>
          {registro.length === 0
            ? 'ver registro'
            : registro.length === 1
              ? 'ver registro (1 linha)'
              : `ver registro (${registro.length} linhas)`}
        </button>
      ) : registro.length === 0 ? (
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

      {verRegistro && (
        <button
          style={{ ...botao(false), marginTop: 12 }}
          onClick={() => setVerRegistro(false)}
        >
          esconder o registro
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

/**
 * O topo de cada cartão.
 *
 * O selo colorido com a inicial vem antes do nome porque, numa lista
 * de oito contas, é ele que encontra a marca: a cor chega ao olho
 * antes da palavra. É a mesma cor que o cliente vê no portal dele, e
 * o mesmo selo que já aparecia no painel.
 */
function Cabecalho({ marca }: { marca: MarcaAdmin }) {
  const total = marca.escopo.reduce((s, l) => s + l.quota, 0)

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: '1 1 340px' }}>
      <Inicial nome={marca.nome} cor={marca.cor} tamanho="g" />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 19 }}>
            {marca.nome}
          </span>
          <span style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 12 }}>
            /{marca.slug}
          </span>
        </div>

        <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
          {marca.segmento ? marca.segmento + ' · ' : ''}
          {marca.planejamentos === 0
            ? 'nenhum planejamento gerado'
            : marca.planejamentos === 1
              ? '1 planejamento gerado'
              : `${marca.planejamentos} planejamentos gerados`}
          {marca.arquivadaEm ? ` · arquivada em ${quando(marca.arquivadaEm)}` : ''}
        </div>

        {marca.escopo.length > 0 ? (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11, alignItems: 'center' }}>
            {marca.escopo.map((l) => (
              <span key={l.label} style={pilula('var(--surface-2)')}>
                {l.label} <b style={{ color: 'var(--text)' }}>{l.quota}</b>
              </span>
            ))}
            <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>{total} por mês</span>
          </div>
        ) : (
          <div style={{ color: 'var(--laranja)', fontSize: 13, marginTop: 11 }}>
            Sem escopo. O planejamento desta marca não roda enquanto não houver ao menos
            uma linha.
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Quem a marca é: nome, segmento e cor.
 *
 * A cor morava numa tela própria dentro da página da marca, e saiu de
 * lá. Ela é configuração de conta, feita uma vez, e o lugar de
 * configuração de conta é a administração: na página da marca ela
 * ficava no meio do caminho de quem só queria olhar o mês.
 *
 * O campo nativo de cor do navegador resolve sozinho a parte difícil,
 * que é escolher. A caixa de texto ao lado existe para quem já tem o
 * código da marca escrito em algum lugar e quer colar.
 */
function Identidade({
  marca,
  trabalhando,
  onSalvar,
  onCancelar,
}: {
  marca: MarcaAdmin
  trabalhando: boolean
  onSalvar: (dados: { nome: string; segmento: string; cor: string | null }) => void
  onCancelar: () => void
}) {
  const [nome, setNome] = useState(marca.nome)
  const [segmento, setSegmento] = useState(marca.segmento)
  const [cor, setCor] = useState(marca.cor ?? '#2502D0')
  const [semCor, setSemCor] = useState(marca.cor === null)

  const problema =
    conferirMarca({ nome, slug: marca.slug, escopo: [] }).find((p) => p.campo === 'nome')?.texto ??
    (!semCor && !corValida(cor) ? 'A cor precisa estar no formato #RRGGBB.' : null)

  const mudou =
    nome !== marca.nome ||
    segmento !== marca.segmento ||
    (semCor ? marca.cor !== null : cor !== (marca.cor ?? ''))

  return (
    <Gaveta>
      <div style={rotuloForte}>Quem é esta marca</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
        O nome aparece nas telas da equipe e no portal do cliente. O endereço curto,
        <span style={{ fontFamily: 'var(--mono)' }}> /{marca.slug}</span>, não muda: ele está
        em todo link já salvo, no comando do Operand e no endereço que o cliente recebeu.
      </div>

      <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
        <label style={{ display: 'block' }}>
          <span style={rotuloForte}>Nome</span>
          <input style={caixaTexto} value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>

        <label style={{ display: 'block' }}>
          <span style={rotuloForte}>Segmento</span>
          <input
            style={caixaTexto}
            value={segmento}
            onChange={(e) => setSegmento(e.target.value)}
            placeholder="Alimentos"
          />
        </label>

        <div>
          <span style={rotuloForte}>Cor no portal do cliente</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="color"
              value={corValida(cor) ? cor : '#2502D0'}
              onChange={(e) => {
                setCor(e.target.value)
                setSemCor(false)
              }}
              aria-label="Escolher a cor da marca"
              style={{
                width: 46,
                height: 38,
                padding: 2,
                border: 'none',
                borderRadius: 10,
                background: 'var(--surface-2)',
                cursor: 'pointer',
              }}
            />
            <input
              style={{ ...caixaTexto, width: 130, fontFamily: 'var(--mono)' }}
              value={semCor ? '' : cor}
              placeholder="#2502D0"
              onChange={(e) => {
                setCor(e.target.value)
                setSemCor(e.target.value.trim() === '')
              }}
              aria-label="Código da cor"
            />
            <Inicial nome={nome || marca.nome} cor={semCor ? null : cor} />
            <button
              style={botao(false)}
              onClick={() => {
                setSemCor(true)
                setCor('#2502D0')
              }}
            >
              usar o azul da Alta
            </button>
          </div>
        </div>
      </div>

      {problema ? (
        <div style={{ color: 'var(--laranja)', fontSize: 13, marginTop: 10 }}>{problema}</div>
      ) : null}

      <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
        <button
          style={botao(true, !!problema || !mudou || trabalhando)}
          disabled={!!problema || !mudou || trabalhando}
          onClick={() =>
            onSalvar({ nome: nome.trim(), segmento: segmento.trim(), cor: semCor ? null : cor })
          }
        >
          {trabalhando ? 'Gravando…' : 'Gravar'}
        </button>
        <button style={botao(false)} onClick={onCancelar}>
          cancelar
        </button>
      </div>
    </Gaveta>
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
              style={{ ...caixaTexto, flex: 1 }}
              value={l.label}
              onChange={(e) => mudar(i, 'label', e.target.value)}
              placeholder={i === 0 ? 'Feed' : 'Nome da linha'}
              aria-label={`Nome da linha ${i + 1}`}
            />
            <input
              style={{ ...caixaTexto, width: 92 }}
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
          style={caixaTexto}
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
          style={{ ...caixaTexto, fontFamily: 'var(--mono)' }}
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

function Cartao({
  children,
  apagada,
  cor,
}: {
  children: React.ReactNode
  apagada?: boolean
  cor?: string | null
}) {
  return (
    <section
      style={{
        ...cartao,
        position: 'relative',
        overflow: 'hidden',
        background: apagada ? 'var(--surface-2)' : 'var(--surface)',
        boxShadow: apagada ? 'none' : cartao.boxShadow,
        padding: '18px 20px 18px 24px',
        // A arquivada perde a cor de propósito: ela sai das listas, e
        // o cartão dela aqui é histórico, não conta ativa.
        opacity: apagada ? 0.82 : 1,
      }}
    >
      <FioDaMarca cor={apagada ? null : (cor ?? null)} />
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

const rotuloForte: React.CSSProperties = {
  display: 'block',
  fontWeight: 700,
  fontSize: 13,
  marginBottom: 5,
}
