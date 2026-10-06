import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { readJson, writeJson, getDataDir } from './jsonStore'
import { Conversation, ChatMessage } from '@shared/types'

const FILE = 'conversations.json'
const LEGACY_CHAT_FILE = 'chat.json'

export function chatFileName(conversationId: string): string {
  return `chat-${conversationId}.json`
}

function newConversation(title = 'Nova conversa'): Conversation {
  const now = new Date().toISOString()
  return { id: randomUUID(), title, createdAt: now, updatedAt: now }
}

/**
 * Migra o chat.json legado (thread única global) para o novo modelo de conversas,
 * uma única vez. Apaga o arquivo legado ao final para tornar a operação idempotente
 * (uma segunda chamada não encontra mais nada para migrar).
 */
async function migrateLegacyChatIfNeeded(): Promise<Conversation[] | null> {
  const legacyPath = path.join(getDataDir(), LEGACY_CHAT_FILE)
  let legacyExists = true
  try {
    await fs.access(legacyPath)
  } catch {
    legacyExists = false
  }
  if (!legacyExists) return null

  const legacyMessages = await readJson<ChatMessage[]>(LEGACY_CHAT_FILE, [])
  if (legacyMessages.length === 0) {
    await fs.unlink(legacyPath).catch(() => undefined)
    return null
  }

  const conversation = newConversation('Conversa importada')
  await writeJson(chatFileName(conversation.id), legacyMessages)
  const conversations = [conversation]
  await writeJson(FILE, conversations)
  await fs.unlink(legacyPath).catch(() => undefined)
  return conversations
}

/** Sempre retorna pelo menos 1 conversa — cria uma automaticamente se a lista estiver vazia. */
export async function listConversations(): Promise<Conversation[]> {
  const migrated = await migrateLegacyChatIfNeeded()
  if (migrated) return migrated

  const current = await readJson<Conversation[]>(FILE, [])
  if (current.length > 0) return current

  const conversation = newConversation()
  await writeJson(FILE, [conversation])
  return [conversation]
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const conversations = await listConversations()
  return conversations.find((c) => c.id === id)
}

export async function createConversation(): Promise<Conversation> {
  const current = await readJson<Conversation[]>(FILE, [])
  const conversation = newConversation()
  await writeJson(FILE, [...current, conversation])
  return conversation
}

export async function renameConversation(id: string, title: string): Promise<Conversation[]> {
  const current = await listConversations()
  if (!current.some((c) => c.id === id)) return current
  const trimmed = title.trim()
  if (!trimmed) return current
  const next = current.map((c) =>
    c.id === id ? { ...c, title: trimmed, updatedAt: new Date().toISOString() } : c
  )
  await writeJson(FILE, next)
  return next
}

/** Atualiza updatedAt e, se ainda for o título padrão, deriva um título a partir do texto. */
export async function touchConversation(id: string, firstUserText?: string): Promise<void> {
  const current = await readJson<Conversation[]>(FILE, [])
  const now = new Date().toISOString()
  const next = current.map((c) => {
    if (c.id !== id) return c
    const shouldAutoTitle = c.title === 'Nova conversa' && firstUserText?.trim()
    const title = shouldAutoTitle ? firstUserText!.trim().slice(0, 60) : c.title
    return { ...c, title, updatedAt: now }
  })
  await writeJson(FILE, next)
}

export async function deleteConversation(id: string): Promise<Conversation[]> {
  const current = await listConversations()
  const next = current.filter((c) => c.id !== id)
  const finalList = next.length > 0 ? next : [newConversation()]
  await writeJson(FILE, finalList)
  await fs.unlink(path.join(getDataDir(), chatFileName(id))).catch(() => undefined)
  return finalList
}
