'use client'

import { useState } from 'react'
import {
  criarPessoa,
  definirPapel,
  vincular,
  desvincular,
  resumoDaPessoa,
  apagarPessoa,
  type Historico,
} from './acoes'

export type Marca = { id: string; nome: string; slug: string }
export type Pessoa = {
  id: string
  nome: string
  email: string
  papel: string
  vinculos: { brandId: string; acesso: string }[]
}

const PAPEL: Record<string, { rotulo: string; explica: string }> = {
  admin: { rotulo: 'Administração', explica: 'vê todas as marcas e gerencia pessoas' },
  staff: { rotulo: 'Equipe da Alta', explica: 'trabalha nas marcas em que for vinculada' },
  client: { rotulo: 'Cliente', explica: 'só avalia o planejamento da própria marca' },
}

/**
 * O que cada nível PODE, desde a migração 0013.
 *
 * Antes disto os três eram só um rótulo: o banco gravava a escolha e
 * nenhuma regra a lia. Agora valem — e a explicação fica aqui do lado
 * para ninguém escolher no escuro.
 */
const ACESSO: Record<string, { rotulo: string; explica: string }> = {
  owner: {
    rotulo: 'responsável',
    explica: 'edita tudo e é quem envia o planejamento ao cliente',
  },
  editor: {
    rotulo: 'edita',
    explica: 'cria, altera e aprova internamente; não envia ao cliente',
  },
  viewer: {
    rotulo: 'só lê',
    explica: 'abre e acompanha, não altera nada',
  },
  client: {
    rotulo: 'avalia',
    explica: 'aprova ou pede alteração no que for enviado',
  },
}

/** O acesso que faz sentido para cada papel. */
function acessosDe(papel: string) {
  return papel === 'client' ? ['client'] : ['owner', 'editor', 'viewer']
}

export function Pessoas({
  marcas,
  pessoas: iniciais,
  temChaveAdmin,
  euId,
}: {
  marcas: Marca[]
  pessoas: Pessoa[]
  temChaveAdmin: boolean
  euId: string
}) {
  const [pessoas, setPessoas] = useState(iniciais)
  const [criando, setCriando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState('staff')
  const [porConvite, setPorConvite] = useState(true)
  const [escolhidas, setEscolhidas] = useState<Record<string, string>>({})

  const nomeDaMarca = new Map(marcas.map((m) => [m.id, m.nome]))

  // Exclusão em dois passos, como no planejamento: o primeiro clique
  // não apaga nada — ele vai buscar o que a pessoa deixa para trás e
  // mostra. O segundo é que decide. A pergunta "tem certeza?" sozinha
  // não informa nada; um número, sim.
  const [confirmando, setConfirmando] = useState<{
    id: string
    historico: Historico | null
  } | null>(null)

  const quantosAdmins = pessoas.filter((p) => p.papel === 'admin').length

  async function pedirExclusao(p: Pessoa) {
    setErro(null)
    setAviso(null)
    setConfirmando({ id: p.id, historico: null })
    const r = await resumoDaPessoa(p.id)
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui ler o histórico desta pessoa.')
      setConfirmando(null)
      return
    }
    setConfirmando({ id: p.id, historico: r.historico ?? null })
  }

  async function excluir(p: Pessoa) {
    setSalvando(true)
    setErro(null)
    const r = await apagarPessoa(p.id)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui apagar.')
      return
    }
    setPessoas((antes) => antes.filter((x) => x.id !== p.id))
    setConfirmando(null)
    setAviso(r.aviso ?? `${p.nome} foi removido. O histórico continua, sem o nome.`)
  }

  function limpar() {
    setNome('')
    setEmail('')
    setPapel('staff')
    setEscolhidas({})
    setErro(null)
  }

  async function criar() {
    setSalvando(true)
    setErro(null)
    setSenhaGerada(null)
    setAviso(null)

    const r = await criarPessoa({
      nome,
      email,
      papel,
      marcas: Object.entries(escolhidas).map(([id, acesso]): { id: string; acesso: string } => ({
        id,
        acesso: String(acesso),
      })),
      porConvite,
    })
    setSalvando(false)

    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui criar.')
      return
    }

    if (r.senha) setSenhaGerada({ email: email.trim().toLowerCase(), senha: r.senha })
    if (r.aviso) setAviso(r.aviso)

    setPessoas((lista) => [
      ...lista,
      {
        id: 'nova-' + Date.now(),
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        papel,
        vinculos: Object.entries(escolhidas).map(([brandId, acesso]) => ({
          brandId,
          acesso: String(acesso),
        })),
      },
    ])
    limpar()
    setCriando(false)
  }

  async function trocarPapel(p: Pessoa, novo: string) {
    const antes = pessoas
    setPessoas((l) => l.map((x) => (x.id === p.id ? { ...x, papel: novo } : x)))
    const r = await definirPapel(p.id, novo)
    if (!r.ok) {
      setPessoas(antes)
      setErro(r.erro ?? 'Não consegui mudar o papel.')
    }
  }

  async function mudarVinculo(p: Pessoa, brandId: string, acesso: string) {
    const antes = pessoas
    setPessoas((l) =>
      l.map((x) =>
        x.id === p.id
          ? {
              ...x,
              vinculos:
                acesso === ''
                  ? x.vinculos.filter((v) => v.brandId !== brandId)
                  : x.vinculos.some((v) => v.brandId === brandId)
                    ? x.vinculos.map((v) => (v.brandId === brandId ? { ...v, acesso } : v))
                    : [...x.vinculos, { brandId, acesso }],
            }
          : x,
      ),
    )
    const r = acesso === '' ? await desvincular(p.id, brandId) : await vincular(p.id, brandId, acesso)
    if (!r.ok) {
      setPessoas(antes)
      setErro(r.erro ?? 'Não consegui mudar o vínculo.')
    }
  }

  const porPapel = ['admin', 'staff', 'client'].map((k) => ({
    papel: k,
    gente: pessoas.filter((p) => p.papel === k),
  }))

  return (
    <div>
      {!temChaveAdmin && (
        <Caixa cor="warn">
          <b>Falta a chave de serviço no `.env.local`.</b> Sem ela você ainda muda papéis e
          vincula marcas de quem já existe, mas não consegue criar ninguém novo por aqui. A
          instrução está na mensagem que te mandei.
        </Caixa>
      )}

      {erro && <Caixa cor="accent">{erro}</Caixa>}
      {aviso && <Caixa cor="warn">{aviso}</Caixa>}

      {senhaGerada && (
        <Caixa cor="ok">
          <b>Pessoa criada.</b> Passe estes dados a ela — esta senha aparece{' '}
          <b>uma única vez</b> e some quando você sair desta tela.
          <div
            style={{
              marginTop: 8,
              padding: '10px 13px',
              background: 'var(--surface)',
              border: '1px solid var(--line-2)',
              borderRadius: 8,
              fontFamily: 'var(--mono)',
              fontSize: 13,
            }}
          >
            {senhaGerada.email}
            <br />
            {senhaGerada.senha}
          </div>
          <p style={{ fontSize: 12.5, marginTop: 7, lineHeight: 1.5 }}>
            Mande por um canal privado, e peça para a pessoa trocar assim que entrar.
          </p>
        </Caixa>
      )}

      {!criando ? (
        <button onClick={() => setCriando(true)} style={botao(true)}>
          Cadastrar pessoa
        </button>
      ) : (
        <section
          style={{
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)',
            padding: '20px 22px',
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontFamily: 'var(--disp)', fontSize: 19, fontWeight: 600, marginBottom: 14 }}>
            Cadastrar pessoa
          </h2>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <div>
              <label htmlFor="n" style={rotulo}>
                Nome
              </label>
              <input id="n" value={nome} onChange={(e) => setNome(e.target.value)} style={campo} />
            </div>
            <div>
              <label htmlFor="e" style={rotulo}>
                E-mail
              </label>
              <input
                id="e"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={campo}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <span style={rotulo}>Papel</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(PAPEL).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => {
                    setPapel(k)
                    setEscolhidas({})
                  }}
                  style={{
                    ...botao(false),
                    borderColor: papel === k ? 'var(--accent)' : 'var(--line-2)',
                    color: papel === k ? 'var(--accent)' : 'var(--text)',
                    fontWeight: papel === k ? 700 : 600,
                  }}
                >
                  {v.rotulo}
                </button>
              ))}
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 6 }}>
              {PAPEL[papel].explica}
            </p>
          </div>

          <div style={{ marginTop: 16 }}>
            <span style={rotulo}>
              Marcas {papel === 'client' ? '(obrigatório para cliente)' : ''}
            </span>
            <div style={{ display: 'grid', gap: 7 }}>
              {marcas.map((m) => {
                const marcada = escolhidas[m.id] !== undefined
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      border: `1px solid ${marcada ? 'var(--accent)' : 'var(--line)'}`,
                      borderRadius: 8,
                      background: marcada ? 'var(--accent-wash)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      id={`m-${m.id}`}
                      checked={marcada}
                      onChange={(e) =>
                        setEscolhidas((a) => {
                          const novo = { ...a }
                          if (e.target.checked) novo[m.id] = acessosDe(papel)[0]
                          else delete novo[m.id]
                          return novo
                        })
                      }
                    />
                    <label htmlFor={`m-${m.id}`} style={{ flex: 1, fontSize: 14, cursor: 'pointer' }}>
                      {m.nome}
                    </label>
                    {marcada && papel !== 'client' && (
                      <select
                        value={escolhidas[m.id]}
                        onChange={(e) => setEscolhidas((a) => ({ ...a, [m.id]: e.target.value }))}
                        style={{ ...campo, width: 'auto', padding: '5px 9px', fontSize: 13 }}
                      >
                        {acessosDe(papel).map((a) => (
                          <option key={a} value={a}>
                            {ACESSO[a].rotulo}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>

            {papel !== 'client' && (
              <ul
                style={{
                  listStyle: 'none',
                  margin: '10px 0 0',
                  padding: 0,
                  fontSize: 12.3,
                  lineHeight: 1.65,
                  color: 'var(--muted)',
                }}
              >
                {['owner', 'editor', 'viewer'].map((a) => (
                  <li key={a}>
                    <b style={{ color: 'var(--text)' }}>{ACESSO[a].rotulo}</b> — {ACESSO[a].explica}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <span style={rotulo}>Como ela recebe o acesso</span>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
              <input
                type="radio"
                checked={porConvite}
                onChange={() => setPorConvite(true)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                <b>Convite por e-mail</b> — ela escolhe a própria senha, e ninguém na Alta chega a
                saber qual é. Depende de o envio de e-mail estar configurado no Supabase.
              </span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input
                type="radio"
                checked={!porConvite}
                onChange={() => setPorConvite(false)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                <b>Senha temporária</b> — o sistema gera uma e mostra uma vez, para você passar à
                pessoa. Funciona sempre, mas alguém além dela conhece a senha até que ela troque.
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
            <button
              onClick={criar}
              disabled={salvando || !temChaveAdmin}
              style={botao(true, salvando || !temChaveAdmin)}
            >
              {salvando ? 'Criando…' : porConvite ? 'Enviar convite' : 'Criar com senha temporária'}
            </button>
            <button
              onClick={() => {
                setCriando(false)
                limpar()
              }}
              style={botao(false)}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      {porPapel.map(({ papel: k, gente }) =>
        gente.length === 0 ? null : (
          <section key={k} style={{ marginTop: 28 }}>
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
              {PAPEL[k].rotulo} · {gente.length}
            </h2>

            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-lg)',
                background: 'var(--surface)',
                boxShadow: 'var(--shadow)',
                overflow: 'hidden',
              }}
            >
              {gente.map((p, i) => (
                <li
                  key={p.id}
                  style={{
                    padding: '15px 20px',
                    borderBottom: i === gente.length - 1 ? 'none' : '1px solid var(--line)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 190 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        {p.nome}
                        {p.id === euId && (
                          <span style={{ color: 'var(--faint)', fontWeight: 500, fontSize: 12 }}> · você</span>
                        )}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 13 }}>{p.email}</div>
                    </div>
                    <select
                      value={p.papel}
                      onChange={(e) => trocarPapel(p, e.target.value)}
                      style={{ ...campo, width: 'auto', padding: '6px 10px', fontSize: 13 }}
                    >
                      {Object.entries(PAPEL).map(([kk, vv]) => (
                        <option key={kk} value={kk}>
                          {vv.rotulo}
                        </option>
                      ))}
                    </select>
                  </div>

                  {p.papel !== 'admin' && (
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                      {marcas.map((m) => {
                        const v = p.vinculos.find((x) => x.brandId === m.id)
                        return (
                          <span
                            key={m.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '3px 5px 3px 10px',
                              borderRadius: 99,
                              border: `1px solid ${v ? 'var(--line-2)' : 'var(--line)'}`,
                              background: v ? 'var(--surface-3)' : 'transparent',
                              fontSize: 12,
                              color: v ? 'var(--text)' : 'var(--faint)',
                            }}
                          >
                            {m.nome}
                            <select
                              value={v?.acesso ?? ''}
                              onChange={(e) => mudarVinculo(p, m.id, e.target.value)}
                              style={{
                                fontFamily: 'inherit',
                                fontSize: 11.5,
                                border: 'none',
                                background: 'transparent',
                                color: 'inherit',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="">sem acesso</option>
                              {acessosDe(p.papel).map((a) => (
                                <option key={a} value={a}>
                                  {ACESSO[a].rotulo}
                                </option>
                              ))}
                            </select>
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {p.papel === 'admin' && (
                    <p style={{ color: 'var(--faint)', fontSize: 12.3, marginTop: 8 }}>
                      Administração alcança todas as marcas — não precisa de vínculo.
                    </p>
                  )}

                  {p.id !== euId &&
                    !(p.papel === 'admin' && quantosAdmins <= 1) &&
                    confirmando?.id !== p.id && (
                      <button
                        onClick={() => pedirExclusao(p)}
                        style={{
                          marginTop: 10,
                          padding: 0,
                          border: 'none',
                          background: 'none',
                          fontFamily: 'inherit',
                          fontSize: 12.5,
                          color: 'var(--faint)',
                          textDecoration: 'underline',
                          textUnderlineOffset: 3,
                          cursor: 'pointer',
                        }}
                      >
                        Excluir cadastro
                      </button>
                    )}

                  {p.papel === 'admin' && quantosAdmins <= 1 && p.id !== euId && (
                    <p style={{ color: 'var(--faint)', fontSize: 12.3, marginTop: 8 }}>
                      Não dá para excluir: é a única conta de administração que existe.
                    </p>
                  )}

                  {confirmando?.id === p.id && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '14px 16px',
                        border: '1px solid var(--line)',
                        borderLeft: '3px solid var(--laranja)',
                        borderRadius: '0 var(--r) var(--r) 0',
                        background: 'var(--laranja-wash)',
                        fontSize: 13.5,
                        lineHeight: 1.6,
                      }}
                    >
                      <b>Excluir o cadastro de {p.nome}?</b>
                      <div style={{ color: 'var(--muted)', marginTop: 4 }}>
                        {confirmando.historico === null ? (
                          'Conferindo o que esta pessoa deixa para trás…'
                        ) : (
                          <>
                            O login deixa de existir e ela some desta lista.{' '}
                            {(() => {
                              const h = confirmando.historico
                              const partes = [
                                h.aprovacoes > 0 && `${h.aprovacoes} aprovação(ões)`,
                                h.versoes > 0 && `${h.versoes} versão(ões) de texto`,
                                h.comentarios > 0 && `${h.comentarios} comentário(s)`,
                                h.planos > 0 && `${h.planos} planejamento(s) criado(s)`,
                              ].filter(Boolean) as string[]
                              return partes.length > 0 ? (
                                <>
                                  O histórico dela — {partes.join(', ')} — <b>continua gravado</b>,
                                  mas passa a aparecer sem nome. Isso não se desfaz.
                                </>
                              ) : (
                                <>
                                  Ela ainda não deixou histórico no sistema
                                  {h.marcas > 0 ? `, só o vínculo com ${h.marcas} marca(s)` : ''}.
                                </>
                              )
                            })()}
                          </>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => excluir(p)}
                          disabled={salvando || confirmando.historico === null}
                          style={{
                            ...botao(false, salvando || confirmando.historico === null),
                            borderColor: 'var(--laranja)',
                            color: 'var(--laranja)',
                          }}
                        >
                          {salvando ? 'Excluindo…' : 'Excluir definitivamente'}
                        </button>
                        <button onClick={() => setConfirmando(null)} style={botao(false)}>
                          Manter
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
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

const rotulo: React.CSSProperties = {
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
