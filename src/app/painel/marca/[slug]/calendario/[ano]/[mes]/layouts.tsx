'use client'

import { useRef, useState } from 'react'
import { clienteNavegador } from '@/lib/supabase/client'
import {
  LIMITE_DE_BYTES,
  LIMITE_POR_PUBLICACAO,
  TIPOS_DE_LAYOUT,
  podeMexerNoLayout,
  type Layout,
} from '@/lib/layouts'
import { prepararLayout, registrarLayout, removerLayout, ordenarLayouts } from './acoes-layout'
import { botao } from './comum'

/**
 * O layout da publicação: as imagens que vão para o cliente junto com
 * a legenda.
 *
 * Várias imagens em ordem (carrossel), até dez. A primeira é a capa.
 * Dá para arrastar arquivos para a área ou usar o botão.
 */

const RAZAO: Record<string, string> = { '1:1': '1 / 1', '4:5': '4 / 5', '9:16': '9 / 16', '16:9': '16 / 9' }

async function medir(arquivo: File): Promise<{ largura: number | null; altura: number | null }> {
  try {
    const bmp = await createImageBitmap(arquivo)
    const r = { largura: bmp.width, altura: bmp.height }
    bmp.close()
    return r
  } catch {
    return { largura: null, altura: null }
  }
}

export function Layouts({
  ideaId,
  status,
  temConteudo,
  podeEditar,
  admin,
  proporcao,
  iniciais,
  aoMudar,
}: {
  ideaId: string
  status: string
  temConteudo: boolean
  podeEditar: boolean
  admin: boolean
  proporcao: string | null
  iniciais: Layout[]
  aoMudar: (layouts: Layout[]) => void
}) {
  const [lista, setLista] = useState<Layout[]>(iniciais)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sobre, setSobre] = useState(false)
  const entrada = useRef<HTMLInputElement | null>(null)

  const regra = podeMexerNoLayout({ status, temConteudo, podeEditar, admin })
  const cabe = LIMITE_POR_PUBLICACAO - lista.length

  function publicar(nova: Layout[]) {
    setLista(nova)
    aoMudar(nova)
  }

  async function anexar(arquivos: File[]) {
    if (!regra.pode || enviando) return
    setErro(null)
    const aceitos = arquivos.slice(0, Math.max(0, cabe))
    if (arquivos.length > aceitos.length) {
      setErro(`Cada publicação aceita até ${LIMITE_POR_PUBLICACAO} imagens. Algumas ficaram de fora.`)
    }
    let atual = lista
    const supabase = clienteNavegador()
    for (let i = 0; i < aceitos.length; i++) {
      const f = aceitos[i]
      setEnviando(aceitos.length > 1 ? `Enviando ${i + 1} de ${aceitos.length}…` : 'Enviando…')
      if (!(TIPOS_DE_LAYOUT as readonly string[]).includes(f.type)) {
        setErro(`${f.name}: use imagem em JPG, PNG ou WEBP.`)
        continue
      }
      if (f.size > LIMITE_DE_BYTES) {
        setErro(`${f.name}: passa de 10 MB. Exporte uma versão mais leve.`)
        continue
      }
      const prep = await prepararLayout(ideaId, { tipo: f.type, bytes: f.size })
      if (!prep.ok) {
        setErro(prep.erro)
        break
      }
      const { error: erroEnvio } = await supabase.storage
        .from('layouts')
        .upload(prep.caminho, f, { contentType: f.type, upsert: false, cacheControl: '3600' })
      if (erroEnvio) {
        setErro(`${f.name}: não consegui enviar (${erroEnvio.message}).`)
        continue
      }
      const medida = await medir(f)
      const reg = await registrarLayout(ideaId, {
        caminho: prep.caminho,
        tipo: f.type,
        bytes: f.size,
        largura: medida.largura,
        altura: medida.altura,
        nome: f.name,
      })
      if (!reg.ok) {
        setErro(reg.erro)
        break
      }
      atual = [...atual, reg.layout]
      publicar(atual)
    }
    setEnviando(null)
    if (entrada.current) entrada.current.value = ''
  }

  async function tirar(l: Layout) {
    if (!regra.pode || enviando) return
    if (!window.confirm('Tirar esta imagem do layout?')) return
    setErro(null)
    const antes = lista
    publicar(lista.filter((x) => x.id !== l.id))
    const r = await removerLayout(ideaId, l.id)
    if (!r.ok) {
      setErro(r.erro)
      publicar(antes)
    }
  }

  async function mover(i: number, passo: -1 | 1) {
    const j = i + passo
    if (!regra.pode || j < 0 || j >= lista.length) return
    setErro(null)
    const antes = lista
    const nova = [...lista]
    ;[nova[i], nova[j]] = [nova[j], nova[i]]
    publicar(nova)
    const r = await ordenarLayouts(
      ideaId,
      nova.map((x) => x.id),
    )
    if (!r.ok) {
      setErro(r.erro)
      publicar(antes)
    }
  }

  const razao = (proporcao && RAZAO[proporcao]) || '4 / 5'

  return (
    <section
      onDragOver={(e) => {
        if (!regra.pode) return
        e.preventDefault()
        setSobre(true)
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        if (!regra.pode) return
        e.preventDefault()
        setSobre(false)
        anexar(Array.from(e.dataTransfer.files))
      }}
      style={{
        marginBottom: 20,
        padding: 14,
        borderRadius: 'var(--r)',
        border: sobre ? '2px dashed var(--accent)' : '1px solid var(--line)',
        background: sobre ? 'var(--accent-wash)' : 'var(--surface-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: lista.length ? 12 : 4 }}>
        <h4
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
            margin: 0,
          }}
        >
          Layout
        </h4>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {lista.length === 0
            ? 'nenhuma imagem ainda'
            : lista.length === 1
              ? '1 imagem'
              : `${lista.length} imagens, na ordem do carrossel`}
        </span>
        {regra.pode && cabe > 0 && (
          <>
            <input
              ref={entrada}
              type="file"
              accept={TIPOS_DE_LAYOUT.join(',')}
              multiple
              hidden
              onChange={(e) => anexar(Array.from(e.target.files ?? []))}
            />
            <button
              onClick={() => entrada.current?.click()}
              disabled={!!enviando}
              style={{ ...botao(lista.length === 0, !!enviando), marginLeft: 'auto' }}
            >
              {enviando ?? (lista.length === 0 ? 'Anexar layout' : 'Anexar mais')}
            </button>
          </>
        )}
      </div>

      {regra.pode && lista.length === 0 && !enviando && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
          Arraste as imagens para cá ou use o botão. JPG, PNG ou WEBP, até 10 MB cada. Para
          carrossel, mande todas: a ordem pode ser ajustada depois.
        </p>
      )}
      {!regra.pode && regra.motivo && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>{regra.motivo}</p>
      )}

      {lista.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))',
            gap: 10,
          }}
        >
          {lista.map((l, i) => (
            <figure key={l.id} style={{ margin: 0, minWidth: 0 }}>
              <a
                href={l.url ?? '#'}
                target="_blank"
                rel="noopener"
                title={l.nome ?? 'abrir em tamanho real'}
                style={{
                  position: 'relative',
                  display: 'block',
                  aspectRatio: razao,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--surface-3)',
                  border: '1px solid var(--line-2)',
                }}
              >
                {l.url && (
                  <img
                    src={l.url}
                    alt={l.nome ?? `imagem ${i + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: 6,
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '1px 7px',
                    borderRadius: 99,
                    background: 'rgba(0,0,0,.6)',
                    color: '#fff',
                  }}
                >
                  {i === 0 ? 'capa' : i + 1}
                </span>
              </a>
              {regra.pode && (
                <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                  <button onClick={() => mover(i, -1)} disabled={i === 0} aria-label="mover para antes" style={mini(i === 0)}>
                    ←
                  </button>
                  <button
                    onClick={() => mover(i, 1)}
                    disabled={i === lista.length - 1}
                    aria-label="mover para depois"
                    style={mini(i === lista.length - 1)}
                  >
                    →
                  </button>
                  <button onClick={() => tirar(l)} aria-label="tirar imagem" style={{ ...mini(false), marginLeft: 'auto', color: 'var(--laranja-tinta)' }}>
                    tirar
                  </button>
                </div>
              )}
            </figure>
          ))}
        </div>
      )}

      {erro && (
        <p style={{ fontSize: 12.5, color: 'var(--laranja-tinta)', marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
          {erro}
        </p>
      )}
    </section>
  )
}

function mini(desligado: boolean): React.CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 11.5,
    fontWeight: 600,
    padding: '2px 8px',
    border: '1px solid var(--line-2)',
    borderRadius: 6,
    background: 'var(--surface)',
    color: 'var(--muted)',
    cursor: desligado ? 'default' : 'pointer',
    opacity: desligado ? 0.4 : 1,
  }
}
