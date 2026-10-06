import { GoogleGenAI } from '@google/genai'
import type { Content, Part, Tool } from '@google/genai'
import type { AiContentBlock, AiProvider, AiStreamOptions, AiStreamResult, AiToolDef } from '../types'

function toGeminiParts(content: string | AiContentBlock[]): Part[] {
  if (typeof content === 'string') return [{ text: content }]

  const parts: Part[] = []
  for (const block of content) {
    if (block.type === 'text') {
      if (block.text.trim()) parts.push({ text: block.text })
    } else {
      parts.push({ inlineData: { mimeType: block.mimeType, data: block.dataBase64 } })
    }
  }
  return parts
}

function toGeminiTool(tool: AiToolDef): Tool {
  return {
    functionDeclarations: [
      {
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: {
          type: 'object',
          properties: tool.inputSchema.properties,
          required: tool.inputSchema.required
        }
      }
    ]
  }
}

export const geminiProvider: AiProvider = {
  async streamMessage(opts: AiStreamOptions): Promise<AiStreamResult> {
    const ai = new GoogleGenAI({ apiKey: opts.apiKey })

    const contents: Content[] = opts.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(m.content)
    }))

    const tools: Tool[] = []
    // Busca na web e function-calling customizada nunca são usadas na mesma chamada
    // neste app (ver orchestrator.ts), então não precisamos nos preocupar com a
    // limitação do Gemini 2.5 de não combinar os dois num mesmo request.
    if (opts.enableWebSearch) tools.push({ googleSearch: {} })
    if (opts.tools) tools.push(...opts.tools.map(toGeminiTool))

    const stream = await ai.models.generateContentStream({
      model: opts.model,
      contents,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens ?? 8000,
        tools: tools.length > 0 ? tools : undefined
      }
    })

    let fullText = ''
    let toolCall: { name: string; input: Record<string, unknown> } | undefined

    for await (const chunk of stream) {
      const delta = chunk.text
      if (delta) {
        fullText += delta
        opts.onDelta(delta)
      }

      const parts = chunk.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        if (part.functionCall?.name) {
          toolCall = { name: part.functionCall.name, input: part.functionCall.args ?? {} }
        }
      }
    }

    return { text: fullText, toolCall }
  }
}
