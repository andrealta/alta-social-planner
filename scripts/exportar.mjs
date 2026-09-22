/**
 * Backup: tira tudo do banco e põe na sua máquina.
 *
 * POR QUE ISSO EXISTE, E POR QUE É O ITEM MAIS URGENTE DA LISTA
 *
 * Hoje o sistema inteiro mora em duas contas — Supabase e Vercel — e
 * o trabalho de meses mora numa delas. Base de marca escrita à mão,
 * planejamentos, pautas, legendas, histórico de versão, aprovações do
 * cliente. Se aquela conta sumir, for suspensa por cobrança, ou se
 * alguém apagar a tabela errada num domingo, não existe cópia.
 *
 * O Supabase faz backup do lado dele, e isso ajuda — mas backup que
 * você não tem na mão não é backup seu. Este script resolve o caso
 * simples e mais provável de todos: alguém precisa do trabalho de
 * volta e a conta não responde.
 *
 * O QUE ELE GRAVA
 *
 *   backup/AAAA-MM-DD-HHMM/
 *     dados/<tabela>.json      todas as tabelas, uma a uma
 *     planejamentos/*.md       cada mês em texto que se lê sem sistema
 *     LEIA-ME.txt              o que é isto e como usar
 *
 * Os dois formatos existem por razões diferentes. O JSON é para
 * recolocar no banco. O markdown é para o caso em que ninguém vai
 * recolocar nada: o cliente pediu o planejamento de março e o sistema
 * está fora do ar.
 *
 * Nada de segredo sai aqui: chave de API e senha moram no .env.local
 * e na Vercel, não no banco.
 *
 * Uso:
 *   node scripts/exportar.mjs
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

function lerEnvLocal() {
  const caminho = join(raiz, '.env.local')
  if (!existsSync(caminho)) return {}
  const out = {}
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue
    const i = linha.indexOf('=')
    if (i < 0) continue
    let v = linha.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[linha.slice(0, i).trim()] = v
  }
  return out
}

const env = { ...lerEnvLocal(), ...process.env }
const url = env.DATABASE_URL
if (!url || url.includes('[YOUR-PASSWORD]')) {
  console.error('ERRO: DATABASE_URL ausente ou incompleta no .env.local.')
  process.exit(1)
}

const agora = new Date()
const marca = (n) => String(n).padStart(2, '0')
const nomePasta =
  `${agora.getFullYear()}-${marca(agora.getMonth() + 1)}-${marca(agora.getDate())}` +
  `-${marca(agora.getHours())}${marca(agora.getMinutes())}`
const destino = join(raiz, 'backup', nomePasta)
mkdirSync(join(destino, 'dados'), { recursive: true })
mkdirSync(join(destino, 'planejamentos'), { recursive: true })

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const linha = '--------------------------------------------------------'
console.log('')
console.log(linha)
console.log(' Backup do Alta Social Planner')
console.log(' ' + agora.toLocaleString('pt-BR'))
console.log(linha)
console.log('')
console.log('  destino   backup\\' + nomePasta)
console.log('')

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: url.includes('localhost') ? false : 'require',
})

let falhou = false
const resumo = []

try {
  // ---------- 1. todas as tabelas, sem lista fixa ----------
  //
  // De propósito sem lista escrita à mão: tabela criada amanhã entra
  // no backup sem ninguém lembrar de acrescentar aqui. Lista fixa é
  // como backup deixa de cobrir a coisa nova.
  const tabelas = await sql`
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not like '\\_\\_drizzle%'
    order by tablename
  `

  console.log(linha)
  console.log(' 1. Tabelas')
  console.log(linha)
  console.log('')

  for (const { tablename } of tabelas) {
    const linhas = await sql.unsafe(`select * from "${tablename}"`)
    const arquivo = join(destino, 'dados', `${tablename}.json`)
    writeFileSync(arquivo, JSON.stringify(linhas, null, 1), 'utf8')

    // Conferência: relê o que acabou de gravar. Backup que ninguém
    // verifica é backup que se descobre vazio no pior dia possível.
    const devolta = JSON.parse(readFileSync(arquivo, 'utf8'))
    const ok = Array.isArray(devolta) && devolta.length === linhas.length
    if (!ok) falhou = true

    resumo.push({ tabela: tablename, linhas: linhas.length, bytes: statSync(arquivo).size, ok })
    console.log(
      `  ${ok ? ' ' : 'X'} ${tablename.padEnd(24)} ${String(linhas.length).padStart(5)} linha(s)`,
    )
  }
  console.log('')

  // ---------- 2. os planejamentos em texto ----------
  console.log(linha)
  console.log(' 2. Planejamentos em texto, para ler sem o sistema')
  console.log(linha)
  console.log('')

  const planos = await sql`
    select p.id, p.month, p.year, p.status, i.briefing, i.analysis,
           p.client_released_at, p.approved_at, p.investimento_total,
           b.name as marca, b.slug
    from plans p join brands b on b.id = p.brand_id
    -- Briefing e análise moram em plano_interno desde a migração 0022.
    left join plano_interno i on i.plan_id = p.id
    order by b.name, p.year desc, p.month desc
  `

  for (const plano of planos) {
    const pautas = await sql`
      select ci.title, ci.theme, ci.concept, ci.description, ci.editorial_line,
             ci.objective, ci.rationale, ci.cta, ci.status, ci.current_version,
             ci.meta_objetivo, ci.meta_investimento, ci.meta_justificativa,
             s.label as linha_produto,
             c.platform, c.format, c.scheduled_date,
             k.caption, k.hashtags, k.art_concept, k.image_prompt, k.scenes
      from content_ideas ci
      left join brand_scope s on s.id = ci.scope_id
      left join content_channels c on c.idea_id = ci.id
      left join idea_content k on k.idea_id = ci.id
      where ci.plan_id = ${plano.id}
      order by c.scheduled_date nulls last, ci.position
    `

    const analise = plano.analysis ?? {}
    const nome = `${plano.slug}-${plano.year}-${marca(plano.month)}.md`
    const partes = []

    partes.push(`# ${plano.marca}: ${MESES[plano.month - 1]} de ${plano.year}`)
    partes.push('')
    partes.push(`Situação: ${plano.status}`)
    if (plano.client_released_at) {
      partes.push(`Enviado ao cliente em ${new Date(plano.client_released_at).toLocaleString('pt-BR')}`)
    }
    if (plano.approved_at) {
      partes.push(`Aprovado por completo em ${new Date(plano.approved_at).toLocaleString('pt-BR')}`)
    }
    partes.push(`Exportado em ${agora.toLocaleString('pt-BR')}`)
    partes.push('')

    if (analise.leitura) {
      partes.push('## Leitura do mês')
      partes.push('')
      partes.push(String(analise.leitura))
      partes.push('')
    }

    if (Array.isArray(analise.territorios) && analise.territorios.length > 0) {
      partes.push('## Territórios')
      partes.push('')
      for (const t of analise.territorios) {
        partes.push(`- **${t.nome}**: ${t.peso}%${t.novo ? ' · novo' : ''}${t.cobre ? ` · ${t.cobre}` : ''}`)
      }
      partes.push('')
    }

    if (plano.briefing) {
      partes.push('## Obrigatoriedades informadas')
      partes.push('')
      partes.push(String(plano.briefing))
      partes.push('')
    }

    if (Number(plano.investimento_total ?? 0) > 0) {
      const soma = pautas.reduce((a, p) => a + Number(p.meta_investimento ?? 0), 0)
      partes.push('## Investimento em mídia')
      partes.push('')
      partes.push(
        `Verba do mês: R$ ${Number(plano.investimento_total).toFixed(2)} · ` +
          `distribuído nas publicações: R$ ${soma.toFixed(2)}`,
      )
      partes.push('')
    }

    partes.push(`## ${pautas.length === 1 ? 'A pauta' : 'As ' + pautas.length + ' pautas'}`)
    partes.push('')

    for (const [i, p] of pautas.entries()) {
      const dia = p.scheduled_date ? String(p.scheduled_date).slice(0, 10) : 'sem data'
      partes.push(`### ${i + 1}. ${p.title}`)
      partes.push('')
      partes.push(
        `${dia} · ${p.linha_produto ?? 'sem linha'} · ${p.format ?? 'sem formato'}` +
          `${p.platform ? ' · ' + p.platform : ''} · ${p.status} · versão ${p.current_version}`,
      )
      partes.push('')
      if (p.editorial_line) partes.push(`**Pilar:** ${p.editorial_line}`)
      if (p.theme) partes.push(`**Tema:** ${p.theme}`)
      if (p.objective) partes.push(`**Objetivo:** ${p.objective}`)
      if (p.concept) {
        partes.push('')
        partes.push(`**Conceito:** ${p.concept}`)
      }
      if (p.description) {
        partes.push('')
        partes.push(`**Descrição:** ${p.description}`)
      }
      if (p.cta) partes.push(`**CTA:** ${p.cta}`)
      if (p.rationale) {
        partes.push('')
        partes.push(`**Justificativa:** ${p.rationale}`)
      }
      if (Number(p.meta_investimento ?? 0) > 0 || p.meta_objetivo) {
        partes.push('')
        partes.push(
          `**Impulsionamento:** ${p.meta_objetivo ?? 'objetivo a definir'}` +
            `${Number(p.meta_investimento ?? 0) > 0 ? ` · R$ ${Number(p.meta_investimento).toFixed(2)}` : ' · sem verba'}` +
            `${p.meta_justificativa ? ` · ${p.meta_justificativa}` : ''}`,
        )
      }
      if (p.caption) {
        partes.push('')
        partes.push('**Legenda:**')
        partes.push('')
        partes.push('> ' + String(p.caption).split('\n').join('\n> '))
        if (Array.isArray(p.hashtags) && p.hashtags.length > 0) {
          partes.push('')
          partes.push(p.hashtags.join(' '))
        }
      }
      if (p.art_concept) {
        partes.push('')
        partes.push(`**Direção de arte:** ${p.art_concept}`)
      }
      if (Array.isArray(p.scenes) && p.scenes.length > 0) {
        partes.push('')
        partes.push('**Cenas:**')
        for (const c of p.scenes) {
          partes.push(`- ${c.t ?? ''} ${c.descricao ?? ''}${c.chave ? ' *(cena-chave)*' : ''}`)
        }
      }
      partes.push('')
      partes.push('---')
      partes.push('')
    }

    writeFileSync(join(destino, 'planejamentos', nome), partes.join('\n'), 'utf8')
    console.log(`  ${nome.padEnd(34)} ${String(pautas.length).padStart(3)} pauta(s)`)
  }
  if (planos.length === 0) console.log('  (nenhum planejamento ainda)')
  console.log('')

  // ---------- 3. o leia-me ----------
  const totalLinhas = resumo.reduce((s, r) => s + r.linhas, 0)
  const leiaMe = [
    'BACKUP DO ALTA SOCIAL PLANNER',
    `Gerado em ${agora.toLocaleString('pt-BR')}`,
    '',
    'O QUE TEM AQUI',
    '',
    `  dados\\          ${resumo.length} arquivos, um por tabela do banco, ${totalLinhas} linhas no total.`,
    '                  Formato JSON. Serve para recolocar no banco.',
    '',
    `  planejamentos\\  ${planos.length} arquivo(s) de texto, um por mes de cada marca.`,
    '                  Abre em qualquer editor. Serve para o caso em que',
    '                  ninguem vai recolocar nada e alguem so precisa do',
    '                  planejamento em maos.',
    '',
    'O QUE NAO TEM AQUI',
    '',
    '  Nenhuma senha, nenhuma chave de API. Essas coisas ficam no',
    '  .env.local desta pasta e nas variaveis da Vercel — nunca no banco.',
    '  Um backup que vaza nao entrega acesso a nada.',
    '',
    'COMO USAR SE O PIOR ACONTECER',
    '',
    '  Para ler o trabalho: abra a pasta planejamentos. E so texto.',
    '',
    '  Para reconstruir o sistema: as migracoes em supabase\\migrations',
    '  recriam o banco vazio, e os arquivos de dados\\ recolocam o',
    '  conteudo, na ordem em que as tabelas se referenciam. Isso e',
    '  trabalho de quem programa — nao tente no aperto sem ajuda.',
    '',
    'COM QUE FREQUENCIA RODAR',
    '',
    '  Depois de cada mes gerado e aprovado, no minimo. Custa segundos.',
    '  Esta pasta fica fora do Git de proposito: ela tem dado de cliente.',
    '  Guarde uma copia fora desta maquina — pendrive, nuvem, qualquer',
    '  lugar que nao seja o mesmo disco.',
    '',
  ].join('\r\n')
  writeFileSync(join(destino, 'LEIA-ME.txt'), leiaMe, 'utf8')

  // ---------- 4. conferência final ----------
  console.log(linha)
  console.log(' 3. Conferencia')
  console.log(linha)
  console.log('')

  const bytes = resumo.reduce((s, r) => s + r.bytes, 0)
  const problemas = resumo.filter((r) => !r.ok)
  const vazias = resumo.filter((r) => r.linhas === 0).map((r) => r.tabela)

  console.log(`  ${resumo.length} tabelas · ${totalLinhas} linhas · ${(bytes / 1024).toFixed(0)} KB`)
  console.log(`  ${planos.length} planejamento(s) em texto`)
  console.log('')
  if (vazias.length > 0) {
    console.log('  Tabelas vazias (normal se a funcao nunca foi usada):')
    console.log('  ' + vazias.join(', '))
    console.log('')
  }
  if (problemas.length > 0) {
    falhou = true
    console.log('  PROBLEMA ao reler: ' + problemas.map((p) => p.tabela).join(', '))
  } else {
    console.log('  Todos os arquivos foram relidos e conferidos.')
  }
} catch (e) {
  falhou = true
  console.error('\nFALHOU: ' + (e && e.message ? e.message : String(e)))
} finally {
  await sql.end({ timeout: 5 })
}

console.log('')
console.log(linha)
console.log(falhou ? ' fim - COM PROBLEMA' : ' fim - backup completo')
console.log(linha)
console.log('')
if (!falhou) {
  console.log('  Guarde uma copia desta pasta fora deste computador.')
  console.log('')
}
process.exit(falhou ? 1 : 0)
