import React, { useState } from 'react'
import { useChatContext } from '../context/ChatContext'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  /** Chamado depois de trocar/criar uma conversa, para a tela ativa ir para o Chat. */
  onSelect: () => void
}

export function ConversationNavList({ onSelect }: Props): React.JSX.Element {
  const {
    conversations,
    activeConversationId,
    switchConversation,
    newConversation,
    renameConversation,
    deleteConversation,
    streamingConversationId
  } = useChatContext()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const sorted = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  function startRename(id: string, currentTitle: string): void {
    setEditingId(id)
    setEditingTitle(currentTitle)
  }

  async function commitRename(): Promise<void> {
    if (editingId && editingTitle.trim()) {
      await renameConversation(editingId, editingTitle.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="conversation-nav">
      <hr className="sidebar-divider" />

      <button
        className="btn primary conversation-new-btn"
        onClick={() => {
          newConversation()
          onSelect()
        }}
      >
        + Nova conversa
      </button>

      <div className="conversation-list">
        {sorted.map((c) => {
          const isBusy = streamingConversationId === c.id
          return (
            <div
              key={c.id}
              className={`conversation-item ${c.id === activeConversationId ? 'active' : ''}`}
              onClick={() => {
                switchConversation(c.id)
                onSelect()
              }}
            >
              {editingId === c.id ? (
                <input
                  autoFocus
                  className="conversation-rename-input"
                  value={editingTitle}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span className="conversation-title">{c.title}</span>
              )}

              <div className="conversation-item-actions">
                <button
                  className="icon-btn"
                  title="Renomear"
                  disabled={isBusy}
                  onClick={(e) => {
                    e.stopPropagation()
                    startRename(c.id, c.title)
                  }}
                >
                  ✎
                </button>
                <button
                  className="icon-btn"
                  title="Apagar"
                  disabled={isBusy}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeletingId(c.id)
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {deletingId && (
        <ConfirmDialog
          title="Apagar conversa"
          message="Essa conversa e todas as mensagens dela serão apagadas permanentemente."
          confirmLabel="Apagar"
          danger
          onCancel={() => setDeletingId(null)}
          onConfirm={() => {
            deleteConversation(deletingId)
            setDeletingId(null)
          }}
        />
      )}
    </div>
  )
}
