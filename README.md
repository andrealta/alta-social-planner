# Alta Social Planner

Sistema interno de planejamento de conteúdo de redes sociais da **Alta
Comunicazione** (Ribeirão Preto/SP).

A equipe cadastra a base de conhecimento de cada marca, a IA propõe as
pautas do mês respeitando o escopo contratado, a equipe revisa e escreve
o conteúdo, e o cliente aprova pauta a pauta no portal dele.

### Para quem chega agora

Três coisas explicam quase todas as decisões deste projeto, e nenhuma
delas é óbvia olhando o código:

1. **O isolamento entre marcas mora no banco, não na aplicação.** Nenhuma
   página filtra por marca. Se você está prestes a escrever um `.eq()`
   por segurança, pare e leia a seção de segurança primeiro.
2. **O prompt pede, o código confere.** Tudo que a IA devolve passa por
   verificação antes de ser gravado, e o que não passa não entra. Regra
   nova no prompt sem conferência no código é regra que vale às vezes.
3. **Cada fonte que alimenta a IA entra com o enquadramento do que ela
   NÃO prova.** Concorrência entra como restrição, não como exemplo.
   Produção mede capacidade, não sucesso. Pesquisa muda a forma, não a
   razão. É aí que mora a diferença entre um planejamento defensável e um
   texto bonito.

E uma regra de escrita que vale para tudo que a IA gera: **sem travessão**
(ver `src/lib/travessao.ts`, que limpa depois da conferência).

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
| `19-restaurar-custos.cmd` | Devolve, a partir dos backups, o custo de meses excluídos antes da 0019 |
| `20-operand.cmd` | **O Operand**: menu com dezesseis opções. Veja a seção abaixo |
| `21-agendar.cmd` | Cria a tarefa do Windows que sincroniza o Operand todo dia |
| `22-diario.cmd` | O que a tarefa chama. Rodar na mão também funciona |
| `23-marca.cmd` | Cria uma marca nova pela linha de comando (a tela faz o mesmo) |
| `24-plataformas.cmd` | **O estado das plataformas**: o que mudou no Meta e nos outros |

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

### Criar uma marca

Pelo painel, em **+ nova marca**, só para quem administra. Pede nome,
endereço curto e as cotas mensais; a base fica vazia de propósito, para
ser escrita na tela da marca por quem conhece a conta. Base preenchida às
pressas parece pronta e ninguém volta para conferir.

**Editar depois** é na mesma tela de Marcas, no botão *editar*: nome,
segmento e cor juntos, só para a administração. Antes disso nenhum dos
três se editava pela interface, e um erro de digitação no nome ficava
para sempre, aparecendo no portal do cliente. O endereço curto continua
sem edição, e é decisão, não esquecimento: ele está em todo link que a
equipe já salvou, no comando do Operand e no endereço que o cliente
recebeu por e-mail. Trocar quebraria os três de uma vez e em silêncio.

`23-marca.cmd` faz o mesmo pela linha de comando. As duas usam a mesma
validação (`src/lib/marca.ts`), e há um teste que importa a função de
slug das duas cópias e compara resultado a resultado: elas precisam ser
gêmeas e não há como uma importar a outra.

### Administrar marcas (`/painel/marcas`, migração 0036)

Item **Marcas** no menu, só para quem administra. É onde se alteram as
cotas mensais, se arquiva, se reabre e se apaga, e onde fica o registro
de quem fez o quê.

**As cotas moram num lugar só.** Antes elas apareciam também na base da
marca, e a seção da base se chamava "Escopo contratado" igual ao campo do
cadastro: não era campo duplicado, era nome repetido, que é pior, porque
parece que dá na mesma preencher num ou noutro. A seção da base virou
**Canais e formatos** e continua com as regras de canal, os formatos e o
que está fora do escopo, que é o material que alimenta a geração. As
cotas, que são restrição dura (a IA fecha exatamente aqueles números),
passaram a existir só aqui. Na tela da marca elas aparecem como número,
com um link *alterar cotas* para quem administra.

**Arquivar e apagar são decisões diferentes.** Arquivar resolve o caso
comum, que é contrato encerrado: a marca some das listas, para de gerar
planejamento, o cliente perde o acesso ao portal, e nada é apagado.
Apagar leva junto, em cascata, planejamentos, pautas, conteúdos,
aprovações, arquivos, a cópia do Operand e o histórico de custo; o backup
é diário, então desfazer pode custar um dia de trabalho de todo mundo.
Por isso **só se apaga o que já foi arquivado**, e um gatilho no banco
garante essa ordem mesmo que alguém chame a exclusão por fora da tela. O
segundo passo ainda pede o endereço curto digitado à mão, e mostra antes
quantos planejamentos, pautas, vínculos e jobs vão embora.

Esse gatilho mudou o comportamento de todo mundo que apaga marca:
**dois testes antigos quebraram** no dia em que a 0036 entrou, os dois
que provavam que apagar a marca leva a cópia do Operand junto. A correção
foi arquivar antes de apagar, dentro do próprio teste. Vale saber disto
antes de escrever qualquer rotina que apague marca.

**O registro (`registro_admin`) sobrevive ao que registra.** A tabela não
tem chave estrangeira para `brands` de propósito: um log que some junto
com a marca apagada não serve para a única pergunta que importa depois,
que é quem apagou. O nome de quem fez é copiado, não referenciado, porque
a pessoa pode sair da agência e ter o cadastro apagado. E o registro não
se altera nem se apaga, nem por quem administra: `update` e `delete`
foram revogados na migração. Log que se edita não é log.

A linha só entra se a ação já tiver acontecido, e falhar ao escrevê-la
nunca desfaz a ação: uma marca arquivada com registro perdido é ruim, mas
melhor que uma marca que não arquivou porque o log estava fora do ar. A
tela avisa quando isso acontece.

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

## O Operand

O Operand é o sistema onde a agência controla a produção. Ele sabe o que
foi feito, quando e quanto custou de trabalho; o planner sabe o que foi
planejado e o que o cliente aprovou. Eram duas verdades em dois lugares.

**O Operand não tem tela aqui, e isso é uma decisão.** A produção não
aparece no calendário nem em painel nenhum. O que ela faz é alimentar a
base da marca: o que a agência REALMENTE produziu vira insumo do prompt,
ao lado da base, do estilo, dos concorrentes e do histórico.

### Por que a sincronização mora fora do site

`scripts/operand.mjs` conversa com a API; o site só lê a cópia em
`operand_jobs`. Duas razões, e as duas valem a separação:

- o segredo de acesso do Operand nunca precisa viajar para a Vercel;
- o mês do cliente não pode depender de um sistema de terceiro estar no
  ar na hora em que alguém abre o calendário. Faltando sincronização, a
  tela mostra dado de ontem **avisando que é de ontem**.

### Como marca e cadastro se ligam (migrações 0029, 0033, 0035)

Os dois formatos reais apareceram no uso, e nenhum dos dois é "um para
um". `operand_ligacao` é muitos para muitos porque a realidade é:

| Caso | Exemplo | Como se resolve |
|---|---|---|
| Várias marcas num cadastro | A conta da fabricante abriga Queensberry e Hero | `linhas`: o começo do título diz de quem é o job. `!Hero Brasil` exclui |
| Uma marca em vários cadastros | Habiarte, um cadastro por empreendimento | Vários números na ligação, ou um **padrão de nome** |

O **padrão de nome** (`brands.operand_padrao`) existe porque ligação
feita a mão envelhece: o próximo empreendimento entra no Operand e fica
invisível aqui, sem ninguém perceber. Com o padrão, cadastro novo que
casa entra sozinho, **gravado** e marcado como automático. Gravar em vez
de resolver na hora é o que permite auditar e desfazer. Cadastro
desativado fica de fora do padrão; quem quiser um liga a mão, e ligação
manual nenhum padrão mexe.

### Duas coisas que custaram caro para descobrir

**Qual campo é o job.** A resposta traz `id` e `itemId` e a documentação
não diz qual é qual. Adivinhar deu errado duas vezes. O que resolveu foi
medir: cada job declara quantas tarefas tem, e a rota
`/beta/jobs/<n>/tasks` devolve as tarefas de `<n>`. O número certo é o
que faz as duas contas baterem, e é o `id`. A opção 11 do menu refaz
essa medição se um dia a API mudar.

**Data em branco.** O banco por trás do Operand guarda data vazia como
`0000-00-00`, que passa em qualquer teste de formato e não existe no
calendário. Ela derrubou a primeira sincronização inteira com "Invalid
time value" e, antes disso, cegou o filtro de recência. Toda data entra
por `ehDataDeVerdade`.

### O retrato de produção (`scripts/operand-perfil.mjs`, migração 0034)

Lê os jobs copiados e escreve, **em português**, o que a agência produziu
para a marca: volume típico por mês, formatos e quanto cada um custa,
assuntos recorrentes, influenciadores, frentes, datas comemorativas. Esse
texto vai para `operand_perfil.resumo` e daí para o prompt.

Texto e não JSON de propósito: é o que o modelo lê melhor **e** o que uma
pessoa consegue conferir antes de deixar aquilo influenciar planejamento.

Quatro decisões dentro dele que não são óbvias:

- **O trabalho é separado em quatro naturezas**: conteúdo para o público,
  comunicação interna do cliente (SIPAT, aniversariantes), anúncio de
  vaga e administrativo. As três últimas não devem inspirar pauta de rede
  social, e o texto diz isso. Sem separar, a IA proporia pauta inspirada
  na semana de prevenção de acidentes.
- **Custo típico é mediana, e ignora quem não apontou.** Média se deforma
  com um job de 86 horas, e zero hora quase sempre quer dizer "ninguém
  apontou", não "não deu trabalho".
- **Volume típico é a mediana dos meses já vividos**, não a média do
  período. O período cobre até um ano à frente, porque job aberto hoje
  pode ter prazo longe, e a média diluía 33 por mês em 20. Quem dimensiona
  equipe com o número errado erra para menos.
- **Título que não diz o formato não é uma categoria.** Aparece como "sem
  formato no título", com o aviso de que não se conclui nada dali. Numa
  conta cujo contrato é "redes sociais", o título nomeia o assunto.

O vocabulário de formato é **da agência, não da indústria**. As regras
nasceram lendo títulos de uma marca de alimentos e 89% das peças de uma
construtora caíram em "outros". Quando o comando avisa que muitas peças
não encaixaram, ele mostra exemplos: a correção é feita com prova, não
por adivinhação.

### O menu (`20-operand.cmd`)

Dezesseis opções, e a ordem delas conta uma história: 1 a 4 diagnosticam
a conexão, 5 a 8 ligam marca e cadastro, 9 a 13 trazem e resumem o
trabalho, 14 a 16 são os atalhos do dia a dia. Para uma marca nova o
caminho é **5** (achar o cadastro), **12** (ver as linhas dele) e **14**
(ligar, sincronizar e montar o retrato de uma vez). As opções 2, 3, 4 e
11 existem para quando algo quebrar, e cada uma responde a uma pergunta
diferente sobre onde quebrou.

Depois disso, `21-agendar.cmd` uma vez e ninguém mais toca: a tarefa roda
todo dia às 6h40 e deixa o resultado em `operand-diario.txt`. **Se essa
tarefa não existir, os retratos envelhecem em silêncio**, e é a falha mais
provável desta parte do sistema, porque nada avisa.

---

## Como a tela responde ao mouse

Estava tudo parado: botão, linha de lista e cartão clicável não davam
sinal nenhum sob o cursor, e quem usava só descobria o que era clicável
clicando.

**A dificuldade, e ela explica o desenho todo:** quase todo botão do
projeto monta o próprio estilo em objeto inline, e estilo inline vence
regra de folha. `button:hover { background: X }` não faz nada, porque o
`background` inline ganha.

Por isso a resposta não é trocar cor, é pôr uma camada por cima. O
`::after` pinta o elemento inteiro com a **cor do próprio texto** a 7%.
Em botão claro com tinta escura isso escurece; em botão escuro com tinta
clara isso clareia. Um pedaço de CSS só, que se adapta sozinho, que
continua valendo no modo escuro, e que nenhuma tela precisa saber que
existe.

Quatro regras, em `globals.css`, e nenhum arquivo de tela foi tocado:

| O quê | Como reage | Como o CSS acha |
|---|---|---|
| Botão | camada de 7% | `button:not(:disabled)` |
| Link com cara de botão | camada de 7% | `a[href][style*='background']` |
| Link de texto | sublinha | `a[href]:not([style*='background'])` |
| Linha de lista clicável | fundo muda | `li:has(> a[href])` |

O truque do meio é o que vale registrar: **a diferença entre um link de
texto e um botão está escrita no atributo `style`**. Botão tem fundo,
texto não. Ler isso com `[style*='background']` separa os dois sem
nenhuma tela precisar marcar nada, e sem o link de voltar ganhar uma
caixa em volta.

O sublinhado do link de texto usa `!important`, e é o único lugar do
projeto que usa. Não é preguiça: vários links trazem
`text-decoration: none` no inline para não ficarem sublinhados parados, e
`!important` na folha é a única coisa que vence inline. O seletor é
estreito de propósito: um estado, um tipo de link, uma propriedade.

**O foco pelo teclado já existia e estava quebrado num lugar só.** A
regra do anel azul está no CSS desde o começo e funcionava em botão e em
link. Só os campos de texto não mostravam nada, porque sete lugares
traziam `outline: 'none'` no estilo inline, e inline vence folha. Aquilo
não ganhava nada: o anel só aparece em `:focus-visible`, ou seja, nunca
depois de um clique de mouse. Os sete saíram, e preencher uma base
inteira pelo teclado deixou de ser às cegas. **Não reponha o
`outline: 'none'`**: a linha está comentada em `lib/visual.ts`.

Cartão clicável inteiro pede `.cartao-clicavel`, que levanta dois pixels
e adensa a sombra. É a única marcação manual, e é de propósito: cartão
que só mostra informação fica parado, e essa diferença é o que ensina
onde dá para clicar.

Quem escolheu computador sem animação (`prefers-reduced-motion`) não
recebe movimento nenhum. A mudança de cor fica: ela é informação.

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

**A permissão da equipe mudou de eixo na migração 0028.** Antes era por
marca: a mesma pessoa podia ser `owner` numa e `viewer` noutra. Hoje é
por ÁREA e vale na agência inteira: quem é da Alta enxerga todas as
marcas, e o que se concede é o direito de ALTERAR cada parte (`base`,
`planejamento`, `conteudo`, `midia`, `cliente`). Quem recusa continua
sendo a política do banco, mais os gatilhos `plans_guard`,
`ideas_envio_guard`, `midia_guard` e `investimento_guard`, para que
trocar a coluna por fora também não passe. A tela esconde botões; isso é
conforto, não segurança.

Duas armadilhas dessa migração, registradas porque custaram caro:

- **RLS protege linha, não coluna.** "Pode mexer no investimento mas não
  no conteúdo" não se escreve em política: precisa de gatilho comparando
  OLD e NEW, ou de tirar a coluna da tabela. A mesma frase explica todo
  o caminho das vistas do cliente, logo abaixo.
- **Políticas permissivas se somam.** Duas políticas `FOR ALL` esquecidas
  (`idea_content_staff_all`, `assets_staff_all`) davam escrita a qualquer
  pessoa da equipe e anulavam a separação inteira, em silêncio. Só
  apareceram porque um teste falhou. A 0028 termina com um bloco que
  **recusa a migração** se alguma política assim voltar.

### O cliente lê vistas, nunca tabelas (migrações 0027 e 0037)

É a consequência prática da frase acima. Enquanto o cliente lesse uma
tabela direto, a política dizia QUAIS linhas ele via, e dentro da linha
vinham TODAS as colunas, aparecessem ou não na tela. Bastava abrir o
console do navegador com a sessão dele e pedir.

A 0027 fechou `content_ideas` e `idea_content` e pôs `pautas_do_cliente`
e `conteudo_do_cliente` no lugar. A 0037 fechou as três que sobravam:

| Tabela | O que escondia | Vista |
|---|---|---|
| `brands` | `competitors`, a lista de concorrentes que a agência monta e varre | `marcas_do_cliente` |
| `brand_scope` | `notes`, a anotação interna de cada linha do escopo | `escopo_do_cliente` |
| `approvals` | as decisões de quem não é o cliente | `decisoes_do_cliente` |

O ganho não é esconder três campos: é que **coluna nova nasce invisível
para o cliente**. Para aparecer, alguém precisa escrever o nome dela
dentro da vista. O padrão passou a ser fechado, e é isso que evita o
mesmo buraco no próximo campo interno que alguém criar.

Duas coisas que vale saber antes de mexer:

- **Todo `from` dos arquivos em `src/app/cliente/` é de vista.** Se você
  escrever `.from('brands')` ali, a consulta volta vazia e a página some,
  porque a tabela não tem mais política de leitura para ele. Não é um bug
  a contornar: é a trava funcionando.
- **Em `approvals` não havia o que vazar ainda.** A única coisa que grava
  nessa tabela é `decidir_pauta`, e ela grava sempre do lado do cliente;
  a aprovação interna da equipe hoje só muda o status da pauta. A porta
  estava aberta e ninguém tinha passado por ela. Fechar antes é barato,
  e o dia em que a primeira decisão de equipe for gravada ela apareceria
  no portal como "aprovada por alguém da sua equipe", que além de
  vazamento é informação errada.

O `10-seguranca.cmd` confere as cinco vistas, a ausência das colunas
internas dentro delas e a ausência de política de leitura de cliente nas
cinco tabelas. É a diferença entre provar que a regra **funciona** (os
testes) e provar que ela **está lá** em produção.

Uma correção que veio junto e que vale registrar: a seção 4 desse mesmo
script acusava FALHA em `decidir_pauta` desde a 0027, porque a lista de
funções esperadas continuou dizendo que ela deveria rodar como quem
chama. A 0027 a tornou `SECURITY DEFINER` de propósito, e a lista nunca
foi atualizada. **Conferência que acusa o que está certo é pior que
conferência nenhuma**, porque ensina a passar o olho pela lista, e no dia
em que a falha for de verdade ninguém olha.

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

E o custo não vai junto (migração 0019). Até ela, `ai_runs.plan_id` era
`on delete cascade`: excluir um mês apagava o registro do que a IA
custou para gerá-lo, e a página de Precisão mostrava menos do que foi
gasto. Agora a exclusão carimba as chamadas daquele mês
(`plano_excluido_em`, `plano_mes`, `plano_ano`) e só solta o vínculo.

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

Em `asp/` (fora deste repositório, com quem escreveu) há **397 casos em
SQL** que rodam contra um PostgreSQL local recriado do zero: isolamento
entre marcas, versionamento de pauta, ciclo completo com o cliente,
permissões de pessoas, exclusão de planejamento e de pessoa, a varredura
de concorrentes e a resposta à pergunta que mais importa nela (o cliente
não vê o que pesquisamos sobre o mercado dele), as vistas que fecharam
`content_ideas` ao cliente, o investimento em mídia, a cópia do Operand,
o arquivamento de marca com o registro de quem mexeu, as três últimas
colunas internas que o cliente alcançava e a aprovação da nota de
plataformas.

Mais **695 casos em TypeScript e JavaScript** sobre o que não toca o
banco. Os maiores: o retrato de produção (189), o cliente da API do
Operand (171), a tela do Operand (34), as medidas (46), o estilo (30), a
concorrência (28), o bloco de produção no prompt (29), a marca nova (44 e
23), a pesquisa na internet (26), o texto de apoio (25), a mídia (23), a
administração de marcas (17) e o estado das plataformas (36 e 25).

Total: **1092**.

Um padrão que vale imitar: quase todo teste novo destas últimas rodadas
nasceu de um erro real, e o comentário acima dele diz qual foi. Teste que
não conta o que impede vira linha a ser apagada na primeira refatoração.

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

### O que a agência já produziu (`src/lib/producao.ts`)

O retrato do Operand entra no prompt do planejamento, da criação de
conteúdo e do refino. É o bloco mais fácil de usar errado, porque traz
número concreto sobre o passado, e número concreto tem uma autoridade que
o resto do contexto não tem: é fácil ler "esta marca fez 83 vídeos" como
"vídeo funciona aqui".

Por isso o bloco entra dizendo quatro coisas, e cada uma existe por um
jeito diferente de errar: é **uma fonte entre várias**; serve para
**capacidade e vocabulário**; **ausência não é proibição** (formato que
nunca apareceu pode nunca ter sido tentado, e propor inédito é permitido
desde que se diga); e **não é prova de que funciona**, porque o sistema
de produção registra esforço e entrega, nunca resultado.

Retrato com mais de 45 dias se declara desatualizado em vez de sumir.
Dado velho declarado vale mais que nenhum dado. Marca sem Operand ligado
devolve nulo e o mês é gerado como sempre foi.

### A pesquisa na internet (`src/lib/pesquisa.ts`)

Ligada em toda geração de planejamento. Até cinco buscas, em dois
assuntos e só dois: datas e sazonalidade do setor naquele mês, e
referência de formato. Notícia do setor e movimento de concorrente ficam
de fora por decisão da agência.

A regra central é uma frase, e está em maiúsculas dentro do prompt:

> O que você achar pode mudar COMO uma peça é feita, nunca POR QUE ela
> existe.

A razão de existir de cada pauta continua saindo da base. "Está em alta"
não é âncora, e justificativa apoiada nisso é rejeitada. Um formato
encontrado só entra numa pauta que já se justificava sem ele.

Isso não é excesso de zelo: uma agência vende o contrário da média do
setor, e deixar um modelo planejar a partir do que achou pesquisando é a
maneira mais rápida de produzir o mês que qualquer concorrente
produziria, com ar de fundamentado porque veio com link.

**A auditoria é parte da funcionalidade.** Sem ela, uma afirmação vinda da
internet fica indistinguível de uma inventada. A tela do planejamento
mostra o que a IA disse ter tirado de cada página, com link, e, num
detalhe recolhido, todas as páginas que a API registrou que ela leu. A
divergência entre as duas listas é o que dá para conferir.

Pesquisa que não muda nada é resultado legítimo, e a tela diz isso em vez
de ficar em silêncio.

Custo: US$ 0,01 por busca mais os tokens dos resultados, somados no mesmo
número que já aparecia. Separar faria o planejamento parecer mais barato
do que foi.

### O que mudou nas plataformas (`24-plataformas.cmd`, migração 0038)

A pergunta "o que o Meta mudou" e a pergunta "o que performa melhor"
parecem a mesma e não são, e essa distinção é o arquivo inteiro.

A primeira é fato: um formato novo, um objetivo aposentado, um limite de
duração que mudou. Tem data, tem link, e a fonte autorizada é a própria
plataforma. A segunda não é fato sobre o mundo: depende da oferta, da
conta e do público, e a internet sobre esse assunto é quase toda blog de
agência reciclando blog de agência. Jogar isso no prompt deixaria a
sugestão **mais confiante sem deixar mais correta**, que é pior que não
ter nada.

Então o comando busca só a primeira, e busca **travado nas fontes de
primeira mão** de cada plataforma (`about.fb.com`,
`business.instagram.com`, `newsroom.tiktok.com` e as outras). Ele
pergunta ao próprio banco quais plataformas a agência usa e não gasta
busca com as que ninguém publica.

**Por que a lista branca aqui e não na pesquisa da geração.** Parece
contradição com `lib/pesquisa.ts`, que documenta o contrário, e não é.
Lá a pergunta é aberta (o que é sazonal, o que está circulando) e o
conjunto de boas fontes não dá para escrever de antemão: uma lista branca
envelheceria e passaria a esconder o que ninguém lembrou de listar. Aqui
a pergunta é fechada, existe uma fonte autorizada por plataforma, e a
lista não é um palpite sobre qualidade: é a definição da pergunta.

**A nota nasce pendente.** Ela entra no prompt de todos os planejamentos
de todas as marcas, então é o texto de maior alcance do sistema: nota
errada não estraga uma peça, estraga o mês de todo mundo. Alguém lê e
aprova antes de ela valer, e a geração ignora nota pendente. O texto
aprovado é o texto que vale: um gatilho recusa reescrever o conteúdo
depois da aprovação, senão "aprovada" não queria dizer nada.

Rodar toda semana. A resposta mais comum é "nada relevante mudou", e ela
é um resultado, não uma falha: o bloco do prompt diz isso em letras para
o modelo não forçar menção a plataforma nenhuma. A nota também se anuncia
velha depois de 45 dias, porque uma apuração de oito meses continua
entrando em todo planejamento e nada nela denunciaria isso.

As mesmas duas listas da pesquisa: o que a IA diz que usou e o que a API
diz que foi lido. Endereço citado que não aparece em leitura nenhuma vira
aviso na tela antes de você aprovar.

**Três coisas que a primeira corrida de verdade ensinou**, e que a 0039
corrigiu:

- **Resposta cortada virou nota.** O teto de tokens estava em quatro mil,
  a resposta bateu nele e voltou partida no meio de uma palavra, com o
  JSON sem fechar. O script guardou o pedaço, que é o certo (a busca já
  foi paga), e nada impedia aprovar aquilo. Hoje a nota quebrada nasce
  marcada e **o banco recusa aprová-la**. Aviso impresso rola para fora
  da tela; trava, não.
- **A lista de plataformas vinha da declaração, não do uso.** Ela unia
  `content_channels` com `brand_platforms`, e a segunda é aspiração que
  envelhece: a corrida leu 19 páginas de LinkedIn para uma agência cujo
  trabalho é quase todo Instagram, e custou US$ 1,32. Agora manda o que
  já foi planejado, e a declaração só entra quando não há planejamento
  nenhum.
- **A nota falava de coisa que não muda o trabalho.** Recurso de quem
  assiste, plano de assinatura, evento da plataforma. A pergunta ficou
  exata ("o que mudou no que a agência pode entregar?"), com teto de oito
  itens e os setores dos clientes no pedido, para regra de categoria que
  nenhum deles toca não entrar.

E uma quarta, da corrida seguinte: **a nota seguia quem anunciou mais
novidade, não onde o trabalho acontece.** O TikTok, com uma peça
planejada, ganhou três itens; o Instagram, com 145, ganhou um. Hoje o
volume de cada plataforma vai escrito no pedido, e plataforma com pouco
trabalho ganha no máximo uma linha e uma busca. Vale registrar o erro de
diagnóstico junto: eu tinha suposto que o LinkedIn fosse resquício
aspiracional na base e filtrei por uso, e não era, eles publicam mesmo.
O filtro estava certo e não resolvia nada, porque o problema era peso, e
não presença.

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

### Estratégia do mês e feedback do cliente (migração 0021)

A **leitura do mês** que a IA escreve é interna: cita concorrentes e a
brecha escolhida. O cliente lê outra coisa — `plans.estrategia_cliente`,
que a equipe escreve (pode partir da leitura com um clique) e publica.
Vazia, o portal não mostra o bloco.

O **feedback do mês** (`feedback_mes`) é do cliente: o que funcionou e o
que merece atenção. Uma ficha por pessoa por mês, editável por ela; a
equipe lê e não escreve em nome dele. As três fichas mais recentes
entram no prompt (`lib/estilo.ts`), com os pontos de atenção tratados
como regra.

O **status geral** da tela inicial do cliente (`lib/status.ts`) é só
conta sobre o que o banco já tem. As "alterações mais pedidas" saem de
um classificador por palavra-chave, transparente e sem custo — não de IA.

### Reabrir o que o cliente já aprovou (migração 0040)

Mês aprovado não é mês congelado. A agência remarca uma data, o cliente
pede uma pauta a mais, a vida acontece. O que não pode é a mudança passar
por baixo do cliente: ele aprovou aquilo e tem de ser perguntado de novo.

A regra é de banco, não de tela. `reabrir_pauta(pauta, motivo, tipo)`
é o único caminho para uma peça sair de `client_approved`. Ela exige:

- **motivo escrito**, que vira um comentário visível para o cliente, na
  conversa daquela pauta. Ele não descobre a mudança pelo calendário;
- **`pode_enviar_ao_cliente`** na marca, para os dois tipos (data e
  conteúdo), porque reabrir é literalmente colocar a peça na frente dele;
- **`dono_do_mes`** — administrador ou quem criou o planejamento — a
  mais, quando o que muda é conteúdo.

O `content_ideas_guard` continua recusando o `UPDATE` direto. A única
brecha é o sinalizador de transação `app.reabrindo`, que só a função
liga. Quem tentar pela mão leva a exceção com o nome da função no texto.

**Dois erros que os testes acharam e vale não repetir.** O primeiro:
`sync_plan_approval` zerava `approved_at` mas deixava `plans.status` em
`approved`. O mês ficava com cara de aprovado e data de aprovação vazia,
e metade do sistema lê um campo, metade lê o outro. Agora o status volta
para `internal_review` ou `sent_to_client` conforme o que sobrou em pé.
O segundo: o gatilho só ouvia `insert` e `update of status`. Quem
reabrisse o mês com uma pauta nova e depois apagasse essa pauta deixava
o mês reaberto para sempre, sem nada pendente. Hoje ouve `delete` também
e usa `coalesce(new.plan_id, old.plan_id)`.

**A autorização que eu tinha errado.** A primeira versão deixava
qualquer pessoa da equipe remarcar data, e o gatilho de 0013 recusou. O
gatilho estava certo: remarcar reabre, reabrir manda ao cliente, e mandar
ao cliente tem dono. A regra mudou, o gatilho ficou.

Na tela, arrastar uma pauta aprovada não move nada: o calendário desfaz
o arrasto e abre uma caixa amarela pedindo o motivo, com o nome da peça
escrito e a frase que importa — as outras peças do mês continuam
aprovadas. Só essa volta a pedir resposta.

### Pauta nova num mês que já existe (migração 0041)

A 0040 abriu esta porta sem querer. O gatilho `sync_plan_approval`
dispara no INSERT, então uma pauta nova num mês aprovado já derrubava a
aprovação do mês. O que faltava era a tranca: até aqui, qualquer pessoa
da equipe com permissão de planejamento inseria pauta em qualquer mês,
aprovado ou não, e o cliente só descobriria abrindo o portal.

`adicionar_pauta()` é agora o único caminho, e o gatilho
`pauta_em_mes_aprovado_trg` recusa o insert direto num mês aprovado.
Num mês ainda em andamento, acrescentar é trabalho normal: equipe com
acesso de edição e permissão de conteúdo. Num mês aprovado, pede os
mesmos dois degraus da reabertura — `pode_enviar_ao_cliente` e
`dono_do_mes` — mais um motivo escrito, que vira comentário visível na
conversa daquela pauta. A pauta nasce em revisão interna, o mês volta
para a equipe, e o cliente decide de novo só sobre ela.

Na tela, "Nova pauta" abre um formulário com título, conceito, linha,
data e canal. O botão **Preencher com IA** manda uma linha de briefing
e devolve o rascunho PARA O FORMULÁRIO: não grava nada. É de propósito.
Acrescentar pauta a um mês aprovado obriga o cliente a decidir outra
vez, e essa decisão não pode sair de um clique sem ninguém ter lido o
que saiu. Quem assina a pauta é quem a leu.

O prompt (`src/lib/pauta.ts`) recebe o mês inteiro, e recebe como
RESTRIÇÃO, não como exemplo. Dar as pautas existentes como exemplo faria
a IA escrever a décima sexta variação da mesma ideia, que é o que a
equipe não precisa de ajuda para fazer. Ele diz: não repita, não imite o
tom da lista, encaixe no que falta. E lista os dias do mês que ainda não
têm publicação, senão a peça nova se empilha em cima de uma existente.

**Dois defeitos antigos que apareceram no caminho.**

O primeiro estava na conta de custo. A rota `/api/conteudo` grava
`agent: 'content_refine'` quando a equipe pede alteração de legenda à
IA, e esse valor **nunca existiu** no enum `ai_agent`. O insert falhava,
o código ignora o erro da gravação do registro, e a chamada seguia
normal. Resultado: todo refino de conteúdo rodou sem registro, e a
página de custo vinha somando menos do que a agência gastou. O
`lib/medidas.ts` já tinha até o rótulo em português dessa etapa,
esperando linhas que nunca chegaram. A 0041 acrescenta o valor, e um
teste passa a conferir que toda etapa que o código grava existe no enum
— é esse teste que impede o próximo sumiço silencioso.

O segundo a própria funcionalidade criava. A medida de Precisão responde
"de cada cem pautas que a IA escreveu, quantas passaram sem ninguém
reescrever". Pauta escrita à mão chega na versão 1 e sem versão
arquivada, exatamente como uma pauta que a IA acertou de primeira: ela
entraria na conta como acerto da IA e empurraria a medida para cima sem
a IA ter feito nada. A coluna `content_ideas.origem` ('ia' ou 'equipe')
separa as duas, e o denominador da Precisão passou a ser só as da IA. A
coluna de pautas do mês continua contando todas.

Uma observação que custou um teste: desde a 0028, o nível de uma pessoa
da equipe numa marca vem das PERMISSÕES dela, não mais do
`brand_members`. Quem não tem 'conteudo' nem 'cliente' é leitor em toda
marca, por mais que a linha em `brand_members` diga outra coisa.

### A permissão diz o quê, a marca diz onde (migração 0042)

A 0028 trocou o modelo de acesso inteiro, de propósito e documentado:
ler virou global para a equipe, e escrever passou a vir das permissões.
O efeito colateral que ela não disse em voz alta é que
`pode_editar_marca(b)` passou a **ignorar o parâmetro `b`**. Quem tinha
a permissão de conteúdo editava todas as marcas, inclusive as que nunca
tinha aberto. O vínculo com a marca, para a equipe, deixou de
significar qualquer coisa.

A tela de Pessoas continuou com o seletor por marca, e com a explicação
de cada nível ao lado. Medido: alguém marcado como "só lê" numa marca
editava aquela marca normalmente. Esse é o pior defeito que uma tela de
permissão pode ter, porque ninguém vai conferir uma trava que a tela
afirma estar fechada.

A regra agora é uma frase: **a permissão diz O QUE a pessoa faz, o
vínculo com a marca diz ONDE.** Vale o menor dos dois. Permissão sem
vínculo não altera nada; vínculo sem permissão também não.

**Ler continua global.** O argumento da 0028 segue de pé: numa agência,
consultar o mês passado de outra conta é trabalho normal, e a trava que
importa, que é o cliente não ver o que não é dele, não muda em nada.
Quem não tem vínculo numa marca lê e não altera.

**Nada estreita sozinho.** Ligar a regra e mais nada trancaria para
fora, de uma vez, todo mundo que trabalha numa marca sem linha em
`brand_members` — e a pessoa descobriria tentando salvar. Pior: desde a
0028 a tela gravava `editor` em toda marca marcada, sem oferecer
escolha, então quem tem a permissão de enviar ao cliente teria perdido
o envio por causa de um valor que nunca foi decisão de ninguém. Por
isso a migração coloca cada pessoa da equipe, em toda marca viva, no
nível que as permissões dela já davam na prática. O dia seguinte é
igual ao dia anterior. **Estreitar é decisão de gente, na tela de
Pessoas** — que a partir de agora diz a verdade sobre o que faz.

**Marca nova nasce com dono.** Sem isso, quem cadastra uma marca não
consegue escrever nela: ela nasceria sem vínculo nenhum. Quem cria vira
responsável; o resto da equipe o administrador acrescenta. É deliberado
que a marca nova não saia liberada para a equipe inteira — era assim
quando o vínculo não valia, e é justamente o que se está consertando.

Duas consequências que vale registrar. A primeira: as mensagens que as
rodadas 84 e 85 escreveram ("só quem é responsável por esta marca pode
remarcar / acrescentar pauta") estavam erradas quando foram escritas e
passaram a estar certas com esta migração. A segunda: "só lê" saiu da
lista de vínculos da equipe, porque ele e "sem vínculo" passaram a ser
a mesma coisa — a equipe lê tudo de qualquer jeito, e duas opções com o
mesmo efeito só fazem a pessoa procurar a diferença.

O arquivo órfão `src/app/painel/marca/[slug]/cor.tsx` foi apagado nesta
rodada, junto com a `definirCor` que só ele chamava. A escolha de cor
mora na tela de cadastro da marca desde a rodada 82. O `16-limpar.cmd`
apaga os dois arquivos, porque o espelho só escreve, nunca apaga.

### "Auth session missing!" ao trocar a senha (rodada 87)

Um usuário com senha temporária tentou trocá-la e leu, em inglês, na
primeira tela que usou no sistema: *Não consegui trocar a senha: Auth
session missing!*

A causa estava na própria conferência da senha atual. Para saber se a
senha digitada confere, a função faz um login "de teste" num cliente
separado, que não grava cookie, e em seguida encerrava esse login. O
problema é que **`signOut()` do Supabase usa escopo GLOBAL por
padrão**: ele não encerra a sessão de teste, encerra TODAS as sessões
daquela pessoa, inclusive a do navegador dela, que estava ali do lado
esperando para trocar a senha. Está escrito na documentação dentro do
próprio pacote instalado: *"By default, signOut() uses the global
scope, which signs out the user on every device they are signed in
on"*.

O estrago aparecia na linha seguinte. Com o refresh token revogado, o
`updateUser` tentava renovar a sessão do cookie, não conseguia, apagava
a sessão e devolvia `AuthSessionMissingError`, cuja mensagem é
exatamente "Auth session missing!".

Por que não apareceu antes: o Supabase considera a sessão vencida
alguns minutos ANTES da hora (`EXPIRY_MARGIN_MS`), e só nesse caso o
`getSession` tenta renovar. Quem tinha acabado de entrar trocava a
senha normalmente; quem estava logado havia um tempo batia no erro. É o
tipo de defeito que passa em qualquer teste feito logo depois de
entrar.

A correção é `{ scope: 'local' }`, que encerra só a sessão de teste.

O mesmo padrão estava no botão **Sair**, com a mesma consequência e
sem ninguém ter reclamado ainda: sair no computador da agência
derrubava a sessão do celular junto, e um cliente que saísse do celular
perderia a janela aberta no computador no meio de uma aprovação. Também
virou `local`, que é o que a documentação do pacote recomenda para
botão de sair.

Junto, a tradução das mensagens de erro saiu da ação de servidor para
`src/lib/senha.ts`, com teste. A regra é que nenhuma frase do Supabase
chegue crua à tela sem algo que a pessoa possa fazer a respeito, e que
erro desconhecido continue mostrando o texto original no fim — senão
vira "não consegui" e ninguém descobre o porquê.

### O espelho aprende a apagar (rodada 88)

A rodada 86 removeu a função `definirCor` e deixou no projeto o arquivo
órfão que a chamava. O espelho sabe escrever e não sabia apagar, então
a remoção virou um script avulso, `16-limpar.cmd`, que precisava ser
rodado entre o `15-aplicar.cmd` e o `11-build.cmd`. Não foi rodado. A
compilação quebrou, e quebrou de novo no Vercel.

O defeito não foi o script não ter sido rodado. Foi eu ter feito a
compilação depender de um passo que alguém precisa lembrar, e ainda ter
numerado o arquivo como `16` quando já existia um `16-instagram.cmd`.
Passo que depende de memória não é um passo, é uma armadilha com
contagem regressiva.

Agora uma rodada que precisa remover arquivos manda junto um
`_espelho/_apagar.txt`: um caminho por linha, relativo à raiz, com
barra normal, `#` para comentário. O `15-aplicar.cmd` grava o que tem
de gravar e, no fim, apaga o que a lista pede. Sem passo extra.

Três decisões que valem o registro:

**A cópia espelhada sai junto, sem ser pedida.** Apagar só o arquivo do
projeto deixaria a cópia em `_espelho/`, e o `voltar` seguinte o
ressuscitaria. Seria a mesma armadilha com outra roupa.

**Apagar é a última coisa que o script faz.** Se a gravação falhar no
meio, o projeto ainda está inteiro.

**A lista é fechada por padrão.** Ela roda sozinha na máquina de quem
não lê código, então só alcança onde o espelho já escreve (`src`,
`supabase`, `scripts`) mais arquivos soltos da raiz, que é onde moram
os `.cmd` numerados. Recusa caminho absoluto, letra de disco, `..`,
qualquer coisa começando com ponto (`.env.local`, `.git`), pasta que o
espelho não toca, e diretório — apaga arquivo, nunca pasta. Recusa sai
com erro na tela, para a janela ser olhada em vez de fechada.

O teste (`asp/espelho/teste.mjs`, 35 conferências) monta um projeto de
mentira numa pasta temporária e roda o script de verdade nele, com
`.env.local` e `.git` presentes para provar que continuam lá. Testar só
a função de caminho não serviria: o que falhou da outra vez não foi a
conta, foi o passo que ninguém deu.

A primeira coisa que a lista remove é o próprio `16-limpar.cmd`.

### Precisão: por mês, em real, e o custo só para quem administra (rodada 89)

Três mudanças pedidas e uma armadilha que quase passou.

**Por mês ou por marca.** A mesma soma, dois agrupamentos, escolhidos
numa barra no topo. Por mês responde "como foi outubro na agência
inteira"; por marca responde "como esta conta vem andando". Por mês é o
que abre.

**Em real.** Cada chamada é convertida pela cotação do dia em que ela
aconteceu, não pela de hoje. Converter tudo pelo dólar de hoje faria o
passado andar: um mês fechado mostraria um valor diferente a cada
semana, sem nada ter acontecido, que é o tipo de número que engana sem
parecer errado numa tela de métrica. A cotação de cada dia fica
guardada em `cotacao_dolar`, e a primeira cotação de um dia é a que
vale para sempre.

Sobre a cotação entram o spread do banco (1%) e o IOF (3,5%, conferido
na web em outubro de 2026), porque o que interessa é o que chega na
fatura, não a cotação pura. Os dois moram em `src/lib/cambio.ts`, cada
um num número só: a tabela guarda fato do dia, não política de cartão.
Se o spread da Alta for outro, é uma linha.

A busca da cotação é defensiva de propósito. O parser aceita o formato
da awesomeapi e o do Banco Central, recusa qualquer número fora da
faixa plausível para dólar/real, e devolve nulo quando não entende —
e aí a tela mostra dólar e diz que faltou cotação. Cotação chutada numa
tela de custo é pior que cotação faltando, porque ninguém desconfia de
um número que já está lá. O banco confere de novo, por último.

**O custo é da administração.** A equipe continua vendo precisão,
reescritas e pedidos do cliente, que é o que ajuda a melhorar a base
das marcas; o bloco de custo e o total só aparecem para quem
administra. A separação é de banco, não de tela: `ai_runs` só devolve
ao não-administrador as chamadas que ele mesmo disparou.

**A armadilha.** Fechar a leitura de `ai_runs` só para a administração
teria quebrado a gravação de custo inteira, em silêncio. As rotas de IA
registram a chamada com `insert(...).select('id')`, que no Postgres é
um `INSERT ... RETURNING` — e RETURNING passa pela política de LEITURA.
A equipe não conseguiria ler o id de volta, o código segue sem ele (ele
ignora esse erro), e nenhuma chamada da equipe teria custo e status
gravados depois. A conta de custo iria a zero sem ninguém perceber.
Daí a coluna `criado_por`: a pessoa enxerga as próprias chamadas, o
RETURNING funciona, e o total da agência continua sendo só de quem
administra. O teste que prova isso é o item 2 de `teste_cotacao.sql`,
e ele existe exatamente porque este é o jeito mais silencioso de uma
tela de dinheiro quebrar.

Saiu o texto que explicava por que os valores apareciam em dólar.
