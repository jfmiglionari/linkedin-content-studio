import React, { useEffect, useRef, useState } from 'react'
import type { ChatAttachment } from '@shared/types'
import { useChatContext } from '../context/ChatContext'
import { MessageBubble } from '../components/MessageBubble'
import { ConfirmDialog } from '../components/ConfirmDialog'

const KIND_ICON: Record<ChatAttachment['kind'], string> = {
  image: '🖼️',
  pdf: '📄',
  document: '📄'
}

export function ChatTab(): React.JSX.Element {
  const { messages, isStreaming, error, sendUserText, clearActiveConversation } = useChatContext()
  const [input, setInput] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function handleSend(): void {
    if (!input.trim() && pendingAttachments.length === 0) return
    sendUserText(input.trim(), pendingAttachments.length > 0 ? pendingAttachments : undefined)
    setInput('')
    setPendingAttachments([])
  }

  async function handleAttach(): Promise<void> {
    setAttaching(true)
    setAttachError(null)
    const result = await window.api.chat.pickAttachments()
    setAttaching(false)
    if ('error' in result) {
      setAttachError(result.error)
      return
    }
    setPendingAttachments((prev) => [...prev, ...result])
  }

  function removeAttachment(id: string): void {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <button
          className="btn"
          disabled={messages.length === 0}
          onClick={() => setConfirmingClear(true)}
        >
          Limpar conversa
        </button>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            Peça para pesquisar pautas novas, escrever um post a partir de um case, ou gerar o
            prompt de imagem de um post pronto. Você também pode ir direto nas abas de Prompt e
            apertar "Rodar".
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {attachError && <div className="error-banner">{attachError}</div>}

      {pendingAttachments.length > 0 && (
        <div className="attachment-chip-row">
          {pendingAttachments.map((a) => (
            <div key={a.id} className="attachment-chip">
              {a.kind === 'image' && a.previewDataUrl ? (
                <img className="attachment-thumb" src={a.previewDataUrl} alt={a.name} />
              ) : (
                <span>{KIND_ICON[a.kind]}</span>
              )}
              <span className="attachment-chip-name">{a.name}</span>
              <button className="icon-btn" onClick={() => removeAttachment(a.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-input-bar">
        <textarea
          className="chat-input-textarea"
          placeholder="Escreva aqui… (ex: pesquisa pautas novas)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
        />
        <div className="chat-input-actions">
          <button
            className="btn primary"
            disabled={isStreaming || (!input.trim() && pendingAttachments.length === 0)}
            onClick={handleSend}
          >
            {isStreaming ? 'Rodando…' : 'Enviar'}
          </button>
          <button className="btn" disabled={attaching || isStreaming} onClick={handleAttach}>
            📎 Anexar
          </button>
        </div>
      </div>

      {confirmingClear && (
        <ConfirmDialog
          title="Limpar conversa"
          message="Todas as mensagens desta conversa serão apagadas permanentemente. As outras conversas não são afetadas."
          confirmLabel="Limpar"
          danger
          onCancel={() => setConfirmingClear(false)}
          onConfirm={() => {
            clearActiveConversation()
            setConfirmingClear(false)
          }}
        />
      )}
    </div>
  )
}
