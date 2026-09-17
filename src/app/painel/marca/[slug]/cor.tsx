'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { botao } from '@/lib/visual'
import { definirCor } from './acoes'

/**
 * A cor da marca, que o portal do cliente usa.
 *
 * Só a administração troca. Não é limitação técnica com disfarce de
 * regra: mexer nisto é configuração de conta, feita uma vez, e as
 * políticas do banco já reservam a tabela `brands` para a
 * administração desde o começo. Abrir a tabela para o responsável
 * exigiria uma política nova e um gatilho controlando coluna por
 * coluna — trabalho de segurança para um campo que muda uma vez.
 */
export function Cor({
  slug,
  inicial,
  podeTrocar,
}: {
  slug: string
  inicial: string | null
  podeTrocar: boolean
}) {
  const router = useRouter()
  const [cor, setCor] = useState(inicial ?? '#2502D0')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  async function guardar(valor: string | null) {
    setSalvando(true)
    setErro(null)
    setSalvo(false)
    const r = await definirCor(slug, valor)
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui salvar.')
      return
    }
    setSalvo(true)
    router.refresh()
  }

  const amostra = inicial ?? 'var(--accent)'

  if (!podeTrocar) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--muted)' }}>
        <span aria-hidden style={selo(amostra)} />
        {inicial ? `Cor da marca: ${inicial}` : 'Sem cor própria — o portal usa a cor do sistema'}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span aria-hidden style={selo(cor)} />
        <label htmlFor="cor-marca" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          Cor no portal do cliente
        </label>
        <input
          id="cor-marca"
          type="color"
          value={cor}
          onChange={(e) => setCor(e.target.value)}
          style={{
            width: 38,
            height: 30,
            padding: 0,
            border: 'none',
            borderRadius: 8,
            background: 'none',
            cursor: 'pointer',
          }}
        />
        <button
          onClick={() => guardar(cor.toUpperCase())}
          disabled={salvando}
          style={{ ...botao(false, salvando), fontSize: 12.5, padding: '7px 14px' }}
        >
          {salvando ? 'Salvando…' : 'Usar esta cor'}
        </button>
        {inicial && (
          <button
            onClick={() => guardar(null)}
            disabled={salvando}
            style={{
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 600,
              border: 'none',
              background: 'none',
              color: 'var(--muted)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              cursor: 'pointer',
            }}
          >
            tirar
          </button>
        )}
        {salvo && <span style={{ fontSize: 12.5, color: 'var(--ok)' }}>salvo</span>}
      </div>
      {erro && (
        <div style={{ fontSize: 12.5, color: 'var(--laranja-tinta)', marginTop: 6 }}>{erro}</div>
      )}
    </div>
  )
}

function selo(cor: string): React.CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: 7,
    background: cor,
    display: 'inline-block',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)',
    flex: '0 0 auto',
  }
}
