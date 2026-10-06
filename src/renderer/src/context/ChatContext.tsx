import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ChatAttachment, ChatMessage, Conversation, PromptSuggestion, RunAction } from '@shared/types'

interface ChatContextValue {
  conversations: Conversation[]
  activeConversationId: string | null
  switchConversation: (id: string) => void
  newConversation: () => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  clearActiveConversation: () => Promise<void>
  streamingConversationId: string | null
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null
  sendUserText: (text: string, attachments?: ChatAttachment[]) => void
  runAction: (action: RunAction, input?: string) => void
  applySuggestion: (messageId: string, suggestion: PromptSuggestion) => Promise<void>
  ignoreSuggestion: (messageId: string) => void
  ignoredSuggestionIds: Set<string>
  onNavigateToChat?: () => void
  registerNavigateToChat: (fn: () => void) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatContext deve ser usado dentro de <ChatProvider>')
  return ctx
}

export function ChatProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ignoredSuggestionIds, setIgnoredSuggestionIds] = useState<Set<string>>(new Set())
  const cleanupRef = useRef<(() => void) | null>(null)
  const navigateRef = useRef<(() => void) | null>(null)
  // Mapeia a requisição em voo para a conversa que ela pertence, para que trocar de
  // conversa visível não misture chunks de streaming entre threads diferentes.
  const streamingRef = useRef<{ requestId: string; conversationId: string } | null>(null)
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null)
  const activeConversationIdRef = useRef<string | null>(null)
  activeConversationIdRef.current = activeConversationId

  useEffect(() => {
    window.api.chat.listConversations().then((list) => {
      setConversations(list)
      const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      setActiveConversationId(sorted[0]?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!activeConversationId) return
    window.api.chat.getHistory(activeConversationId).then(setMessages)
  }, [activeConversationId])

  const registerNavigateToChat = useCallback((fn: () => void) => {
    navigateRef.current = fn
  }, [])

  const refreshConversations = useCallback(async (): Promise<Conversation[]> => {
    const list = await window.api.chat.listConversations()
    setConversations(list)
    return list
  }, [])

  const switchConversation = useCallback((id: string) => {
    setActiveConversationId(id)
  }, [])

  const newConversation = useCallback(async () => {
    const conversation = await window.api.chat.createConversation()
    await refreshConversations()
    setActiveConversationId(conversation.id)
  }, [refreshConversations])

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      await window.api.chat.renameConversation(id, title)
      await refreshConversations()
    },
    [refreshConversations]
  )

  const deleteConversation = useCallback(
    async (id: string) => {
      await window.api.chat.deleteConversation(id)
      const list = await refreshConversations()
      if (activeConversationIdRef.current === id) {
        const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        setActiveConversationId(sorted[0]?.id ?? null)
      }
    },
    [refreshConversations]
  )

  const clearActiveConversation = useCallback(async () => {
    if (!activeConversationId) return
    await window.api.chat.clear(activeConversationId)
    setMessages([])
  }, [activeConversationId])

  const startStreaming = useCallback(
    (
      conversationId: string,
      userEchoContent: string | null,
      userEchoAttachments: ChatAttachment[] | undefined,
      invoke: (
        requestId: string,
        handlers: {
          onChunk: (p: { requestId: string; delta: string }) => void
          onDone: (p: { requestId: string; messages: ChatMessage[] }) => void
          onError: (p: { requestId: string; error: string }) => void
        }
      ) => () => void
    ) => {
      setError(null)
      setIsStreaming(true)
      const requestId = crypto.randomUUID()
      streamingRef.current = { requestId, conversationId }
      setStreamingConversationId(conversationId)
      navigateRef.current?.()

      const placeholders: ChatMessage[] = []
      if (userEchoContent !== null) {
        placeholders.push({
          id: `pending-user-${requestId}`,
          role: 'user',
          content: userEchoContent,
          attachments: userEchoAttachments,
          createdAt: new Date().toISOString()
        })
      }
      placeholders.push({
        id: requestId,
        role: 'assistant',
        content: '',
        streaming: true,
        createdAt: new Date().toISOString()
      })

      const isVisible = (): boolean => activeConversationIdRef.current === conversationId
      if (isVisible()) {
        setMessages((prev) => [...prev, ...placeholders])
      }

      const cleanup = invoke(requestId, {
        onChunk: ({ delta }) => {
          if (!isVisible()) return
          setMessages((prev) =>
            prev.map((m) => (m.id === requestId ? { ...m, content: m.content + delta } : m))
          )
        },
        onDone: ({ messages: finalMessages }) => {
          if (isVisible()) {
            setMessages((prev) => {
              const withoutPlaceholders = prev.filter(
                (m) => !placeholders.some((p) => p.id === m.id)
              )
              return [...withoutPlaceholders, ...finalMessages]
            })
          }
          streamingRef.current = null
          setStreamingConversationId(null)
          setIsStreaming(false)
          refreshConversations()
        },
        onError: ({ error: errMsg }) => {
          if (isVisible()) {
            setMessages((prev) => prev.filter((m) => !placeholders.some((p) => p.id === m.id)))
            setError(errMsg)
          }
          streamingRef.current = null
          setStreamingConversationId(null)
          setIsStreaming(false)
        }
      })
      cleanupRef.current = cleanup
    },
    [refreshConversations]
  )

  const sendUserText = useCallback(
    (text: string, attachments?: ChatAttachment[]) => {
      const hasAttachments = attachments && attachments.length > 0
      if ((!text.trim() && !hasAttachments) || isStreaming || !activeConversationId) return
      const conversationId = activeConversationId
      startStreaming(conversationId, text, attachments, (requestId, handlers) =>
        window.api.chat.send(requestId, conversationId, text, attachments, handlers)
      )
    },
    [isStreaming, activeConversationId, startStreaming]
  )

  const runAction = useCallback(
    (action: RunAction, input?: string) => {
      if (isStreaming || !activeConversationId) return
      const conversationId = activeConversationId
      startStreaming(conversationId, null, undefined, (requestId, handlers) =>
        window.api.prompts.run(requestId, conversationId, action, input, handlers)
      )
    },
    [isStreaming, activeConversationId, startStreaming]
  )

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  const applySuggestion = useCallback(
    async (messageId: string, suggestion: PromptSuggestion) => {
      await window.api.prompts.set(suggestion.promptKey, suggestion.textoProposto)
      setIgnoredSuggestionIds((prev) => new Set(prev).add(messageId))
    },
    []
  )

  const ignoreSuggestion = useCallback((messageId: string) => {
    setIgnoredSuggestionIds((prev) => new Set(prev).add(messageId))
  }, [])

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        switchConversation,
        newConversation,
        renameConversation,
        deleteConversation,
        clearActiveConversation,
        streamingConversationId,
        messages,
        isStreaming,
        error,
        sendUserText,
        runAction,
        applySuggestion,
        ignoreSuggestion,
        ignoredSuggestionIds,
        registerNavigateToChat
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}
