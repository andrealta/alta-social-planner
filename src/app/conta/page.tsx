import Link from 'next/link'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { TrocarSenha } from './senha'

/**
 * Minha conta: quem sou eu no sistema, e a troca da própria senha.
 *
 * Serve para a equipe e para o cliente. Existe porque a senha
 * temporária que a administração gera no cadastro precisa ser trocada
 * pela pessoa — enquanto não for, alguém além dela sabe qual é.
 */
export default async function MinhaConta() {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('name, email, role')
    .eq('id', user.id)
    .maybeSingle()

  const cliente = (perfil?.role as string) === 'client' || !perfil
  const voltar = cliente ? '/cliente' : '/painel'

  return (
    <main className="pagina" style={{ maxWidth: 640 }}>
      <Link href={voltar} style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
        ← Voltar
      </Link>

      <header style={{ marginTop: 12, marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: '-.02em',
          }}
        >
          Minha conta
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          {(perfil?.name as string) ?? ''}
          {perfil?.name ? ' · ' : ''}
          {(perfil?.email as string) ?? user.email}
        </p>
      </header>

      <section
        style={{
          padding: '22px 24px',
          borderRadius: 'var(--r-lg)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <h2 style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
          Trocar senha
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
          Se você recebeu uma senha temporária, troque por uma sua. Ninguém da Alta fica sabendo
          qual é.
        </p>
        <TrocarSenha />
      </section>

      <p style={{ color: 'var(--faint)', fontSize: 12.5, lineHeight: 1.6, marginTop: 18 }}>
        Para mudar o seu nome ou e-mail, fale com a administração da Alta.
      </p>
    </main>
  )
}
