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

Em `asp/` (fora deste repositório, com quem escreveu) há ~96 casos em SQL
que rodam contra um PostgreSQL local recriado do zero: isolamento entre
marcas, versionamento de pauta, ciclo completo com o cliente,
permissões de pessoas e os níveis de acesso à marca. Eles provam que as regras **funcionam**;
`10-seguranca.cmd` prova que elas **estão lá** em produção. As duas
perguntas são diferentes.

---

## O que a IA faz, e o que o código confere

O prompt **pede**; o código **verifica**. Depois de cada resposta da IA,
`src/lib/prompt.ts` confere: a cota de cada linha de produto fecha
exatamente, os dias existem no mês, nenhuma expressão proibida da base
aparece em título, tema, conceito, descrição ou hashtag, e os pesos dos
territórios somam 100. Conteúdo com expressão proibida **não é gravado**,
nem quando veio da IA.

Custo: cerca de US$ 0,60 por mês gerado (Opus 5, com raciocínio). Toda
chamada fica registrada em `ai_runs`, inclusive as que falham.
