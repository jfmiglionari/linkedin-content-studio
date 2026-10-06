# Passo a passo: como o projeto foi construído

O app foi desenvolvido com o **Claude Code** a partir de um briefing em linguagem natural (veja [`00-briefing-original.md`](00-briefing-original.md)), sem que o autor escrevesse o código manualmente. Este documento descreve a ordem lógica de construção, de modo que qualquer pessoa consiga reproduzir o processo.

> Observação sobre a evolução: o código guarda marcas de que o app nasceu **só com a Anthropic** e depois ganhou o Gemini (`apikey.enc` legado, campo `model` legado, camada `AiProvider`). O histórico de commits público tem apenas o commit inicial, então a ordem abaixo é a ordem *arquitetural* de construção, não um diário literal.

---

## Passo 0: Definir o problema e escrever o briefing

Antes de qualquer código, o autor escreveu um briefing com:

1. **Quem usa**: usuário único, sem conhecimento técnico, Mac. Isso define as prioridades: simplicidade, estabilidade, interface humana.
2. **O que o app faz**: 5 abas interligadas (Chat, 3 prompts, Dados).
3. **Regras de negócio**: a IA *nunca* edita um prompt sozinha (propõe, justifica com dados, pede permissão).
4. **Como as abas se conectam**: pesquisa → post → imagem, todas consultando a aba Dados.
5. **Os prompts completos** do autor, já validados manualmente com dados de performance.
6. Uma instrução-chave: **"antes de começar, me pergunte qualquer dúvida"**. O Claude Code levanta ambiguidades antes de construir.

**Lição:** o briefing é a especificação. Quanto mais regras de negócio explícitas (principalmente as proibições), menos retrabalho.

## Passo 1: Escolher stack e criar o esqueleto

Decisão: **Electron + React + TypeScript + electron-vite**, porque o requisito era "app nativo instalado localmente" e a equipe de um só usuário não justifica servidor.

```bash
npm init -y
npm i electron electron-vite vite react react-dom typescript @vitejs/plugin-react
npm i -D electron-builder @electron-toolkit/utils @types/node @types/react @types/react-dom
```

Resultado: três alvos de build (`main`, `preload`, `renderer`) em `electron.vite.config.ts`, e os `tsconfig` separados por alvo (`tsconfig.node.json` e `tsconfig.web.json`). Alias `@shared` para os tipos comuns.

## Passo 2: Contratos antes da lógica (`src/shared`)

Definir primeiro, e em um só lugar:

- `types.ts`: `PromptsState`, `Pauta`, `DadoPost`, `PostAnalysis`, `ChatMessage`, `Settings`, etc.
- `ipc.ts`: todos os nomes de canais IPC como constantes.
- `seedPrompts.ts`: os 3 prompts do briefing, usados como valor inicial.

Com os tipos fixados, main, preload e renderer podem evoluir sem divergir.

## Passo 3: Persistência confiável (`src/main/store`)

Construir `jsonStore.ts` (leitura/escrita atômica com fila por arquivo) **antes** de qualquer feature, e depois os stores finos por domínio: `prompts`, `pautas`, `dados`, `chat`, `conversations`, `settings`.

Por quê primeiro: todas as features dependem de gravar dados do usuário. Um erro aqui significa perda de dados (o `CLAUDE.md` do projeto registra um caso real de perda de uma conversa, causado por outro problema: arquivos compilados sequestrando o build).

## Passo 4: Configurações e chave de API

`store/settings.ts`: provedor ativo, modelo por provedor e chave criptografada com `safeStorage`. Interface em `SettingsModal.tsx`.

Regra de segurança desde o início: a chave só existe no main process; o renderer sabe apenas se ela existe.

## Passo 5: Camada de IA com *adapter* (`src/main/ai`)

1. `types.ts`: a interface `AiProvider` e os tipos neutros (`AiMessage`, `AiToolDef`, `AiStreamOptions`).
2. `providers/anthropic.ts`: implementação com `@anthropic-ai/sdk` (streaming, tools, imagem/PDF, web search).
3. `providers/gemini.ts`: implementação com `@google/genai` (streaming, function calling, `googleSearch`).
4. `activeProvider.ts`: resolve provedor, chave e modelo ativos.

Detalhes em [`03-integracao-com-ia.md`](03-integracao-com-ia.md).

## Passo 6: Orquestrador do pipeline

`ai/orchestrator.ts` implementa as 3 etapas (`runPesquisa`, `runPost`, `runImagem`) e o **roteador de intenção** do chat (`routeAndRun`) por *tool use*. Em seguida, `ai/parsers.ts` converte a saída em texto livre da IA em objetos (`Pauta`, `ParsedPost`) com expressões regulares tolerantes.

## Passo 7: Ponte IPC e preload

- `ipc/handlers.ts`: um `ipcMain.handle` por canal, mais o streaming (`streamChunk/Done/Error`).
- `preload/index.ts`: expõe `window.api` via `contextBridge`, agrupado por domínio.

## Passo 8: Interface React

Ordem de construção das telas, da mais simples para a mais complexa:

1. **Abas de Prompt** (`PromptTab.tsx`): editor de texto, salvar, desfazer, botão para rodar a etapa.
2. **Chat** (`ChatTab.tsx`, `ChatContext.tsx`, `MessageBubble.tsx`): streaming, cartões tipados, anexos, várias conversas (`ConversationNavList.tsx`).
3. **Dados** (`DadosTab.tsx`, `PostTextCell.tsx`): tabela de posts, edição de texto e imagem por linha.
4. **Configurações** (`SettingsModal.tsx`) e diálogo de confirmação para ações destrutivas.

## Passo 9: Importação das métricas do LinkedIn

`importer.ts` lê o export **Aggregate Analytics** (aba *"Publicações mais em alta"*). Essa aba tem duas tabelas lado a lado (Top 50 por engajamento e Top 50 por impressões), e o parser as une por link.

**Limitação descoberta:** o export do LinkedIn **não traz o texto do post**. Isso motivou o passo seguinte.

## Passo 10: Classificação de posts com IA

Como o export não traz texto, o usuário cola o texto (e opcionalmente a imagem) de cada post, e o app o classifica:

1. `classifier.ts`: *system prompt* exigindo **somente JSON**, com taxonomia fechada.
2. `parsers.parseClassificationJSON`: extração defensiva do JSON + coerção de enums.
3. `analysis.ts`: cruza classificação × taxa de engajamento (`engajamentos / impressões`) e gera um resumo por categoria, **só a partir de 20 posts classificados**.
4. O resumo entra como contexto nas 3 etapas do pipeline, fechando o ciclo *dado → conteúdo → dado*.

## Passo 11: Empacotamento

```bash
npm run package   # electron-vite build && electron-builder --mac
```

Gera `dist/mac-arm64/LinkedIn Content Studio.app` (alvo `dir`, sem assinatura, para uso pessoal).

## Passo 12: Regras permanentes para o Claude Code (`CLAUDE.md`)

O arquivo [`CLAUDE.md`](../CLAUDE.md) guarda as regras que o agente deve seguir em toda sessão:

- Sempre reempacotar o `.app` depois de qualquer mudança de código.
- **Nunca** rodar `tsc --build` com emissão de arquivos: sem `outDir`, ele cria `.js` ao lado dos `.ts`, e o Vite passa a preferir esses `.js` antigos. O app rodava código desatualizado sem avisar. Para checar tipos, usar `noEmit`.

**Lição:** erros que custam caro viram regra escrita no `CLAUDE.md`, para não se repetirem.

---

## Como reproduzir com o Claude Code

1. Crie uma pasta vazia e abra o Claude Code nela.
2. Cole o conteúdo de [`00-briefing-original.md`](00-briefing-original.md) como primeira mensagem.
3. Responda às perguntas de esclarecimento.
4. Peça as etapas na ordem acima (contratos → persistência → IA → IPC → telas → importação → classificação → empacotamento), validando cada uma antes de passar à seguinte.
5. Registre no `CLAUDE.md` toda regra aprendida pelo caminho.
