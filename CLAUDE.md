# LinkedIn Content Studio — instruções para o Claude Code

App desktop Electron + React (TypeScript) que ajuda a criar conteúdo de LinkedIn com IA
(Claude/Gemini). Ver `instrucoes.md` para o desenho do pipeline de conteúdo (pesquisa →
post → prompt de imagem).

## Regra permanente: sempre empacotar e atualizar o .app do Desktop após qualquer mudança de código

Sempre que você fizer QUALQUER alteração no código do aplicativo (nova funcionalidade,
correção de bug, ajuste de design/layout) — ao final da tarefa, automaticamente, sem
precisar que o usuário peça:

1. Rode `npm run package` (equivale a `electron-vite build && electron-builder --mac`)
   na raiz do projeto.
2. O `.app` gerado fica em `dist/mac-arm64/LinkedIn Content Studio.app`.
3. Apague o `.app` desatualizado em `~/Desktop/LinkedIn Content Studio.app` e copie o
   novo no lugar dele (`cp -R`), para que o usuário sempre tenha a versão mais recente
   pronta para abrir com duplo clique no Desktop.

Isso substitui um arquivo em `~/Desktop` (fora do diretório do projeto) — normalmente
uma ação que pediria confirmação, mas para este projeto especificamente o usuário já
autorizou fazer isso automaticamente, sempre, sem perguntar de novo a cada mudança.
Não é necessário reconfirmar essa autorização em cada tarefa.

Só pule esse passo se: a mudança for puramente de documentação/planejamento (sem
tocar em código), ou se o próprio usuário pedir explicitamente para não empacotar
naquela tarefa.

## Cuidado: nunca rode `tsc --build` com emissão de arquivos neste projeto

Este projeto usa `electron-vite` (esbuild/Rollup) para build — não `tsc` para emitir
JS. Os `tsconfig*.json` daqui NÃO têm `outDir` configurado, então qualquer `tsc --build`
sem `--noEmit` gera arquivos `.js`/`.d.ts` **ao lado dos `.ts`/`.tsx` de origem**. Esses
arquivos compilados então "sequestram" a resolução de módulos do Vite/esbuild (que
prefere `.js` já existente em vez de re-transpilar o `.tsx`), fazendo o app rodar
código antigo silenciosamente mesmo depois de editar e rebuildar — já aconteceu nesta
sessão e causou perda de dados reais do usuário (uma conversa de chat).

Se precisar checar tipos, sempre use uma config com `"noEmit": true` (ou rode apenas
`npm run build`/`npm run dev`, que já validam o suficiente via esbuild). Se algum
`tsc --build` acabar rodando por engano, apague imediatamente qualquer `.js`/`.d.ts`/
`.js.map` que aparecer dentro de `src/` ou ao lado de `electron.vite.config.ts`.
