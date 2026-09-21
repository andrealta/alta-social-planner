import { mesTitulado } from '@/lib/prompt'
import { DIAS_CURTOS, ICONE_PECA, semanasDoMes, tipoDaPeca } from '@/lib/visual'
import { duracao } from '@/lib/medidas'
import { carregarMesDoCliente } from '../dados'
import type { PautaCliente } from '../avaliacao'
import { Imprimir } from './imprimir'

/**
 * O planejamento do mês em forma de documento.
 *
 * É o papel que o cliente encaminha ao diretor, leva para a reunião,
 * arquiva. Por isso ele não herda nada do tema da tela: fundo sempre
 * branco, cores sempre as do modo claro, mesmo para quem usa o sistema
 * no escuro. Documento não tem modo escuro.
 *
 * Os dados vêm do mesmo lugar que o portal (`../dados.ts`), para o PDF
 * nunca dizer uma coisa e a tela outra.
 */

// As cores das linhas de produto, fixas no claro. São as mesmas do
// globals.css; ficam repetidas aqui de propósito, porque no escuro as
// variáveis mudam e o PDF não pode mudar junto.
const COR_LINHA = ['#0891B2', '#B02A5B', '#A1670F', '#5B21B6']
const corLinha = (i: number | null) => (i !== null && i >= 0 && i < 4 ? COR_LINHA[i] : '#6B7480')

const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  sent_to_client: { rotulo: 'Aguardando avaliação', cor: '#2502D0' },
  client_changes_requested: { rotulo: 'Alteração pedida', cor: '#C8391F' },
  client_approved: { rotulo: 'Aprovada', cor: '#0F7B52' },
}

function quando(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dataCurta(p: PautaCliente) {
  if (!p.data) return 'sem data'
  const d = new Date(p.data + 'T12:00:00')
  return `${p.data.slice(8, 10)}/${p.data.slice(5, 7)} · ${DIAS_CURTOS[d.getDay()]}`
}

const CSS = `
  @page { size: A4; margin: 14mm 13mm 16mm; }

  .pdf {
    --tinta: #1D2530; --meio: #5B6470; --claro: #9AA3AF; --fio: #E3E8EF; --fundo: #F6F8FB;
    color: var(--tinta);
    background: #fff;
    max-width: 820px;
    margin: 0 auto;
    padding: 28px 28px 60px;
    font-size: 12.5px;
    line-height: 1.55;
  }
  .pdf h1, .pdf h2, .pdf h3 { font-family: var(--disp); letter-spacing: -.015em; }

  .barra-pdf {
    position: sticky; top: 0; z-index: 5;
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    padding: 12px 16px; margin: 0 auto 8px; max-width: 820px;
    background: #FFF8D1; color: #1D2530; border-radius: 10px;
    font-size: 13.5px; line-height: 1.5;
  }
  .botao-pdf {
    font: inherit; font-weight: 600; font-size: 13px;
    padding: 8px 15px; border-radius: 99px; cursor: pointer;
    border: 1px solid #C9D1DB; background: #fff; color: #1D2530; text-decoration: none;
  }
  .botao-pdf.forte { background: #2502D0; border-color: #2502D0; color: #fff; }

  .capa { padding: 8px 0 22px; border-bottom: 2px solid var(--tinta); margin-bottom: 22px; }
  .capa .selo { width: 10px; height: 38px; border-radius: 3px; float: left; margin-right: 14px; }
  .capa h1 { font-size: 28px; font-weight: 600; line-height: 1.1; }
  .capa .sub { color: var(--meio); font-size: 14px; margin-top: 3px; }
  .resumo { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 16px; clear: both; font-size: 12px; color: var(--meio); }
  .resumo b { color: var(--tinta); font-size: 18px; font-family: var(--disp); display: block; line-height: 1.1; }

  .legenda { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: var(--meio); margin: 0 0 10px; }
  .legenda i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: 0; }

  .titulo-secao {
    font-family: var(--disp); font-size: 10.5px; font-weight: 600; letter-spacing: .16em;
    text-transform: uppercase; color: var(--claro); margin: 0 0 10px;
  }

  .grade { display: grid; grid-template-columns: repeat(7, 1fr); border: 1px solid var(--fio); border-radius: 8px; overflow: hidden; }
  .grade .cab { background: var(--fundo); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--claro); padding: 5px 6px; border-bottom: 1px solid var(--fio); }
  .grade .dia { min-height: 78px; padding: 5px 5px 6px; border-right: 1px solid var(--fio); border-bottom: 1px solid var(--fio); }
  .grade .dia:nth-child(7n) { border-right: none; }
  .grade .vazio { background: #FBFCFD; }
  .grade .num { font-size: 10.5px; font-weight: 700; color: var(--claro); margin-bottom: 3px; }
  .grade .peca {
    font-size: 9.6px; line-height: 1.3; padding: 2px 0 2px 5px; margin-bottom: 3px;
    border-left: 3px solid; overflow: hidden;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  }

  .pauta { break-inside: avoid; page-break-inside: avoid; padding: 16px 0 14px; border-top: 1px solid var(--fio); }
  .pauta .meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 11px; color: var(--meio); margin-bottom: 4px; }
  .pauta .etq { padding: 1px 8px; border-radius: 99px; background: var(--fundo); }
  .pauta .etq i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 5px; }
  .pauta h3 { font-size: 16px; font-weight: 600; line-height: 1.25; margin: 2px 0 6px; }
  .pauta .conceito { font-size: 13px; margin-bottom: 4px; }
  .pauta .descricao { color: var(--meio); margin-bottom: 8px; }
  .pauta .bloco { margin-top: 8px; }
  .pauta .rot { font-size: 9.5px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; color: var(--claro); margin-bottom: 2px; }
  .pauta .legenda-texto { white-space: pre-wrap; background: var(--fundo); padding: 9px 11px; border-radius: 6px; }
  .pauta .hashtags { color: var(--meio); font-size: 11.5px; margin-top: 4px; }
  .pauta .cena { display: flex; gap: 10px; }
  .pauta .cena span:first-child { color: var(--claro); min-width: 42px; font-weight: 600; }
  .pauta .decisao { margin-top: 10px; font-size: 11.5px; }

  .rodape { margin-top: 26px; padding-top: 10px; border-top: 1px solid var(--fio); font-size: 10.5px; color: var(--claro); }

  @media print {
    html, body { background: #fff !important; }
    .nao-imprime { display: none !important; }
    .pdf { padding: 0; max-width: none; }
    .quebra { break-before: page; page-break-before: always; }
    a { color: inherit; text-decoration: none; }
  }
  @media screen {
    body { background: #E9EDF2 !important; }
    .pdf { background: #fff; border-radius: 12px; box-shadow: 0 10px 40px -20px rgba(0,0,0,.25); margin-bottom: 40px; }
  }
`

export default async function PdfDoMes({
  params,
}: {
  params: Promise<{ slug: string; ano: string; mes: string }>
}) {
  const { slug, ano: anoTexto, mes: mesTexto } = await params
  const { ano, mes, marca, pautas, estrategia } = await carregarMesDoCliente(slug, anoTexto, mesTexto)

  const nomeDoMes = `${mesTitulado(mes)} de ${ano}`
  const cor = marca.cor ?? '#2502D0'
  const semanas = semanasDoMes(ano, mes)

  const doDia = new Map<number, PautaCliente[]>()
  for (const p of pautas) {
    if (!p.data) continue
    const [a, m, d] = p.data.split('-').map(Number)
    if (a !== ano || m !== mes) continue
    const lista = doDia.get(d) ?? []
    lista.push(p)
    doDia.set(d, lista)
  }

  // As linhas de produto que aparecem neste mês, na ordem do contrato.
  const linhas = new Map<number, string>()
  for (const p of pautas) {
    if (p.linha && p.linhaIndice !== null) linhas.set(p.linhaIndice, p.linha)
  }

  const aprovadas = pautas.filter((p) => p.status === 'client_approved').length
  const pedidas = pautas.filter((p) => p.status === 'client_changes_requested').length
  const aguardando = pautas.length - aprovadas - pedidas

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ padding: '14px 12px 0' }} className="nao-imprime">
        <Imprimir
          titulo={`Planejamento ${marca.nome} - ${nomeDoMes}`}
          voltar={`/cliente/${slug}/${ano}/${mes}`}
        />
      </div>

      <article className="pdf">
        <header className="capa">
          <div className="selo" style={{ background: cor }} aria-hidden />
          <h1>{marca.nome}</h1>
          <div className="sub">Planejamento de conteúdo · {nomeDoMes}</div>
          <div className="resumo">
            <div>
              <b>{pautas.length}</b>publicações
            </div>
            <div>
              <b>{aprovadas}</b>aprovadas
            </div>
            {pedidas > 0 && (
              <div>
                <b>{pedidas}</b>com alteração pedida
              </div>
            )}
            {aguardando > 0 && (
              <div>
                <b>{aguardando}</b>aguardando avaliação
              </div>
            )}
          </div>
        </header>

        {estrategia && (
          <section style={{ marginBottom: 22 }}>
            <h2 className="titulo-secao">A estratégia deste mês</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{estrategia}</p>
          </section>
        )}

        <section>
          <h2 className="titulo-secao">Calendário</h2>
          {linhas.size > 0 && (
            <div className="legenda">
              {[...linhas.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([i, nome]) => (
                  <span key={i}>
                    <i style={{ background: corLinha(i) }} />
                    {nome}
                  </span>
                ))}
            </div>
          )}
          <div className="grade">
            {DIAS_CURTOS.map((d) => (
              <div key={d} className="cab">
                {d}
              </div>
            ))}
            {semanas.flat().map((dia, i) =>
              dia === null ? (
                <div key={'v' + i} className="dia vazio" />
              ) : (
                <div key={dia} className="dia">
                  <div className="num">{dia}</div>
                  {(doDia.get(dia) ?? []).map((p) => (
                    <div key={p.id} className="peca" style={{ borderColor: corLinha(p.linhaIndice) }}>
                      {ICONE_PECA[tipoDaPeca(p.formato)]} {p.title}
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>
        </section>

        <section className="quebra" style={{ marginTop: 26 }}>
          <h2 className="titulo-secao">As publicações, uma a uma</h2>

          {pautas.map((p) => {
            const tipo = tipoDaPeca(p.formato)
            const s = SITUACAO[p.status] ?? SITUACAO.sent_to_client
            const ultima = p.decisoes[0]
            return (
              <div key={p.id} className="pauta">
                <div className="meta">
                  <b style={{ color: 'var(--tinta)' }}>{dataCurta(p)}</b>
                  {p.linha && (
                    <span className="etq">
                      <i style={{ background: corLinha(p.linhaIndice) }} />
                      {p.linha}
                    </span>
                  )}
                  <span className="etq">
                    {ICONE_PECA[tipo]} {tipo}
                    {p.formato && tipo.toLowerCase() !== p.formato.toLowerCase() ? ` · ${p.formato}` : ''}
                  </span>
                  {p.plataforma && <span className="etq">{p.plataforma}</span>}
                  <span style={{ marginLeft: 'auto', fontWeight: 700, color: s.cor }}>{s.rotulo}</span>
                </div>

                <h3>{p.title}</h3>
                {p.concept && <p className="conceito">{p.concept}</p>}
                {p.description && <p className="descricao">{p.description}</p>}

                {p.caption && (
                  <div className="bloco">
                    <div className="rot">Legenda</div>
                    <div className="legenda-texto">{p.caption}</div>
                    {p.hashtags.length > 0 && <div className="hashtags">{p.hashtags.join(' ')}</div>}
                  </div>
                )}

                {p.art_concept && (
                  <div className="bloco">
                    <div className="rot">Ideia de imagem</div>
                    <div style={{ color: 'var(--meio)' }}>{p.art_concept}</div>
                  </div>
                )}

                {p.cenas.length > 0 && (
                  <div className="bloco">
                    <div className="rot">Cenas</div>
                    {p.cenas.map((c, i) => (
                      <div key={i} className="cena">
                        <span>{c.t}</span>
                        <span>{c.descricao}</span>
                      </div>
                    ))}
                  </div>
                )}

                {p.cta && (
                  <div className="bloco">
                    <div className="rot">Chamada para ação</div>
                    <div>{p.cta}</div>
                  </div>
                )}

                {ultima && (
                  <div className="decisao" style={{ color: 'var(--meio)' }}>
                    {ultima.decisao === 'approved' ? 'Aprovada' : 'Alteração pedida'} por{' '}
                    <b style={{ color: 'var(--tinta)' }}>{ultima.autor ?? 'cliente'}</b> em{' '}
                    {quando(ultima.created_at)}
                    {duracao(ultima.segundos) && ` · respondeu em ${duracao(ultima.segundos)}`}.
                  </div>
                )}
              </div>
            )
          })}
        </section>

        <footer className="rodape">
          {marca.nome} · {nomeDoMes} · gerado em{' '}
          {new Date().toLocaleDateString('pt-BR')} · Alta Comunicazione
        </footer>
      </article>
    </>
  )
}
