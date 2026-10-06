import { readJson, writeJson } from './jsonStore'
import { chatFileName, touchConversation } from './conversations'
import { ChatMessage } from '@shared/types'

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  return readJson<ChatMessage[]>(chatFileName(conversationId), [])
}

export async function appendMessage(
  conversationId: string,
  message: ChatMessage
): Promise<ChatMessage[]> {
  const current = await listMessages(conversationId)
  const next = [...current, message]
  await writeJson(chatFileName(conversationId), next)
  if (message.role === 'user') {
    await touchConversation(conversationId, message.content)
  } else {
    await touchConversation(conversationId)
  }
  return next
}

export async function clearMessages(conversationId: string): Promise<ChatMessage[]> {
  await writeJson(chatFileName(conversationId), [])
  return []
}
