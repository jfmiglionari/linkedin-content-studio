# LinkedIn Content Studio

Aplicativo desktop (macOS) que usa **IA generativa** para criar conteúdo de LinkedIn e **classificar** posts já publicados, cruzando essa classificação com métricas reais de engajamento para calibrar os próximos textos.

Funciona com **dois provedores de IA intercambiáveis**: **Claude (Anthropic API)** e **Gemini (Google GenAI API)**. A troca é feita em tempo de execução, nas Configurações, sem alterar código.

> Projeto de usuário único, local-first: nenhum servidor próprio, nenhum banco de dados externo. Tudo roda na máquina; a única saída de rede são as chamadas à API do provedor de IA escolhido.

---

## O que o app faz

| Aba | Função |
|---|---|
| **Chat** | Conversa livre com a IA. Um *roteador de intenção* (tool use / function calling) decide se o pedido é só conversa ou se deve disparar uma das 3 etapas do pipeline. Suporta anexos (imagem, PDF, DOCX, XLSX) e múltiplas conversas. |
| **Prompt de Pesquisa** | Prompt editável que pesquisa 10 pautas/cases na web (5 de cada tipo), sem repetir temas já usados. |
| **Prompt de Post** | Prompt editável que escreve o post a partir da pauta escolhida, com pesquisa web e autoavaliação. |
| **Prompt de Imagem** | Prompt editável que gera, em inglês, um briefing de imagem para um gerador externo. |
| **Dados** | Importa o export *Aggregate Analytics* do LinkedIn (XLSX), permite colar o texto e a imagem de cada post, e **classifica cada post com IA** em dimensões estruturadas. |

### Pipeline de conteúdo

```
Pesquisa de pautas  ──►  Escrita do post  ──►  Prompt de imagem
        ▲                      ▲                     ▲
        └──────── contexto de performance (aba Dados) ┘
```

Cada etapa recebe, como contexto interno, o histórico de pautas já usadas e um resumo estatístico de performance. Assim a IA evita repetição e se calibra pelo que historicamente engajou mais.

### Classificação de mensagens (posts)

Cada post é enviado à IA com um *system prompt* que exige **somente JSON** como resposta. O JSON é validado contra uma taxonomia fechada:

| Dimensão | Valores |
|---|---|
| `hookType` (gancho de abertura) | `dado_numero`, `pergunta`, `contraste`, `afirmacao_direta`, `historia_caso`, `outro` |
| `tema` | `Tipo 1` (ideia genial simples) · `Tipo 2` (estratégia técnica com dados) |
| `closingType` (fechamento) | `pergunta_reflexiva`, `afirmacao_tese`, `chamada_para_acao`, `dado_impacto`, `outro` |
| `imagemTipo` (se houver imagem) | `grafico_dado`, `foto_pessoas`, `ilustracao_conceito`, `texto_destaque`, `produto_screenshot`, `outro` |
| notas livres | `hookNota`, `temaAssunto`, `estruturaNota`, `closingNota`, `imagemNota` |

A classificação aceita **texto + imagem** (entrada multimodal). Com pelo menos **20 posts classificados**, o app calcula a taxa média de engajamento por categoria e injeta esse resumo nos prompts de pesquisa, post e imagem.

### Regra de ouro: a IA nunca edita os próprios prompts

A IA pode *sugerir* uma alteração de prompt (com justificativa ligada aos dados), mas ela só aparece como um cartão no chat. O usuário revisa e aplica manualmente; existe "Desfazer" de um nível.

---

## Stack

- **Electron 33** + **electron-vite** (build com esbuild/Rollup)
- **React 18** + **TypeScript 5**
- **`@anthropic-ai/sdk`**: Claude, com streaming, tool use, visão, PDF e web search nativo
- **`@google/genai`**: Gemini, com streaming, function calling, visão e Google Search grounding
- **`xlsx`** e **`mammoth`**: leitura de planilhas (export do LinkedIn) e DOCX
- Persistência em **arquivos JSON** no `userData` do Electron (sem banco)
- Chaves de API criptografadas com **`safeStorage`** (Keychain do macOS)

---

## Como rodar

Pré-requisitos: macOS, Node 20+ e uma chave de API da [Anthropic](https://console.anthropic.com/) e/ou do [Google AI Studio](https://aistudio.google.com/).

```bash
git clone https://github.com/jfmiglionari/linkedin-content-studio.git
cd linkedin-content-studio
npm install
npm run dev        # abre o app em modo desenvolvimento
```

Na primeira execução, abra **Configurações** (engrenagem), escolha o provedor (Claude ou Gemini), cole a chave de API e selecione o modelo.

Para gerar o `.app`:

```bash
npm run package    # saída em dist/mac-arm64/LinkedIn Content Studio.app
```

### Segurança das chaves

- A chave **não** fica no repositório, em `.env` nem em variável de ambiente.
- É digitada na interface, criptografada com `safeStorage` e gravada em `userData/apikey-<provedor>.enc`.
- O renderer **nunca** vê a chave: todas as chamadas à IA acontecem no *main process*; a interface só recebe texto em streaming por IPC.

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/01-arquitetura.md`](docs/01-arquitetura.md) | Arquitetura de software: camadas, diagramas, fluxos, decisões de projeto |
| [`docs/02-passo-a-passo.md`](docs/02-passo-a-passo.md) | Roteiro de construção, passo a passo, do briefing ao app empacotado |
| [`docs/03-integracao-com-ia.md`](docs/03-integracao-com-ia.md) | Como a IA é integrada: provedores, tool use, classificação, web search, prompts |
| [`docs/00-briefing-original.md`](docs/00-briefing-original.md) | O briefing original (o prompt usado para iniciar o projeto com o Claude Code) |

## Estrutura do repositório

```
src/
├── main/                    # processo principal do Electron (Node): lógica e IA
│   ├── ai/
│   │   ├── providers/       # adaptadores: anthropic.ts, gemini.ts
│   │   ├── types.ts         # interface AiProvider (contrato único)
│   │   ├── activeProvider.ts# resolve provedor + chave + modelo ativos
│   │   ├── orchestrator.ts  # roteador de intenção e as 3 etapas do pipeline
│   │   ├── classifier.ts    # classificação de posts (JSON estruturado)
│   │   └── parsers.ts       # parsers tolerantes das saídas da IA
│   ├── store/               # persistência em JSON (prompts, pautas, dados, chat, settings)
│   ├── ipc/handlers.ts      # ponte main ⇄ renderer
│   ├── analysis.ts          # estatísticas de engajamento por categoria
│   ├── importer.ts          # parser do export do LinkedIn
│   └── attachments.ts       # anexos (imagem/PDF/DOCX/XLSX)
├── preload/index.ts         # API segura exposta ao renderer (contextBridge)
├── renderer/                # interface React (abas, chat, dados)
└── shared/                  # tipos, nomes de canais IPC e prompts-semente
docs/                        # documentação do projeto
```

## Licença

MIT. Veja [`LICENSE`](LICENSE).
