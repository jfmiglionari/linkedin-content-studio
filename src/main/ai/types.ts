// Interface comum que qualquer provedor de IA (Anthropic, Gemini, ...) precisa implementar.
// O orchestrator.ts fala só com essa interface — nada de específico de um SDK vaza pra fora
// da pasta providers/.

export type AiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; dataBase64: string }
  | { type: 'document'; mimeType: string; dataBase64: string; name?: string }

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string | AiContentBlock[]
}

export interface AiToolDef {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface AiToolCall {
  name: string
  input: Record<string, unknown>
}

export interface AiStreamOptions {
  apiKey: string
  model: string
  /** Prompt do usuário + instruções internas do app já concatenados em uma única string. */
  system: string
  messages: AiMessage[]
  /** Tools de function-calling (usadas só na etapa de roteamento de intenção do Chat). */
  tools?: AiToolDef[]
  /** Liga a busca na web nativa do provedor (usada nas etapas de Pesquisa e Post). */
  enableWebSearch?: boolean
  maxTokens?: number
  onDelta: (text: string) => void
}

export interface AiStreamResult {
  text: string
  toolCall?: AiToolCall
}

export interface AiProvider {
  streamMessage(opts: AiStreamOptions): Promise<AiStreamResult>
}
