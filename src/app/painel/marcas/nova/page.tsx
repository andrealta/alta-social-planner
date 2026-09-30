import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { FormularioDeMarca } from './formulario'

/**
 * Abrir uma conta nova.
 *
 * Fica fora da tela de marca de propósito: ali se EDITA uma marca que
 * existe, aqui se cria uma que não existe, e misturar as duas coisas
 * numa tela só é como uma pessoa apaga a marca errada.
 */
export default async function NovaMarca() {
  const supabase = await clienteServidor()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role !== 'admin') redirect('/painel')

  return (
    <main className="pagina-equipe">
      <Link href="/painel" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
        ← Painel
      </Link>

      <header style={{ marginTop: 12, paddingBottom: 18, borderBottom: '2px solid var(--text)' }}>
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
          Administração
        </div>
        <h1 style={{ fontFamily: 'var(--disp)', fontSize: 34, fontWeight: 600, lineHeight: 1.08 }}>
          Nova marca
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
          A marca entra vazia: nome, endereço e o escopo contratado. A base dela, que é o
          que a IA lê para planejar, você escreve na tela da marca depois, com calma.
        </p>
      </header>

      <div style={{ marginTop: 26 }}>
        <FormularioDeMarca />
      </div>

      <section
        style={{
          marginTop: 34,
          padding: '14px 18px',
          border: '1px solid var(--line)',
          borderLeft: '3px solid var(--accent)',
          borderRadius: '0 var(--r) var(--r) 0',
          background: 'var(--surface-2)',
          fontSize: 13.5,
          lineHeight: 1.65,
          color: 'var(--muted)',
          maxWidth: 620,
        }}
      >
        <b style={{ color: 'var(--text)' }}>Depois de criar</b>
        <div style={{ marginTop: 6 }}>
          Preencha a base na tela da marca, vincule as pessoas em Pessoas, e, se a marca
          tiver conta no Operand, faça a ligação pelo 20-operand.cmd. A ligação com o
          Operand continua fora do site de propósito: o segredo de acesso dele nunca
          precisa viajar para a nuvem.
        </div>
      </section>
    </main>
  )
}
