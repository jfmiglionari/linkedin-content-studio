import { ipcMain, dialog, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import {
  AiProviderId,
  ChatAttachment,
  ChatMessage,
  PromptKey,
  RunAction,
  Settings
} from '@shared/types'
import { getPrompts, setPrompt, undoPrompt } from '../store/prompts'
import { listMessages, clearMessages } from '../store/chat'
import {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation
} from '../store/conversations'
import { listPautas, updatePautaStatus } from '../store/pautas'
import {
  listDados,
  importDados,
  updateDado,
  deleteDado,
  deleteManyDados,
  clearAllDados,
  setPostTexto,
  setPostImagem,
  setPostAnalise
} from '../store/dados'
import { analyzePatterns } from '../analysis'
import { classifyPost } from '../ai/classifier'
import { pickAttachments, pickSingleImage } from '../attachments'
import type { DadoPost } from '@shared/types'
import {
  getActiveProviderId,
  setActiveProviderId,
  getModel,
  setModel,
  setApiKey,
  clearApiKey,
  hasApiKey,
  DEFAULT_MODELS
} from '../store/settings'
import { runActionDirect, routeAndRun } from '../ai/orchestrator'
import { parseDadosFile } from '../importer'

async function buildSettingsSnapshot(): Promise<Settings> {
  const [activeProvider, anthropicModel, geminiModel, hasAnthropicKey, hasGeminiKey] =
    await Promise.all([
      getActiveProviderId(),
      getModel('anthropic'),
      getModel('gemini'),
      hasApiKey('anthropic'),
      hasApiKey('gemini')
    ])
  return {
    activeProvider,
    anthropic: { model: anthropicModel, hasApiKey: hasAnthropicKey },
    gemini: { model: geminiModel, hasApiKey: hasGeminiKey }
  }
}

function senderOf(event: IpcMainInvokeEvent): Electron.WebContents {
  return event.sender
}

async function streamAndRespond(
  event: IpcMainInvokeEvent,
  requestId: string,
  run: (onDelta: (d: string) => void) => Promise<ChatMessage[]>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sender = senderOf(event)
  try {
    const messages = await run((delta) => {
      if (!sender.isDestroyed()) {
        sender.send(IPC.chatStreamChunk, { requestId, delta })
      }
    })
    if (!sender.isDestroyed()) {
      sender.send(IPC.chatStreamDone, { requestId, messages })
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!sender.isDestroyed()) {
      sender.send(IPC.chatStreamError, { requestId, error: message })
    }
    return { ok: false, error: message }
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.chatGetHistory, async (_event, payload: { conversationId: string }) =>
    listMessages(payload.conversationId)
  )

  ipcMain.handle(
    IPC.chatSend,
    async (
      event,
      payload: {
        requestId: string
        conversationId: string
        text: string
        attachments?: ChatAttachment[]
      }
    ) =>
      streamAndRespond(event, payload.requestId, (onDelta) =>
        routeAndRun(payload.conversationId, payload.text, payload.attachments, onDelta)
      )
  )

  ipcMain.handle(IPC.chatClear, async (_event, payload: { conversationId: string }) =>
    clearMessages(payload.conversationId)
  )

  ipcMain.handle(IPC.chatPickAttachments, async (event) => {
    const win = BrowserWindow.fromWebContents(senderOf(event)) ?? undefined
    return pickAttachments(win)
  })

  ipcMain.handle(IPC.chatListConversations, async () => listConversations())
  ipcMain.handle(IPC.chatCreateConversation, async () => createConversation())
  ipcMain.handle(
    IPC.chatRenameConversation,
    async (_event, payload: { id: string; title: string }) =>
      renameConversation(payload.id, payload.title)
  )
  ipcMain.handle(IPC.chatDeleteConversation, async (_event, payload: { id: string }) =>
    deleteConversation(payload.id)
  )

  ipcMain.handle(
    IPC.promptsRun,
    async (
      event,
      payload: { requestId: string; conversationId: string; action: RunAction; input?: string }
    ) =>
      streamAndRespond(event, payload.requestId, (onDelta) =>
        runActionDirect(payload.conversationId, payload.action, payload.input, onDelta)
      )
  )

  ipcMain.handle(IPC.promptsGet, async () => getPrompts())
  ipcMain.handle(IPC.promptsSet, async (_event, payload: { key: PromptKey; text: string }) =>
    setPrompt(payload.key, payload.text)
  )
  ipcMain.handle(IPC.promptsUndo, async (_event, payload: { key: PromptKey }) =>
    undoPrompt(payload.key)
  )

  ipcMain.handle(IPC.pautasList, async () => listPautas())
  ipcMain.handle(IPC.pautasMarkPublicada, async (_event, payload: { id: string }) =>
    updatePautaStatus(payload.id, 'publicada')
  )

  ipcMain.handle(IPC.dadosList, async () => listDados())
  ipcMain.handle(IPC.dadosDelete, async (_event, payload: { id: string }) => deleteDado(payload.id))
  ipcMain.handle(IPC.dadosDeleteMany, async (_event, payload: { ids: string[] }) =>
    deleteManyDados(payload.ids)
  )
  ipcMain.handle(IPC.dadosClearAll, async () => clearAllDados())
  ipcMain.handle(
    IPC.dadosUpdate,
    async (
      _event,
      payload: { id: string; patch: Partial<import('@shared/types').DadoPost> }
    ) => updateDado(payload.id, payload.patch)
  )

  ipcMain.handle(IPC.dadosImport, async (event) => {
    const win = BrowserWindow.fromWebContents(senderOf(event)) ?? undefined
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Importar "Aggregate Analytics" do LinkedIn',
      filters: [{ name: 'Planilhas do LinkedIn', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, dados: await listDados() }
    }
    try {
      const rows = parseDadosFile(result.filePaths[0])
      const { dados, importedCount, updatedCount } = await importDados(rows)
      return { canceled: false, dados, importedCount, updatedCount }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { canceled: false, dados: await listDados(), error: message }
    }
  })

  /**
   * Roda a classificação por IA só quando o post já tem texto E imagem (por pedido do
   * usuário — evita classificar prematuramente com metade da informação). Chamado após
   * qualquer alteração em texto ou imagem; não faz nada se um dos dois ainda faltar.
   */
  async function maybeAutoClassify(
    id: string,
    dadosAtuais: DadoPost[]
  ): Promise<{ dados: DadoPost[]; error?: string }> {
    const dado = dadosAtuais.find((d) => d.id === id)
    if (!dado?.textoPost || !dado?.imagemPost) return { dados: dadosAtuais }
    try {
      const analise = await classifyPost({ textoPost: dado.textoPost, imagemPost: dado.imagemPost })
      return { dados: await setPostAnalise(id, analise) }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { dados: dadosAtuais, error: message }
    }
  }

  ipcMain.handle(IPC.dadosSetTexto, async (_event, payload: { id: string; texto: string }) => {
    const dados = await setPostTexto(payload.id, payload.texto)
    return maybeAutoClassify(payload.id, dados)
  })

  ipcMain.handle(IPC.dadosAttachImage, async (event, payload: { id: string }) => {
    const win = BrowserWindow.fromWebContents(senderOf(event)) ?? undefined
    const result = await pickSingleImage(win)
    if (result === null) return { dados: await listDados(), canceled: true }
    if ('error' in result) return { dados: await listDados(), canceled: false, error: result.error }
    const dados = await setPostImagem(payload.id, result)
    const classified = await maybeAutoClassify(payload.id, dados)
    return { ...classified, canceled: false }
  })

  ipcMain.handle(IPC.dadosRemoveImage, async (_event, payload: { id: string }) =>
    setPostImagem(payload.id, undefined)
  )

  ipcMain.handle(IPC.dadosClassify, async (_event, payload: { id: string }) => {
    const dados = await listDados()
    return maybeAutoClassify(payload.id, dados)
  })

  ipcMain.handle(IPC.dadosPatternsSummary, async () => analyzePatterns())

  ipcMain.handle(IPC.settingsGet, async () => buildSettingsSnapshot())

  ipcMain.handle(
    IPC.settingsSetActiveProvider,
    async (_event, payload: { provider: AiProviderId }) => {
      await setActiveProviderId(payload.provider)
      return buildSettingsSnapshot()
    }
  )

  ipcMain.handle(
    IPC.settingsSetModel,
    async (_event, payload: { provider: AiProviderId; model: string }) => {
      await setModel(payload.provider, payload.model || DEFAULT_MODELS[payload.provider])
      return buildSettingsSnapshot()
    }
  )

  ipcMain.handle(
    IPC.settingsSetApiKey,
    async (_event, payload: { provider: AiProviderId; apiKey: string }) => {
      await setApiKey(payload.provider, payload.apiKey)
      return buildSettingsSnapshot()
    }
  )

  ipcMain.handle(
    IPC.settingsClearApiKey,
    async (_event, payload: { provider: AiProviderId }) => {
      await clearApiKey(payload.provider)
      return buildSettingsSnapshot()
    }
  )
}
