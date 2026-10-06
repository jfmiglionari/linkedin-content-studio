import Anthropic from '@anthropic-ai/sdk'
import type { AiContentBlock, AiProvider, AiStreamOptions, AiStreamResult, AiToolDef } from '../types'

const ANTHROPIC_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

function toAnthropicContent(
  content: string | AiContentBlock[]
): string | Anthropic.ContentBlockParam[] {
  if (typeof content === 'string') return content

  const blocks: Anthropic.ContentBlockParam[] = []
  for (const block of content) {
    if (block.type === 'text') {
      if (block.text.trim()) blocks.push({ type: 'text', text: block.text })
    } else if (block.type === 'image') {
      if (!ANTHROPIC_IMAGE_MIME_TYPES.has(block.mimeType)) {
        throw new Error(
          `Tipo de imagem não suportado pela Anthropic: ${block.mimeType}. Use JPEG, PNG, GIF ou WebP.`
        )
      }
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: block.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: block.dataBase64
        }
      })
    } else {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: block.dataBase64 }
      })
    }
  }
  return blocks
}

const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20260209 = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 8
}

function toAnthropicTool(tool: AiToolDef): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: tool.inputSchema.properties,
      required: tool.inputSchema.required
    }
  }
}

export const anthropicProvider: AiProvider = {
  async streamMessage(opts: AiStreamOptions): Promise<AiStreamResult> {
    const client = new Anthropic({ apiKey: opts.apiKey })

    const tools: Anthropic.ToolUnion[] = []
    if (opts.tools) tools.push(...opts.tools.map(toAnthropicTool))
    if (opts.enableWebSearch) tools.push(WEB_SEARCH_TOOL)

    const messages: Anthropic.MessageParam[] = opts.messages.map((m) => ({
      role: m.role,
      content: toAnthropicContent(m.content)
    }))

    const stream = client.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages,
      tools: tools.length > 0 ? tools : undefined
    })

    stream.on('text', (delta) => {
      if (delta) opts.onDelta(delta)
    })

    const message = await stream.finalMessage()

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const toolUseBlock = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    )

    return {
      text,
      toolCall: toolUseBlock
        ? { name: toolUseBlock.name, input: toolUseBlock.input as Record<string, unknown> }
        : undefined
    }
  }
}
