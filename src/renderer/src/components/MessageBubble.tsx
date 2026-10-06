import React, { useState } from 'react'
import type { ChatAttachment, ChatMessage, Pauta, PromptSuggestion } from '@shared/types'
import { useChatContext } from '../context/ChatContext'

const KIND_ICON: Record<ChatAttachment['kind'], string> = {
  image: '🖼️',
  pdf: '📄',
  document: '📄'
}

function AttachmentList({ attachments }: { attachments: ChatAttachment[] }): React.JSX.Element {
  return (
    <div className="attachment-chip-row">
      {attachments.map((a) => (
        <div key={a.id} className="attachment-chip">
          {a.kind === 'image' && a.previewDataUrl ? (
            <img className="attachment-thumb" src={a.previewDataUrl} alt={a.name} />
          ) : (
            <span>{KIND_ICON[a.kind]}</span>
          )}
          <span className="attachment-chip-name">{a.name}</span>
        </div>
      ))}
    </div>
  )
}

function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="btn"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? 'Copiado!' : 'Copiar'}
    </button>
  )
}

function PautasCard({
  payload
}: {
  payload: { pautas: Pauta[]; rawText: string }
}): React.JSX.Element {
  const { runAction, isStreaming } = useChatContext()
  const pautas = payload.pautas ?? []

  if (pautas.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Pesquisa de pautas</div>
        <div>{payload.rawText}</div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-title">10 pautas sugeridas</div>
      {pautas.map((p) => (
        <div key={p.id} className="pauta-item">
          <h4>{p.titulo}</h4>
          <p>
            {p.tipo && <span className="pill">{p.tipo}</span>}
            {p.caseEmpresa}
          </p>
          <p>{p.resumo}</p>
          <div className="card-actions">
            <button
              className="btn primary"
              disabled={isStreaming}
              onClick={() => runAction('post', `${p.titulo}\n\nCase: ${p.caseEmpresa}\n${p.resumo}`)}
            >
              Escrever post com essa pauta
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function PostCard({
  payload
}: {
  payload: { post: string; fontes: string | null; autoavaliacao: string | null }
}): React.JSX.Element {
  const { runAction, isStreaming } = useChatContext()
  return (
    <div className="card">
      <div className="card-title">Post gerado</div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{payload.post}</div>
      {payload.fontes && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--text-muted)' }}>
            Fontes pesquisadas
          </summary>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, marginTop: 6 }}>{payload.fontes}</div>
        </details>
      )}
      <div className="card-actions">
        <CopyButton text={payload.post} />
        <button className="btn primary" disabled={isStreaming} onClick={() => runAction('imagem', payload.post)}>
          Gerar prompt de imagem
        </button>
      </div>
    </div>
  )
}

function ImagemCard({ payload }: { payload: { imagePrompt: string } }): React.JSX.Element {
  return (
    <div className="card">
      <div className="card-title">Prompt de imagem (para colar no Gemini)</div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{payload.imagePrompt}</div>
      <div className="card-actions">
        <CopyButton text={payload.imagePrompt} />
      </div>
    </div>
  )
}

function SuggestionCard({
  messageId,
  suggestion
}: {
  messageId: string
  suggestion: PromptSuggestion
}): React.JSX.Element {
  const { applySuggestion, ignoreSuggestion, ignoredSuggestionIds } = useChatContext()
  const handled = ignoredSuggestionIds.has(messageId)

  const labels: Record<string, string> = {
    pesquisa: 'Prompt de Pesquisa',
    post: 'Prompt de Post',
    imagem: 'Prompt de Imagem'
  }

  return (
    <div className="card suggestion-card">
      <div className="card-title">Sugestão de ajuste — {labels[suggestion.promptKey]}</div>
      <p style={{ margin: '0 0 8px', fontSize: 13 }}>{suggestion.justificativa}</p>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 12.5 }}>Ver texto proposto</summary>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, marginTop: 6 }}>
          {suggestion.textoProposto}
        </div>
      </details>
      {!handled ? (
        <div className="card-actions">
          <button className="btn primary" onClick={() => applySuggestion(messageId, suggestion)}>
            Aplicar
          </button>
          <button className="btn" onClick={() => ignoreSuggestion(messageId)}>
            Ignorar
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
          Resolvido.
        </p>
      )}
    </div>
  )
}

export function MessageBubble({ message }: { message: ChatMessage }): React.JSX.Element | null {
  if (message.role === 'system-card' && message.card?.type === 'sugestao-prompt') {
    return (
      <SuggestionCard
        messageId={message.id}
        suggestion={message.card.payload as PromptSuggestion}
      />
    )
  }

  if (message.card && message.card.type !== 'sugestao-prompt') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {message.content && (
          <div className={`bubble assistant ${message.streaming ? 'streaming' : ''}`}>
            {message.content}
          </div>
        )}
        {message.card.type === 'pautas' && (
          <PautasCard payload={message.card.payload as { pautas: Pauta[]; rawText: string }} />
        )}
        {message.card.type === 'post' && (
          <PostCard
            payload={
              message.card.payload as { post: string; fontes: string | null; autoavaliacao: string | null }
            }
          />
        )}
        {message.card.type === 'imagem' && (
          <ImagemCard payload={message.card.payload as { imagePrompt: string }} />
        )}
      </div>
    )
  }

  const hasAttachments = message.attachments && message.attachments.length > 0
  if (!message.content && !message.streaming && !hasAttachments) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {hasAttachments && <AttachmentList attachments={message.attachments!} />}
      {(message.content || message.streaming) && (
        <div
          className={`bubble ${message.role === 'user' ? 'user' : 'assistant'} ${message.streaming ? 'streaming' : ''}`}
        >
          {message.content}
        </div>
      )}
    </div>
  )
}
