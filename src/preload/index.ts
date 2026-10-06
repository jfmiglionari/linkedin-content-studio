import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AiProviderId,
  ChatAttachment,
  ChatMessage,
  Conversation,
  DadoPost,
  Pauta,
  PatternsSummary,
  PromptKey,
  PromptsState,
  RunAction,
  Settings,
  StreamChunkEvent,
  StreamDoneEvent,
  StreamErrorEvent
} from '@shared/types'

function onStreamEvent<T>(
  channel: string,
  requestId: string,
  callback: (payload: T) => void
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T & { requestId: string }): void => {
    if (payload.requestId === requestId) callback(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  chat: {
    getHistory: (conversationId: string): Promise<ChatMessage[]> =>
      ipcRenderer.invoke(IPC.chatGetHistory, { conversationId }),
    send: (
      requestId: string,
      conversationId: string,
      text: string,
      attachments: ChatAttachment[] | undefined,
      handlers: {
        onChunk: (payload: StreamChunkEvent) => void
        onDone: (payload: StreamDoneEvent) => void
        onError: (payload: StreamErrorEvent) => void
      }
    ): (() => void) => {
      const offChunk = onStreamEvent<StreamChunkEvent>(IPC.chatStreamChunk, requestId, handlers.onChunk)
      const offDone = onStreamEvent<StreamDoneEvent>(IPC.chatStreamDone, requestId, handlers.onDone)
      const offError = onStreamEvent<StreamErrorEvent>(
        IPC.chatStreamError,
        requestId,
        handlers.onError
      )
      ipcRenderer.invoke(IPC.chatSend, { requestId, conversationId, text, attachments })
      return () => {
        offChunk()
        offDone()
        offError()
      }
    },
    clear: (conversationId: string): Promise<ChatMessage[]> =>
      ipcRenderer.invoke(IPC.chatClear, { conversationId }),
    pickAttachments: (): Promise<ChatAttachment[] | { error: string }> =>
      ipcRenderer.invoke(IPC.chatPickAttachments),
    listConversations: (): Promise<Conversation[]> =>
      ipcRenderer.invoke(IPC.chatListConversations),
    createConversation: (): Promise<Conversation> =>
      ipcRenderer.invoke(IPC.chatCreateConversation),
    renameConversation: (id: string, title: string): Promise<Conversation[]> =>
      ipcRenderer.invoke(IPC.chatRenameConversation, { id, title }),
    deleteConversation: (id: string): Promise<Conversation[]> =>
      ipcRenderer.invoke(IPC.chatDeleteConversation, { id })
  },
  prompts: {
    get: (): Promise<PromptsState> => ipcRenderer.invoke(IPC.promptsGet),
    set: (key: PromptKey, text: string): Promise<PromptsState> =>
      ipcRenderer.invoke(IPC.promptsSet, { key, text }),
    undo: (key: PromptKey): Promise<PromptsState> => ipcRenderer.invoke(IPC.promptsUndo, { key }),
    run: (
      requestId: string,
      conversationId: string,
      action: RunAction,
      input: string | undefined,
      handlers: {
        onChunk: (payload: StreamChunkEvent) => void
        onDone: (payload: StreamDoneEvent) => void
        onError: (payload: StreamErrorEvent) => void
      }
    ): (() => void) => {
      const offChunk = onStreamEvent<StreamChunkEvent>(IPC.chatStreamChunk, requestId, handlers.onChunk)
      const offDone = onStreamEvent<StreamDoneEvent>(IPC.chatStreamDone, requestId, handlers.onDone)
      const offError = onStreamEvent<StreamErrorEvent>(
        IPC.chatStreamError,
        requestId,
        handlers.onError
      )
      ipcRenderer.invoke(IPC.promptsRun, { requestId, conversationId, action, input })
      return () => {
        offChunk()
        offDone()
        offError()
      }
    }
  },
  pautas: {
    list: (): Promise<Pauta[]> => ipcRenderer.invoke(IPC.pautasList),
    markPublicada: (id: string): Promise<Pauta[]> =>
      ipcRenderer.invoke(IPC.pautasMarkPublicada, { id })
  },
  dados: {
    list: (): Promise<DadoPost[]> => ipcRenderer.invoke(IPC.dadosList),
    import: (): Promise<{
      canceled: boolean
      dados: DadoPost[]
      importedCount?: number
      updatedCount?: number
      error?: string
    }> => ipcRenderer.invoke(IPC.dadosImport),
    update: (id: string, patch: Partial<DadoPost>): Promise<DadoPost[]> =>
      ipcRenderer.invoke(IPC.dadosUpdate, { id, patch }),
    delete: (id: string): Promise<DadoPost[]> => ipcRenderer.invoke(IPC.dadosDelete, { id }),
    deleteMany: (ids: string[]): Promise<DadoPost[]> =>
      ipcRenderer.invoke(IPC.dadosDeleteMany, { ids }),
    clearAll: (): Promise<DadoPost[]> => ipcRenderer.invoke(IPC.dadosClearAll),
    setTexto: (id: string, texto: string): Promise<{ dados: DadoPost[]; error?: string }> =>
      ipcRenderer.invoke(IPC.dadosSetTexto, { id, texto }),
    attachImage: (
      id: string
    ): Promise<{ dados: DadoPost[]; canceled: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.dadosAttachImage, { id }),
    removeImage: (id: string): Promise<DadoPost[]> =>
      ipcRenderer.invoke(IPC.dadosRemoveImage, { id }),
    classify: (id: string): Promise<{ dados: DadoPost[]; error?: string }> =>
      ipcRenderer.invoke(IPC.dadosClassify, { id }),
    patternsSummary: (): Promise<PatternsSummary> => ipcRenderer.invoke(IPC.dadosPatternsSummary)
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
    setActiveProvider: (provider: AiProviderId): Promise<Settings> =>
      ipcRenderer.invoke(IPC.settingsSetActiveProvider, { provider }),
    setModel: (provider: AiProviderId, model: string): Promise<Settings> =>
      ipcRenderer.invoke(IPC.settingsSetModel, { provider, model }),
    setApiKey: (provider: AiProviderId, apiKey: string): Promise<Settings> =>
      ipcRenderer.invoke(IPC.settingsSetApiKey, { provider, apiKey }),
    clearApiKey: (provider: AiProviderId): Promise<Settings> =>
      ipcRenderer.invoke(IPC.settingsClearApiKey, { provider })
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
