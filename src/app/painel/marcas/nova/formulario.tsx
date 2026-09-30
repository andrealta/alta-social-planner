'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { arrumarSlug, conferirMarca, type LinhaDeEscopo } from '@/lib/marca'
import { criarMarca } from './acoes'

/**
 * O formulário de marca nova.
 *
 * Duas decisões de comportamento que mudam bastante a sensação de uso:
 *
 * O endereço curto é preenchido a partir do nome enquanto ninguém
 * mexer nele. No instante em que a pessoa edita o campo, ele para de
 * seguir o nome: uma marca chamada "Hero Geleias" que a agência chama
 * de "hero" internamente não pode ter o endereço trocado de volta a
 * cada letra digitada no nome.
 *
 * O escopo começa com duas linhas em branco em vez de nenhuma. Campo
 * vazio com botão "adicionar" esconde que aquilo existe; duas linhas
 * visíveis mostram o formato esperado sem precisar de explicação.
 */
export function FormularioDeMarca() {
  const router = useRouter()
  const [salvando, comecar] = useTransition()

  const [nome, setNome] = useState('')
  const [slug, setSlug] = useState('')
  const [slugNaMao, setSlugNaMao] = useState(false)
  const [segmento, setSegmento] = useState('')
  const [escopo, setEscopo] = useState<{ label: string; quota: string }[]>([
    { label: '', quota: '' },
    { label: '', quota: '' },
  ])
  const [erro, setErro] = useState<string | null>(null)

  const linhasLimpas: LinhaDeEscopo[] = escopo
    .filter((l) => l.label.trim() !== '' || l.quota.trim() !== '')
    .map((l) => ({ label: l.label.trim(), quota: Number(l.quota) }))

  const problemas = conferirMarca({ nome, slug, escopo: linhasLimpas })
  const problemaDe = (campo: 'nome' | 'slug' | 'escopo') =>
    problemas.find((p) => p.campo === campo)?.texto ?? null

  const total = linhasLimpas.reduce((a, l) => a + (Number.isFinite(l.quota) ? l.quota : 0), 0)
  const podeSalvar = nome.trim() !== '' && problemas.length === 0 && !salvando

  function mudarNome(v: string) {
    setNome(v)
    if (!slugNaMao) setSlug(arrumarSlug(v))
  }

  function mudarLinha(i: number, campo: 'label' | 'quota', v: string) {
    setEscopo((antes) => antes.map((l, j) => (i === j ? { ...l, [campo]: v } : l)))
  }

  function enviar() {
    setErro(null)
    comecar(async () => {
      const r = await criarMarca({ nome, slug, segmento, escopo: linhasLimpas })
      if (!r.ok) {
        setErro(r.erro ?? 'Não consegui criar a marca.')
        return
      }
      if (r.erro) {
        // Criou, mas com ressalva. Mostra e segue: esconder isso faria
        // a pessoa descobrir sozinha, mais tarde, que falta escopo.
        alert(r.erro)
      }
      router.push(`/painel/marca/${r.slug}`)
    })
  }

  return (
    <div style={{ display: 'grid', gap: 22, maxWidth: 620 }}>
      <Campo
        rotulo="Nome da marca"
        ajuda="Como ela aparece nas telas e nos relatórios."
        erro={nome !== '' ? problemaDe('nome') : null}
      >
        <input
          style={campo}
          value={nome}
          onChange={(e) => mudarNome(e.target.value)}
          placeholder="Hero"
          autoFocus
        />
      </Campo>

      <Campo
        rotulo="Endereço curto"
        ajuda="Aparece no endereço da página e nos comandos. Só letras sem acento, números e hífen."
        erro={slug !== '' ? problemaDe('slug') : null}
      >
        <input
          style={campo}
          value={slug}
          onChange={(e) => {
            setSlugNaMao(true)
            setSlug(e.target.value)
          }}
          placeholder="hero"
        />
        {slug && !problemaDe('slug') ? (
          <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 6 }}>
            A página dela vai ser /painel/marca/{slug}
          </div>
        ) : null}
      </Campo>

      <Campo rotulo="Segmento" ajuda="Opcional. Ajuda a IA a situar a marca. Exemplo: alimentos.">
        <input
          style={campo}
          value={segmento}
          onChange={(e) => setSegmento(e.target.value)}
          placeholder="Alimentos"
        />
      </Campo>

      <div>
        <div style={rotuloForte}>Escopo contratado</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
          Quantas publicações de cada tipo por mês. Isto é restrição dura: ao gerar o
          planejamento, a IA fecha exatamente estas cotas, nem mais nem menos. Dá para
          deixar em branco agora e definir depois, mas sem escopo o planejamento não roda.
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {escopo.map((linha, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                style={{ ...campo, flex: 1 }}
                value={linha.label}
                onChange={(e) => mudarLinha(i, 'label', e.target.value)}
                placeholder={i === 0 ? 'Feed' : i === 1 ? 'Story' : 'Nome da linha'}
              />
              <input
                style={{ ...campo, width: 92 }}
                inputMode="numeric"
                value={linha.quota}
                onChange={(e) => mudarLinha(i, 'quota', e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="8"
                aria-label={`Quantidade por mês de ${linha.label || 'linha ' + (i + 1)}`}
              />
              <button
                type="button"
                style={botao(false, escopo.length <= 1)}
                onClick={() => setEscopo((a) => a.filter((_, j) => j !== i))}
                disabled={escopo.length <= 1}
                aria-label="Remover esta linha"
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
            onClick={() => setEscopo((a) => [...a, { label: '', quota: '' }])}
          >
            + outra linha
          </button>
          {total > 0 ? (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {total} publicações por mês no total
            </span>
          ) : null}
        </div>

        {problemaDe('escopo') ? (
          <div style={{ color: 'var(--laranja)', fontSize: 13, marginTop: 8 }}>
            {problemaDe('escopo')}
          </div>
        ) : null}
      </div>

      {erro ? (
        <div
          role="alert"
          style={{
            border: '1px solid var(--laranja)',
            background: 'var(--laranja-wash)',
            borderRadius: 'var(--r)',
            padding: '10px 14px',
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          {erro}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" style={botao(true, !podeSalvar)} onClick={enviar} disabled={!podeSalvar}>
          {salvando ? 'Criando…' : 'Criar marca'}
        </button>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          A base da marca você preenche na tela dela, logo depois.
        </span>
      </div>
    </div>
  )
}

function Campo({
  rotulo,
  ajuda,
  erro,
  children,
}: {
  rotulo: string
  ajuda?: string
  erro?: string | null
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block' }}>
      <div style={rotuloForte}>{rotulo}</div>
      {ajuda ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, marginBottom: 8, lineHeight: 1.5 }}>
          {ajuda}
        </div>
      ) : (
        <div style={{ height: 8 }} />
      )}
      {children}
      {erro ? (
        <div style={{ color: 'var(--laranja)', fontSize: 13, marginTop: 6 }}>{erro}</div>
      ) : null}
    </label>
  )
}

// Os mesmos estilos da tela de pessoas. O projeto nao tem classe de
// botao nem de campo no CSS: o padrao e objeto de estilo no arquivo da
// tela, e inventar uma classe nova aqui criaria dois padroes.
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
