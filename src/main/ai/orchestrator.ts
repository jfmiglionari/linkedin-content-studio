import { randomUUID } from 'crypto'
import { resolveActiveProvider } from './activeProvider'
import {
  APP_SUGGESTION_INSTRUCTIONS,
  extractSuggestionBlock,
  parsePautasFromText,
  parsePostBlocks
} from './parsers'
import type { AiContentBlock, AiMessage, AiToolDef } from './types'
import { getPrompts } from '../store/prompts'
import { addPautas, summarizeForResearch } from '../store/pautas'
import { buildDadosContext } from '../analysis'
import { listMessages, appendMessage } from '../store/chat'
import { readAttachmentForApi } from '../attachments'
import { ChatAttachment, ChatCard, ChatMessage, PromptSuggestion, RunAction } from '@shared/types'

const ROUTER_SYSTEM = `Você é o assistente do "LinkedIn Content Studio", um app que ajuda um executivo C-level brasileiro a criar conteúdo para o LinkedIn.
O app tem um pipeline de 3 etapas: (1) pesquisar pautas/cases de negócio, (2) escrever o post, (3) gerar um prompt de imagem em inglês para colar num gerador externo.
Quando o pedido do usuário corresponder claramente a uma dessas 3 etapas, chame a ferramenta correspondente. Se o usuário estiver só conversando, tirando dúvida, comentando ou pedindo um ajuste que não seja "rodar" uma das 3 etapas, responda normalmente em texto, sem chamar nenhuma ferramenta.
Se o usuário pedir para escrever um post ou gerar um prompt de imagem sem fornecer o case ou o texto do post diretamente, procure essa informação no histórico recente da conversa antes de perguntar ao usuário.`

const ROUTER_TOOLS: AiToolDef[] = [
  {
    name: 'iniciar_pesquisa_pautas',
    description:
      'Chame quando o usuário pedir para pesquisar, sugerir ou buscar novas pautas/temas/cases de negócio para postar no LinkedIn (ex: "pesquisa pautas novas", "me dá ideias de post", "quais temas eu poderia postar").',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'escrever_post',
    description:
      'Chame quando o usuário pedir para escrever, redigir ou criar o texto de um post do LinkedIn a partir de uma pauta, case ou notícia específica.',
    inputSchema: {
      type: 'object',
      properties: {
        case_base: {
          type: 'string',
          description:
            'A notícia, pauta ou case que deve servir de base para o post, com o máximo de detalhe disponível no pedido do usuário ou no histórico recente da conversa.'
        }
      },
      required: ['case_base']
    }
  },
  {
    name: 'gerar_prompt_imagem',
    description:
      'Chame quando o usuário pedir para gerar o prompt de imagem (para colar no Gemini) a partir de um post do LinkedIn já escrito.',
    inputSchema: {
      type: 'object',
      properties: {
        texto_post: {
          type: 'string',
          description:
            'O texto completo do post do LinkedIn (buscar no histórico recente da conversa se o usuário não colou de novo).'
        }
      },
      required: ['texto_post']
    }
  }
]

function cardToText(card: ChatCard | undefined): string {
  if (!card) return ''
  switch (card.type) {
    case 'pautas':
      return '[10 pautas foram sugeridas nesta etapa — ver histórico acima para os títulos]'
    case 'post':
      return `[Post gerado]\n${(card.payload as { post: string }).post}`
    case 'imagem':
      return `[Prompt de imagem gerado]\n${(card.payload as { imagePrompt: string }).imagePrompt}`
    default:
      return ''
  }
}

async function attachmentsToContentBlocks(
  attachments: ChatAttachment[]
): Promise<AiContentBlock[]> {
  const blocks: AiContentBlock[] = []
  for (const attachment of attachments) {
    if (attachment.kind === 'document') {
      if (attachment.extractedText) {
        blocks.push({
          type: 'text',
          text: `[Anexo: ${attachment.name}]\n${attachment.extractedText}`
        })
      }
      continue
    }
    const file = await readAttachmentForApi(attachment)
    if (!file) continue
    if (attachment.kind === 'image') {
      blocks.push({ type: 'image', mimeType: file.mimeType, dataBase64: file.dataBase64 })
    } else {
      blocks.push({
        type: 'document',
        mimeType: file.mimeType,
        dataBase64: file.dataBase64,
        name: attachment.name
      })
    }
  }
  return blocks
}

async function toApiMessages(conversationId: string, limit = 16): Promise<AiMessage[]> {
  const history = await listMessages(conversationId)
  const recent = history.slice(-limit)
  const messages: AiMessage[] = []

  for (const m of recent) {
    const role = m.role === 'user' ? 'user' : 'assistant'
    const text = m.content?.trim() || cardToText(m.card)

    if (m.attachments && m.attachments.length > 0) {
      const blocks: AiContentBlock[] = []
      if (text) blocks.push({ type: 'text', text })
      blocks.push(...(await attachmentsToContentBlocks(m.attachments)))
      if (blocks.length > 0) messages.push({ role, content: blocks })
      continue
    }

    if (!text) continue
    messages.push({ role, content: text })
  }

  return messages
}

function newMessage(
  role: ChatMessage['role'],
  content: string,
  card?: ChatCard,
  attachments?: ChatAttachment[]
): ChatMessage {
  return {
    id: randomUUID(),
    role,
    content,
    card,
    attachments,
    createdAt: new Date().toISOString()
  }
}

function buildSystem(promptText: string): string {
  return `${promptText}\n\n${APP_SUGGESTION_INSTRUCTIONS}`
}

async function runPesquisa(onDelta: (d: string) => void): Promise<{ text: string; card: ChatCard }> {
  const [prompts, active, pautasSummary, dadosSummary] = await Promise.all([
    getPrompts(),
    resolveActiveProvider(),
    summarizeForResearch(),
    buildDadosContext()
  ])

  const userContent = `[CONTEXTO INTERNO DO APP — NÃO É PARTE DO SEU PROMPT, É DADO GERADO PELO APLICATIVO]

HISTÓRICO DE PAUTAS JÁ SUGERIDAS OU PUBLICADAS (não repita nenhuma):
${pautasSummary}

DADOS DE PERFORMANCE HISTÓRICOS DO AUTOR:
${dadosSummary}
[FIM DO CONTEXTO INTERNO]

Pesquise agora e entregue as 10 sugestões de pauta seguindo todas as instruções do seu papel.`

  const result = await active.provider.streamMessage({
    apiKey: active.apiKey,
    model: active.model,
    system: buildSystem(prompts.pesquisa),
    messages: [{ role: 'user', content: userContent }],
    enableWebSearch: true,
    maxTokens: 7000,
    onDelta
  })

  const { cleanText, suggestion } = extractSuggestionBlock(result.text)
  const parsedPautas = parsePautasFromText(cleanText)
  const savedPautas = parsedPautas.length > 0 ? await addPautas(parsedPautas) : []

  return {
    text: cleanText,
    card: {
      type: 'pautas',
      payload: { pautas: savedPautas.slice(-parsedPautas.length), rawText: cleanText, suggestion }
    }
  }
}

async function runPost(
  caseBase: string,
  onDelta: (d: string) => void
): Promise<{ text: string; card: ChatCard }> {
  const [prompts, active, dadosSummary] = await Promise.all([
    getPrompts(),
    resolveActiveProvider(),
    buildDadosContext()
  ])

  const userContent = `[CONTEXTO INTERNO DO APP — NÃO É PARTE DO SEU PROMPT, É DADO GERADO PELO APLICATIVO]

DADOS DE PERFORMANCE HISTÓRICOS DO AUTOR:
${dadosSummary}
[FIM DO CONTEXTO INTERNO]

[NOTÍCIA / CASE BASE]:
${caseBase}`

  const result = await active.provider.streamMessage({
    apiKey: active.apiKey,
    model: active.model,
    system: buildSystem(prompts.post),
    messages: [{ role: 'user', content: userContent }],
    enableWebSearch: true,
    maxTokens: 4000,
    onDelta
  })

  const { cleanText, suggestion } = extractSuggestionBlock(result.text)
  const parsed = parsePostBlocks(cleanText)

  return {
    text: cleanText,
    card: { type: 'post', payload: { ...parsed, suggestion } }
  }
}

async function runImagem(
  textoPost: string,
  onDelta: (d: string) => void
): Promise<{ text: string; card: ChatCard }> {
  const [prompts, active, dadosSummary] = await Promise.all([
    getPrompts(),
    resolveActiveProvider(),
    buildDadosContext()
  ])

  const userContent = `[CONTEXTO INTERNO DO APP — NÃO É PARTE DO SEU PROMPT, É DADO GERADO PELO APLICATIVO]

DADOS DE PERFORMANCE HISTÓRICOS DO AUTOR:
${dadosSummary}
[FIM DO CONTEXTO INTERNO]

[TEXTO DO POST]:
${textoPost}`

  const result = await active.provider.streamMessage({
    apiKey: active.apiKey,
    model: active.model,
    system: buildSystem(prompts.imagem),
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 1500,
    onDelta
  })

  const { cleanText, suggestion } = extractSuggestionBlock(result.text)

  return {
    text: cleanText,
    card: { type: 'imagem', payload: { imagePrompt: cleanText, suggestion } }
  }
}

/**
 * Ponto de entrada quando o usuário roda uma ação diretamente por um botão em uma das
 * abas de prompt (sem passar pelo roteador de intenção do Chat).
 */
export async function runActionDirect(
  conversationId: string,
  action: RunAction,
  input: string | undefined,
  onDelta: (d: string) => void
): Promise<ChatMessage[]> {
  await resolveActiveProvider()

  const userLabel: Record<RunAction, string> = {
    pesquisa: 'Rodar Prompt de Pesquisa agora.',
    post: `Escrever o post com base em: ${input ?? '(sem case informado)'}`,
    imagem: 'Gerar o prompt de imagem a partir do post fornecido.'
  }

  const userMessage = newMessage('user', userLabel[action])
  await appendMessage(conversationId, userMessage)

  let result: { text: string; card: ChatCard }
  if (action === 'pesquisa') {
    result = await runPesquisa(onDelta)
  } else if (action === 'post') {
    result = await runPost(input ?? '', onDelta)
  } else {
    result = await runImagem(input ?? '', onDelta)
  }

  return finalizeResult(conversationId, userMessage, result)
}

async function finalizeResult(
  conversationId: string,
  userMessage: ChatMessage,
  result: { text: string; card: ChatCard }
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [userMessage]
  const assistantMessage = newMessage('assistant', result.text, result.card)
  await appendMessage(conversationId, assistantMessage)
  messages.push(assistantMessage)

  const suggestion = (result.card.payload as { suggestion?: PromptSuggestion | null })?.suggestion
  if (suggestion) {
    const suggestionMessage = newMessage('system-card', '', {
      type: 'sugestao-prompt',
      payload: suggestion
    })
    await appendMessage(conversationId, suggestionMessage)
    messages.push(suggestionMessage)
  }

  return messages
}

/**
 * Ponto de entrada quando o usuário escreve livremente no Chat. Decide via tool-use
 * se deve rodar uma das 3 ações do pipeline ou apenas responder normalmente.
 */
export async function routeAndRun(
  conversationId: string,
  userText: string,
  attachments: ChatAttachment[] | undefined,
  onDelta: (d: string) => void
): Promise<ChatMessage[]> {
  const active = await resolveActiveProvider()

  const userMessage = newMessage('user', userText, undefined, attachments)
  await appendMessage(conversationId, userMessage)

  const history = await toApiMessages(conversationId)

  let routerTextSoFar = ''
  const routerResult = await active.provider.streamMessage({
    apiKey: active.apiKey,
    model: active.model,
    system: ROUTER_SYSTEM,
    messages: history,
    tools: ROUTER_TOOLS,
    maxTokens: 1500,
    onDelta: (d) => {
      routerTextSoFar += d
      onDelta(d)
    }
  })

  if (!routerResult.toolCall) {
    const finalText = routerResult.text || routerTextSoFar
    const assistantMessage = newMessage('assistant', finalText)
    await appendMessage(conversationId, assistantMessage)
    return [userMessage, assistantMessage]
  }

  if (routerTextSoFar.trim()) {
    onDelta('\n\n')
  }

  const { name, input } = routerResult.toolCall
  let result: { text: string; card: ChatCard }

  if (name === 'iniciar_pesquisa_pautas') {
    result = await runPesquisa((d) => onDelta(d))
  } else if (name === 'escrever_post') {
    result = await runPost((input.case_base as string) ?? userText, (d) => onDelta(d))
  } else {
    result = await runImagem((input.texto_post as string) ?? userText, (d) => onDelta(d))
  }

  const combinedText = routerTextSoFar.trim() ? `${routerTextSoFar.trim()}\n\n${result.text}` : result.text

  return finalizeResult(conversationId, userMessage, { text: combinedText, card: result.card })
}
