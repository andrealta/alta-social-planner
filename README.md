# Alta Social Planner

Sistema interno de planejamento de conteúdo de redes sociais da **Alta
Comunicazione** (Ribeirão Preto/SP).

A equipe cadastra a base de conhecimento de cada marca, a IA propõe as
pautas do mês respeitando o escopo contratado, a equipe revisa e escreve
o conteúdo, e o cliente aprova pauta a pauta no portal dele.

---

## Como rodar

Precisa de Node 24+, e de um `.env.local` (veja `.env.example`).

Os arquivos numerados na raiz são atalhos para quem não vive no terminal.
Rode com dois cliques, na ordem, na primeira vez:

| Arquivo | O que faz |
|---|---|
| `00-conferir.cmd` | Confere o `.env.local` sem mostrar nenhum valor |
| `02-instalar.cmd` | `npm install` |
| `04-migrar.cmd` | Aplica as migrações pendentes no Supabase |
| `06-carregar.cmd` | Carrega as marcas iniciais (idempotente) |
| `03-rodar.cmd` | Sobe em `localhost:3000` |
| `05-usuarios.cmd` | Lista pessoas e define papéis |
| `10-seguranca.cmd` | **Confere as travas de segurança no banco de produção** |
| `11-build.cmd` | Compilação de produção |
| `12-git.cmd` | Envia ao GitHub, com trava contra vazar segredo |
| `16-instagram.cmd` | Traz legendas reais do Instagram para a base da marca |
| `17-exportar.cmd` | **Tira o backup completo do banco** |
| `18-concorrentes.cmd` | Varre o Instagram dos concorrentes citados na base |

Diagnóstico, quando algo quebra: `08-testar-ia.cmd` (fala com a API da
Anthropic direto), `09-repetir-pedido.cmd` (repete o último pedido fora
do Next, para separar problema de API de problema de servidor) e
`13-testar-cadastro.cmd` (refaz a criação de pessoa fora do site e
imprime o erro cru do Supabase; apaga o usuário de teste no fim).

`14-espelho.cmd` e `15-aplicar.cmd` existem por uma limitação da ponte
que o assistente usa para ler esta pasta: ela alcança sete níveis de
profundidade, e as telas do calendário estão no oitavo. O `14` copia o
projeto para `_espelho/`, uma pasta rasa com o caminho embutido no nome
do arquivo; o `15` devolve cada arquivo ao lugar certo e confere pelo
resumo criptográfico se chegou idêntico. `_espelho/` fica fora do Git.

### O backup (`17-exportar.cmd`)

Escreve em `backup/AAAA-MM-DD-HHMM/`: um `.json` por tabela — a lista de
tabelas vem do próprio banco, não de uma lista escrita à mão, para que
uma tabela nova entre no backup sozinha — e um `.md` legível por
planejamento, com a leitura do mês, os territórios, o briefing e cada
pauta com conceito, descrição, CTA, legenda, hashtags e cenas. Cada
arquivo é lido de volta depois de escrito, para que o backup não minta.

`backup/` está no `.gitignore`: tem dado de cliente e não entra no Git de
jeito nenhum. **Guarde uma cópia desta pasta fora deste computador** —
um backup que mora no mesmo disco do original protege contra engano, não
contra perda. E rode antes de qualquer migração nova.

### A varredura dos concorrentes (`18-concorrentes.cmd`)

Lê o campo **Concorrentes** da biblioteca da marca, tira dali os @, e
consulta cada um pelo *Business Discovery* da Meta: seguidores, número
de publicações, e das recentes a legenda, curtidas, comentários, data,
formato e link. Guarda em `research_runs` e `research_sources`.

Ele usa um token diferente do `16-instagram.cmd`, e isso é a maior
fonte de confusão aqui: **`IG_TOKEN` começa com `IG` e fala de você;
`META_TOKEN` começa com `EAA` e fala dos concorrentes.** São duas APIs,
dois endereços. O Business Discovery só existe no caminho com login do
Facebook, e esse exige Página do Facebook vinculada.

Limites que valem saber antes de prometer a alguém: só conta
profissional e pública, sem Stories, sem anúncios, sem o texto dos
comentários. E o script **não interpreta** — coleta, conta e guarda.
Interpretar é trabalho da IA na geração do mês, com a base da marca do
lado; script que conclui sozinho vira palpite com cara de número.

### As legendas do Instagram (`16-instagram.cmd`)

Lê as publicações da conta profissional, escolhe as 25 com mais
engajamento (comentário pesa 3×) e grava como amostras de linguagem da
marca, preservando o que foi escrito à mão acima da linha marcadora. No
fim renova o token por mais 60 dias e reescreve o `.env.local` com
cópia `.bak`. O `IG_TOKEN` vive só no `.env.local`: nunca na Vercel,
nunca no Git.

---

## Arquitetura

- **Next.js 16** (App Router) na Vercel, região `gru1` — ao lado do banco.
  O `vercel.json` existe só para isso: por omissão a Vercel roda em
  Washington, e cada consulta atravessaria o continente. **Cuidado: o
  esquema do `vercel.json` recusa qualquer propriedade que não esteja na
  lista da documentação — inclusive uma chave `"//"` usada como
  comentário. JSON não tem comentário; a explicação fica aqui.**
- **Supabase** (Postgres + Auth) em `sa-east-1`.
- **API da Anthropic** (Opus 5) para planejamento, refino e redação.

Sem ORM. As migrações são SQL puro, numeradas, em `supabase/migrations/`,
aplicadas em ordem e registradas no schema `migracoes`. **Migração é
append-only**: nunca edite uma já aplicada; escreva a próxima.

O visual vive em dois lugares e só dois: os tokens de cor, sombra e
tipografia em `src/app/globals.css`, e o vocabulário compartilhado em
`src/lib/visual.ts` (pílulas, pontos, botões, cartões, cor de linha de
produto). Estilo escrito direto no elemento não aceita regra de tela:
**o que precisa mudar no celular tem de estar em classe de CSS**. É por
isso que as páginas usam `className="pagina"` em vez de padding inline,
e os calendários usam `grade-mes`, `dia-cheio`, `dia-vazio` e
`so-celular` — abaixo de 760px o calendário vira uma lista de um dia por
linha, com o dia da semana escrito, e os dias vazios desaparecem.

---

## Segurança — leia antes de mexer

O isolamento entre marcas **não está no código da aplicação**. Está nas
políticas do Postgres. Nenhuma página filtra por marca ou por cliente:
ela pede "as pautas" ao banco, e o banco devolve só o que aquela pessoa
pode ver. Uma consulta esquecida no futuro não vaza, porque não existe
caminho por onde vazar.

Isso tem uma consequência: **toda mudança em `supabase/migrations/` é
mudança de segurança.**

Três papéis: `admin` (todas as marcas, gerencia pessoas), `staff` (as
marcas em que for vinculado) e `client` (só o planejamento já liberado da
própria marca).

Dentro de cada marca, o vínculo tem nível (`brand_members.access`), e
desde a migração 0013 ele **vale**: `viewer` lê e não escreve, `editor`
escreve e aprova internamente, `owner` faz isso e é o único que libera o
mês para o cliente. Quem recusa é a política do banco, mais dois
gatilhos — `plans_guard` e `ideas_envio_guard` — para que trocar a coluna
por fora também não passe. A tela esconde botões; isso é conforto, não
segurança.

Até a 0013 esses três níveis eram só um rótulo gravado que nenhuma regra
lia. Vale registrar o tipo de erro: um controle que parece existir e não
existe é pior do que não ter controle nenhum, porque alguém confia
nele.

Apagar planejamento passa por `apagar_plano()`, e a regra vale no banco
(migração 0018): a **administração** exclui qualquer mês, em qualquer
estado — inclusive depois que o cliente avaliou; a **equipe que edita a
marca** exclui só até o envio ao cliente. Quem só lê não exclui. A tela
repete a regra em `plano/regra.ts` apenas para decidir se o botão
aparece.

Um defeito que a 0018 corrigiu, e que vale lembrar: `content_versions` e
`approvals` são append-only, e a exclusão de um mês apaga as duas em
cascata. Até a 0018, qualquer mês com uma única pauta editada era
impossível de excluir. Agora o histórico cede **só** à cascata do
`apagar_plano` (uma marca na transação + `pg_trigger_depth() > 1`);
um DELETE direto continua recusado, mesmo para a administração.

Apagar pessoa (migração 0016) é só de `admin`, e com duas travas de
gatilho: ninguém apaga a própria conta, e o último administrador não
sai. Vale registrar como isso apareceu: o pedido era "criar o botão de
excluir", e ao abrir o banco a política `profiles_admin_all` já era
`for all` — `all` inclui `delete`. A exclusão já existia pela API,
inclusive a da própria conta e a do único administrador. Faltava a
tela, não a permissão. A migração fecha, não abre.

Pontos que custaram caro para descobrir, e que uma revisão deve olhar:

1. **Escalada de privilégio** (corrigida na 0011). A política que deixa
   cada um editar o próprio perfil também deixava mudar a própria coluna
   `role` — qualquer conta virava admin com uma linha de SQL. RLS não
   distingue coluna; a trava é um gatilho.
2. **`force row level security`** (corrigida na 0012). Três tabelas
   criadas depois da 0002 ficaram com RLS ligada mas não forçada. Sem
   `force`, o dono da tabela ignora as políticas — e este sistema tem
   onze funções `SECURITY DEFINER`, que rodam com os poderes do dono.
3. **As funções `SECURITY DEFINER`** são o núcleo de confiança. Elas
   ignoram o isolamento por desenho, para responder "esta pessoa é da
   equipe?" sem cair em recursão. `10-seguranca.cmd` lista todas.
4. **A chave de serviço** (`SUPABASE_SERVICE_ROLE_KEY`) passa por cima
   de tudo. É usada em um lugar só: criar pessoas, em
   `src/lib/supabase/admin.ts`. Nunca pode ganhar o prefixo
   `NEXT_PUBLIC_`.
5. **`DATABASE_URL` não vai para a Vercel.** Só os scripts locais usam.

Rode `10-seguranca.cmd` depois de qualquer mudança no banco.

---

## Testes

Em `asp/` (fora deste repositório, com quem escreveu) há **147 casos em
SQL** que rodam contra um PostgreSQL local recriado do zero: isolamento
entre marcas, versionamento de pauta, ciclo completo com o cliente,
permissões de pessoas, os níveis de acesso à marca e a exclusão de
planejamento, a varredura de concorrentes e a resposta à pergunta que
mais importa nela: o cliente não vê o que pesquisamos sobre o mercado
dele, a exclusão de pessoa e quem pode ver o nome de quem avaliou. Mais **86 casos em TypeScript** sobre as bibliotecas que não
tocam o banco: `src/lib/estilo.ts` (21), `src/lib/medidas.ts` (24) e
`src/lib/concorrencia.ts` (28) e a regra de exclusão da tela (13). Total: 233.

Eles provam que as regras **funcionam**; `10-seguranca.cmd` prova que
elas **estão lá** em produção. As duas perguntas são diferentes.

---

## O que a IA faz, e o que o código confere

O prompt **pede**; o código **verifica**. Depois de cada resposta da IA,
`src/lib/prompt.ts` confere: a cota de cada linha de produto fecha
exatamente, os dias existem no mês, nenhuma expressão proibida da base
aparece em título, tema, conceito, descrição ou hashtag, e os pesos dos
territórios somam 100. Conteúdo com expressão proibida **não é gravado**,
nem quando veio da IA.

### O ciclo de aprendizado (`src/lib/estilo.ts`)

A cada geração, a IA recebe de volta o que a marca já corrigiu: as
amostras de linguagem da base, os anti-exemplos, as legendas que o
cliente aprovou, **as reescritas da equipe** (a versão arquivada mais
recente de cada pauta contra o texto atual — uma lição por pauta, sempre
contra o texto final, nunca contra um intermediário descartado) e os
pedidos de ajuste do cliente. Amostra com marca de pendência
(`[A PREENCHER`, `[A CONFIRMAR`) é descartada: rascunho nosso não pode
virar exemplo de estilo. Cada amostra entra com no máximo 600
caracteres.

### A concorrência (`src/lib/concorrencia.ts`)

O jeito óbvio de usar a varredura é o errado. Despejar as legendas dos
concorrentes como exemplo faz a IA escrever a média do setor — que é
exatamente o lugar de onde uma agência tira o cliente. O bloco entra
invertido, como restrição:

1. **não repita** o que já aparece em mais de um perfil;
2. **procure o vazio** — o que ninguém está dizendo e esta marca pode
   provar que sabe;
3. **leia o formato** do que rendeu acima da média deles.

E há uma exigência de transparência no fim do bloco: a IA tem de
escrever, na leitura do mês, o que o setor está repetindo e qual brecha
ela escolheu. Sem isso ninguém consegue auditar se a varredura ajudou
ou se só encareceu a geração.

### O crítico (`Avaliar o mês`)

Uma segunda passada da IA sobre o mês já gerado, em
`src/app/api/critica/route.ts`. Ela dá nota e veredito por pauta, diz
por quê e o que arrumar, e grava em `plans.analysis.critica`. Não altera
conteúdo: só aponta. Quem decide é a equipe.

### A medição (`/painel/qualidade`)

"Quanto a IA acerta de primeira", por marca e por mês: quantas pautas
saíram sem nenhuma edição, quantas a equipe reescreveu, quantos refinos
de IA, quantos pedidos do cliente e em quanto tempo ele respondeu. Ao
lado, o **custo**: cada chamada fica registrada em `ai_runs` — inclusive
as que falham — e a página soma por etapa e mostra o dólar por pauta
aprovada. Cerca de US$ 0,60 por mês gerado (Opus 5, com raciocínio).

Número de custo se lê com cuidado: mês com muito refino custa mais e em
geral significa base incompleta, não IA ruim. O rodapé da página explica.
