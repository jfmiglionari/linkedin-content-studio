# Integração com IA

O app consome **duas APIs de LLM** por meio de uma interface única. Este documento mostra onde e como cada recurso de IA é usado.

## 1. Provedores

| | Anthropic | Google Gemini |
|---|---|---|
| SDK | `@anthropic-ai/sdk` | `@google/genai` |
| Arquivo | `src/main/ai/providers/anthropic.ts` | `src/main/ai/providers/gemini.ts` |
| Modelo padrão | `claude-sonnet-5` | `gemini-3.6-flash` |
| Chave | Console da Anthropic | Google AI Studio |

O modelo é selecionável nas Configurações. Os padrões ficam em `DEFAULT_MODELS` (`src/main/store/settings.ts`).

## 2. Recursos de LLM utilizados

| Recurso | Onde é usado | Arquivo |
|---|---|---|
| **Streaming** | Todas as respostas aparecem em tempo real | `providers/*` (`onDelta`) |
| **Tool use / function calling** | Roteador de intenção do Chat | `orchestrator.ts` (`ROUTER_TOOLS`) |
| **Web search nativo** | Pesquisa de pautas e escrita de post com dados verificáveis | `enableWebSearch` |
| **Visão (imagem)** | Classificar o estilo visual do post; anexos no chat | `classifier.ts`, `attachments.ts` |
| **Leitura de PDF** | Anexos no chat (Anthropic, bloco `document`) | `providers/anthropic.ts` |
| **Saída estruturada (JSON)** | Classificação de posts | `classifier.ts` + `parsers.ts` |
| **System prompt editável** | Os 3 prompts do usuário | `store/prompts.ts` |
| **Injeção de contexto** | Histórico de pautas e performance dentro da chamada | `orchestrator.ts`, `analysis.ts` |

## 3. Roteamento de intenção (tool use)

No Chat, a primeira chamada recebe três ferramentas:

| Tool | Quando a IA a chama | Argumento extraído |
|---|---|---|
| `iniciar_pesquisa_pautas` | "me dá ideias de post", "pesquisa pautas" | nenhum |
| `escrever_post` | "escreve um post sobre…" | `case_base` |
| `gerar_prompt_imagem` | "gera o prompt de imagem" | `texto_post` |

Se a IA não chamar nenhuma, a resposta de texto é a resposta final (conversa normal). Se chamar, o app executa a etapa correspondente com o **prompt do usuário** como *system prompt*, em uma segunda chamada. O roteador também recebe a instrução de procurar o case ou o texto do post no histórico recente antes de perguntar ao usuário.

## 4. Classificação de posts

*System prompt* (resumo, texto completo em `src/main/ai/classifier.ts`):

- Papel: analista de conteúdo do LinkedIn.
- Entrada: texto do post e, se houver, a imagem.
- Saída: **somente JSON**, com chaves e enums exatos.
- Dimensões de imagem só são preenchidas se a imagem foi enviada.

Exemplo de saída esperada:

```json
{
  "hookType": "dado_numero",
  "hookNota": "Abre com '100 bilhões de transações' e o nome da empresa",
  "tema": "Tipo 2",
  "temaAssunto": "fintech/dados",
  "estruturaNota": "6 parágrafos curtos, tom analítico, sem listas",
  "closingType": "pergunta_reflexiva",
  "closingNota": "Fecha perguntando o que o mercado ainda não enxerga",
  "imagemTipo": "foto_pessoas",
  "imagemNota": "Cena documental, paleta sóbria, sem texto sobreposto"
}
```

**Robustez:** `parseClassificationJSON` remove cercas de markdown, localiza o primeiro objeto JSON, valida cada enum contra a lista conhecida e substitui valores inválidos por `outro`. Uma resposta imperfeita da IA nunca derruba o fluxo.

## 5. Loop de aprendizado com performance

```
posts importados ──► texto + imagem colados ──► classificação (IA)
        │                                              │
        └────── engajamentos / impressões ◄────────────┘
                              │
                 taxa de engajamento por categoria
                              │   (somente com ≥ 20 posts classificados)
                              ▼
          contexto injetado nas etapas Pesquisa / Post / Imagem
```

A decisão de exigir **20 amostras** evita que o app trate ruído como padrão.

## 6. Sugestão de edição de prompt (human-in-the-loop)

Toda chamada de etapa inclui `APP_SUGGESTION_INSTRUCTIONS` no *system prompt*. Se a IA julgar que um dos prompts deve mudar, ela emite um bloco delimitado (`[FIM_DA_SUGESTAO]`) com a justificativa e o novo texto. O app:

1. extrai o bloco (`extractSuggestionBlock`) e o remove do texto principal;
2. renderiza um **cartão de sugestão** no chat;
3. só altera o prompt se o usuário clicar em aplicar (`promptSuggestion:apply`).

A IA propõe; o humano decide.

## 7. Trocando ou adicionando um provedor

1. Criar `src/main/ai/providers/<novo>.ts` exportando um objeto que implemente `AiProvider`.
2. Incluir o id em `AiProviderId` (`src/shared/types.ts`) e o modelo padrão em `DEFAULT_MODELS`.
3. Registrar o adaptador em `providerImpl` (`src/main/ai/activeProvider.ts`).
4. Expor o provedor em `SettingsModal.tsx`.

Nenhuma linha do `orchestrator` ou do `classifier` precisa mudar.

## 8. Custos e privacidade

- Cada ação é uma chamada paga ao provedor escolhido, com a chave do próprio usuário.
- Os dados enviados são apenas: o prompt, o contexto da etapa e os anexos explicitamente adicionados.
- Não há telemetria, servidor intermediário nem banco remoto.
