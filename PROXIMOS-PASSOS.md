# Próximos passos

Este arquivo existe para que nada importante dependa de uma conversa
específica com o Claude. O `README.md` conta o que já foi feito e por
quê; o `COMECE-AQUI.md` explica como trabalhar; este aqui guarda o que
**ainda não foi feito** e as decisões que estão em aberto.

Quem retomar o trabalho, com qualquer Claude e em qualquer computador,
precisa só disto:

> Leia o `README.md` e o `COMECE-AQUI.md` deste projeto. Estamos na
> rodada 93. O que está pendente está no `PROXIMOS-PASSOS.md`.

Mantenha este arquivo vivo: item que entra vira rodada no README e sai
daqui.

---

## Onde o sistema está

Última rodada aplicada: **93**. Migrações até a **0043**.

O sistema está no ar em alta-social-planner.vercel.app, com planejamento
mensal gerado por IA, portal do cliente, aprovação por pauta, plano de
mídia, integração com o Operand, nota sobre o estado das plataformas, e
a página de Precisão com custo em real.

---

## Melhorias combinadas e ainda não feitas

Em ordem de valor por esforço, como discutido:

**1. Criar o conteúdo de todas as pautas do mês de uma vez.**
Hoje a legenda é escrita pauta por pauta. Um botão que percorra o mês
inteiro, com fila, custo estimado visível ANTES de começar, e
recuperação quando uma falha no meio sem derrubar as outras. É o ganho
diário mais direto para a equipe.

**2. Quanto do gasto foi retrabalho.**
A página de Precisão já lista o custo por etapa. Falta a fração que
conecta custo e qualidade num número só: "28% do custo de outubro foi
consertando". Aponta qual marca tem base fraca antes de o cliente
reclamar.

**3. Primeiros passos numa marca nova.**
Um roteiro na página da marca recém-cadastrada, com o próximo passo em
destaque. Precisa incluir "vincule o resto da equipe a esta marca",
porque desde a migração 0042 a marca nova nasce só com quem a criou.

**4. A tela de Plataformas.**
A nota sobre o estado das plataformas alimenta o prompt de todas as
marcas e ninguém da equipe consegue ler. Uma tela para ler a nota, ver
as fontes e a idade dela, mais o agendamento semanal da busca.

**5. Segundo administrador no sistema.**
Hoje o André é o único. Sem ele, ninguém cadastra pessoa, reabre mês
aprovado ou vê a página de custo. É barato e independente de tudo.

**6. A cotação do dólar na rotina diária.**
Uma linha no `22-diario.cmd` chamando `node scripts/cotacao.mjs buscar`,
para a cotação do dia não depender de alguém abrir a página de
Precisão. Sem isso, dias sem acesso ficam sem cotação própria e são
convertidos por aproximação.

---

## Mais antigas, ainda de pé

**Plano de mídia completo.** Memória do que foi investido, verificação,
guardar a proposta da IA separada do que a equipe decidiu, e trazer o
resultado real pela API do Meta.

**O outro lado do Operand.** Hoje o sistema LÊ os jobs. Falta criar job
no Operand quando o cliente aprova uma pauta.

**Trello.** Integração nunca iniciada.

**Arquivos órfãos no storage.** Layout anexado e depois removido deixa
o arquivo no balde. Falta uma varredura.

**Limpeza do `brand_members`.** Mudou de natureza na rodada 86: o
vínculo voltou a valer, então a tabela deixou de ser vestigial. O que
resta é conferir se sobrou linha de gente que saiu da agência.

---

## Colaboração: o que falta fazer

Decidido nas rodadas 91 e 92: o caminho é a Marina ou o Roberto terem o
próprio Claude e o repositório, e trabalharem como o André trabalha.
Não é alguém aprender Next.js.

O que o código já tem: o `AMBIENTE` no `.env.local` com aviso e
confirmação nos scripts perigosos, o `26-ambiente.cmd`, o
`COMECE-AQUI.md`, e o espelho que devolve só o que mudou em vez de
restaurar a fotografia inteira.

**O que falta, e é fora do código:**

- [ ] Criar uma organização nova no Supabase, no plano Free, chamada
      algo como "Alta — desenvolvimento". Ela dá direito a dois
      projetos ativos de graça: um banco por pessoa. Ficar fora da
      organização de produção evita o clique errado na lista.
- [ ] Convidar a pessoa no GitHub (Settings, Collaborators). Repositório
      privado no plano Free aceita colaboradores ilimitados, sem custo.
- [ ] Dar um assento **Viewer** no Vercel, que é grátis e ilimitado, e
      já permite ver e comentar nas prévias. Assento que publica custa
      US$ 20 por mês.
- [ ] Plano Team do Claude, mínimo de dois assentos. **Na contratação,
      marcar "Keep your personal account separate"** se quiser preservar
      as conversas da conta pessoal: sessões do Cowork na web não
      migram, e conteúdo movido para a organização não volta.
- [ ] Mandar as chaves **do banco de desenvolvimento** por gerenciador
      de senhas. Nunca as de produção: a chave de serviço passa por
      cima de todo o isolamento entre clientes.
- [ ] Pedir para a pessoa ler o `COMECE-AQUI.md` inteiro e rodar o
      `26-ambiente.cmd` antes de qualquer outra coisa.

**Quando houver duas pessoas publicando de verdade:** branches e pull
requests, com `.cmd` novos deixando isso tão simples quanto o resto. O
Vercel cria uma prévia com URL própria por branch. Não vale a pena
antes de o atrito aparecer.

---

## Combinados que valem para quem trabalha aqui

Estes não são pendência, são regra. Estão espalhados pelo README e
repetidos aqui porque são os que doem quando se esquece.

- **Antes de pedir qualquer coisa ao Claude:** `git pull`, depois
  `14-espelho.cmd`. Nessa ordem.
- **Nunca** rodar o `06-carregar.cmd` apontando para produção. Ele
  substitui a base de conhecimento das marcas e não há desfazer.
- **Nunca** copiar a pasta inteira do projeto: ela carrega o
  `.env.local` e a pasta `backup`, que tem dado de cliente.
- Chave só por gerenciador de senhas. Nunca em conversa, nunca em
  e-mail.
- Conferência que está falhando se conserta, não se desliga.
- Medir antes de afirmar. Boa parte do que está no README são correções
  de coisas que pareciam óbvias e estavam erradas.
