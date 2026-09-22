'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { clienteNavegador } from '@/lib/supabase/client'
import { Avatar, LADO_MAXIMO, LIMITE_DA_FOTO, TIPOS_DE_FOTO } from '@/lib/avatar'
import { prepararFoto, salvarFoto, removerFoto } from './acoes'
import { botao } from '@/lib/visual'

/**
 * A foto de perfil na tela "Minha conta".
 *
 * A imagem é reduzida aqui, no navegador, antes de subir: o maior lado
 * vira 512 pixels e o arquivo sai em JPG. Uma foto de celular de 5 MB
 * vira uns 60 KB, e a tela carrega rápido para todo mundo. Se o
 * navegador não conseguir reduzir, o arquivo original sobe como está.
 */

async function reduzir(arquivo: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(arquivo)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bmp.width, bmp.height))
    const largura = Math.round(bmp.width * escala)
    const altura = Math.round(bmp.height * escala)
    const tela = document.createElement('canvas')
    tela.width = largura
    tela.height = altura
    const ctx = tela.getContext('2d')
    if (!ctx) return arquivo
    ctx.drawImage(bmp, 0, 0, largura, altura)
    bmp.close()
    const menor = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.85))
    return menor ?? arquivo
  } catch {
    return arquivo
  }
}

export function FotoDePerfil({ nome, url }: { nome: string; url: string | null }) {
  const router = useRouter()
  const [atual, setAtual] = useState<string | null>(url)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [indo, comecar] = useTransition()
  const entrada = useRef<HTMLInputElement | null>(null)

  async function escolher(arquivo: File | undefined) {
    if (!arquivo || enviando) return
    setErro(null)
    if (!(TIPOS_DE_FOTO as readonly string[]).includes(arquivo.type)) {
      setErro('Use uma imagem em JPG, PNG ou WEBP.')
      return
    }
    if (arquivo.size > LIMITE_DA_FOTO) {
      setErro('A imagem passa de 2 MB. Escolha outra ou reduza antes.')
      return
    }
    setEnviando(true)
    try {
      const menor = await reduzir(arquivo)
      const tipo = menor.type || arquivo.type
      const prep = await prepararFoto({ tipo, bytes: menor.size })
      if (!prep.ok) {
        setErro(prep.erro)
        return
      }
      const supabase = clienteNavegador()
      const { error } = await supabase.storage
        .from('avatares')
        .upload(prep.caminho, menor, { contentType: tipo, upsert: false, cacheControl: '3600' })
      if (error) {
        setErro('Não consegui enviar a imagem: ' + error.message)
        return
      }
      const r = await salvarFoto(prep.caminho)
      if (!r.ok) {
        setErro(r.erro ?? 'Não consegui guardar a foto.')
        return
      }
      setAtual(URL.createObjectURL(menor))
      comecar(() => router.refresh())
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function tirar() {
    if (enviando || !window.confirm('Tirar a sua foto de perfil?')) return
    setErro(null)
    setEnviando(true)
    const r = await removerFoto()
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro ?? 'Não consegui tirar a foto.')
      return
    }
    setAtual(null)
    comecar(() => router.refresh())
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <Avatar nome={nome} url={atual} tamanho={84} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <input
            ref={entrada}
            type="file"
            accept={TIPOS_DE_FOTO.join(',')}
            hidden
            onChange={(e) => escolher(e.target.files?.[0])}
          />
          <button
            onClick={() => entrada.current?.click()}
            disabled={enviando || indo}
            style={botao(!atual, enviando || indo)}
          >
            {enviando ? 'Enviando…' : atual ? 'Trocar foto' : 'Enviar foto'}
          </button>
          {atual && (
            <button onClick={tirar} disabled={enviando || indo} style={botao(false, enviando || indo)}>
              Tirar foto
            </button>
          )}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.55, marginTop: 8, marginBottom: 0 }}>
          JPG, PNG ou WEBP, até 2 MB. A imagem é reduzida automaticamente e aparece redonda ao lado
          do seu nome.
        </p>
        {erro && (
          <p style={{ color: 'var(--laranja-tinta)', fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>{erro}</p>
        )}
      </div>
    </div>
  )
}
