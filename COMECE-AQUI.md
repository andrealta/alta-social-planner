# Comece aqui

Este documento é para quem vai mexer no Alta Social Planner e nunca
mexeu. Ele não ensina a programar, e não precisa: o trabalho aqui é
conversar com o Claude, ler o que ele propõe e rodar arquivos `.cmd`
numerados. Quem construiu o sistema até aqui tinha pouca experiência
com desenvolvimento, e o sistema foi feito para isso continuar sendo
verdade.

Leia até o fim antes de rodar qualquer coisa. São dez minutos e evitam
o único erro desta pasta que não tem desfazer.

---

## 1. A regra que vem antes de todas

**Existe um banco de dados de verdade, com conteúdo de cliente real
dentro, e ele é facilmente alcançável desta pasta.**

Os scripts aqui conectam direto no banco, por cima de todas as travas
de segurança. Um deles, o `06-carregar.cmd`, grava a base de
conhecimento das marcas por cima do que estiver lá. Rodar esse arquivo
apontando para produção substitui a base construída de cada cliente
pelos dados de exemplo. Não há cópia guardada. Não há desfazer.

Por isso a primeira coisa a fazer, sempre, em qualquer computador, é:

```
26-ambiente.cmd
```

Ele diz em que banco este computador está mexendo e não altera nada.
Se aparecer **PRODUÇÃO** em caixa alta e com moldura, pare e confira se
é isso mesmo que você quer.

Quem está desenvolvendo deve apontar para um banco de desenvolvimento,
não para produção. Como fazer isso está no passo 4.

---

## 2. O que é cada coisa

| Peça | O que é | Onde fica |
|---|---|---|
| O código | O sistema em si, Next.js | esta pasta, e no GitHub |
| O banco | Supabase: tabelas, usuários, travas de acesso | nuvem |
| O site no ar | Vercel, publica sozinho a cada envio ao GitHub | nuvem |
| A IA | Anthropic, cobrada por uso | nuvem |
| O `.env.local` | As chaves de tudo acima | só no seu computador |

O `.env.local` **nunca** vai para o GitHub. Ele está no `.gitignore` e
há um script (`git-seguro.mjs`) que recusa o envio se um segredo
escapar. Não desligue isso.

As chaves se passam por gerenciador de senhas, nunca por e-mail, nunca
por WhatsApp, nunca coladas numa conversa.

---

## 3. Instalar

1. **Node.js** — baixe a versão LTS em nodejs.org e instale com as
   opções padrão.
2. **Git** — baixe em git-scm.com e instale com as opções padrão.
3. **VS Code** — para abrir e editar arquivos de texto. O Explorer do
   Windows não deixa criar arquivo que começa com ponto, e você vai
   precisar criar o `.env.local`.
4. **A pasta do projeto** — peça ao André acesso ao repositório no
   GitHub e clone, ou copie a pasta **sem** o `.env.local` e sem a
   pasta `backup`.

Depois, nesta pasta:

```
02-instalar.cmd
```

---

## 4. O `.env.local`

Copie o `.env.example` com o nome `.env.local` (pelo VS Code) e
preencha. O próprio arquivo explica linha por linha.

A primeira linha é a que importa:

```
AMBIENTE=desenvolvimento
```

E a `DATABASE_URL`, a `NEXT_PUBLIC_SUPABASE_URL` e a
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` devem vir do **projeto de
desenvolvimento** no Supabase, não do de produção. Peça ao André.

Com o banco de desenvolvimento vazio, rode em sequência:

```
04-migrar.cmd      cria todas as tabelas e travas, da primeira à última
06-carregar.cmd    põe marcas de exemplo para ter o que olhar
05-usuarios.cmd    cria o seu acesso
```

E então:

```
03-rodar.cmd       abre o sistema em http://localhost:3000
```

---

## 5. O jeito de trabalhar

O ciclo é sempre o mesmo. Os dois primeiros passos são os que fazem
duas pessoas caberem no mesmo projeto sem uma atrapalhar a outra:

1. **`git pull`** (ou o `12-git.cmd`, que já traz antes de enviar).
   Isso busca o que a outra pessoa publicou desde ontem.
2. **`14-espelho.cmd`**, que tira uma fotografia do projeto como ele
   está agora. O Claude trabalha olhando essa fotografia; se ela for de
   antes do `pull`, ele vai escrever em cima de uma versão velha.
3. **Você conversa com o Claude** sobre o que quer melhorar. Ele lê o
   `README.md`, entende o sistema e propõe.
4. **Ele escreve os arquivos** numa pasta rasa chamada `_espelho`.
   Isso existe porque a ponte que ele usa para enxergar o seu
   computador não alcança as pastas mais fundas do projeto.
5. **Você roda `15-aplicar.cmd`**, que devolve ao projeto **só os
   arquivos que o Claude escreveu** e confere, pelo resumo
   criptográfico, se chegaram idênticos. O resto do espelho é
   fotografia e nem é tocado.
6. **Você roda `11-build.cmd`**, que compila como vai rodar em
   produção. Se houver erro, ele aparece aqui e não no ar.
7. **Você roda `12-git.cmd`**, que envia ao GitHub. O Vercel publica
   sozinho.

Quando a mudança mexe no banco, entra um `04-migrar.cmd` entre o 15 e o
11.

Se o `15-aplicar.cmd` avisar que **o projeto andou desde que a
fotografia foi tirada**, leia com atenção: significa que chegou coisa
nova entre o passo 2 e o passo 5. Nada do que chegou é desfeito, mas os
arquivos que o Claude escreveu foram pensados olhando a versão antiga.
Confira o resultado antes de publicar, ou rode o `14-espelho.cmd` de
novo e peça ao Claude para reescrever.

**Antes de pedir alguma coisa ao Claude, peça a ele para ler o
`README.md`.** Ele tem 56 mil caracteres e conta rodada por rodada o
que foi feito, por que, e quais erros foram cometidos no caminho. É o
que impede a mesma pedra de ser pisada duas vezes.

---

## 6. As travas que protegem você

Estas existem porque cada uma delas nasceu de um erro real:

- **479 conferências de SQL** rodam contra um banco de mentira e
  provam que as regras de acesso valem. Quem mexe numa política e
  quebra outra descobre em segundos.
- **A compilação** (`11-build.cmd`) recusa código com erro de tipo.
  Já impediu um deploy quebrado.
- **O `git-seguro.mjs`** recusa enviar segredo ao GitHub.
- **O `10-seguranca.cmd`** confere as travas no banco de verdade.
- **O `00-conferir.cmd`** faz um diagnóstico geral.

Rodar essas coisas é barato. Confiar na memória é caro.

---

## 7. O que não fazer

- Não rode `06-carregar.cmd` apontando para produção. Ele agora
  pergunta antes, mas a pergunta só protege quem lê.
- Não copie a pasta inteira do projeto para outro lugar: ela carrega o
  `.env.local` e a pasta `backup`, que tem dados de cliente.
- Não mexa direto nos arquivos dentro de `src/` sem conversar com o
  Claude. Não é proibido, é que o `_espelho` fica desencontrado e a
  próxima rodada sobrescreve o que você fez.
- Não ponha a chave `service_role` em nada que comece com
  `NEXT_PUBLIC_`. Ela ignora todas as travas de isolamento entre
  clientes.
- Não desligue uma conferência que está falhando para a tela ficar
  verde. Ela está falhando por um motivo.

---

## 8. Quando der errado

Quase tudo aqui grava um arquivo `.txt` ao lado com o que aconteceu:
`migracao.txt`, `build.txt`, `seguranca.txt`, `aplicado.txt`,
`cotacao.txt`. Mande o arquivo inteiro ao Claude e diga o que você
estava tentando fazer. Não resuma: o erro costuma estar na linha que
parece irrelevante.

Se o sistema no ar quebrou, o Vercel mantém a versão anterior
funcionando quando a compilação falha. Você tem tempo para consertar
com calma.
