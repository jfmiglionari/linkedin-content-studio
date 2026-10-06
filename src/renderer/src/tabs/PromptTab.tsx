import React, { useEffect, useState } from 'react'
import type { PromptKey } from '@shared/types'
import { useChatContext } from '../context/ChatContext'
import { ConfirmDialog } from '../components/ConfirmDialog'

interface Props {
  promptKey: PromptKey
  title: string
  description: string
  extraInputLabel?: string
  extraInputPlaceholder?: string
}

export function PromptTab({
  promptKey,
  title,
  description,
  extraInputLabel,
  extraInputPlaceholder
}: Props): React.JSX.Element {
  const { runAction, isStreaming } = useChatContext()
  const [savedText, setSavedText] = useState('')
  const [previousText, setPreviousText] = useState<string | undefined>(undefined)
  const [draftText, setDraftText] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [confirmingSave, setConfirmingSave] = useState(false)
  const [extraInput, setExtraInput] = useState('')
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    window.api.prompts.get().then((prompts) => {
      setSavedText(prompts[promptKey])
      setPreviousText(prompts.previous[promptKey])
      setIsEditing(false)
    })
  }, [promptKey])

  function handleStartEditing(): void {
    setDraftText(savedText)
    setIsEditing(true)
  }

  function handleCancelEditing(): void {
    setIsEditing(false)
  }

  async function handleConfirmSave(): Promise<void> {
    const prompts = await window.api.prompts.set(promptKey, draftText)
    setSavedText(prompts[promptKey])
    setPreviousText(prompts.previous[promptKey])
    setIsEditing(false)
    setConfirmingSave(false)
    setSavedAt(new Date().toLocaleTimeString('pt-BR'))
  }

  async function handleUndo(): Promise<void> {
    const prompts = await window.api.prompts.undo(promptKey)
    setSavedText(prompts[promptKey])
    setPreviousText(prompts.previous[promptKey])
    setSavedAt(new Date().toLocaleTimeString('pt-BR'))
  }

  function handleRun(): void {
    runAction(promptKey, extraInputLabel ? extraInput : undefined)
  }

  const PROMPT_LABEL: Record<PromptKey, string> = {
    pesquisa: 'Prompt de Pesquisa',
    post: 'Prompt de Post',
    imagem: 'Prompt de Imagem'
  }

  return (
    <>
      <div className="prompt-toolbar">
        <div>
          <h1 style={{ margin: 0, fontSize: 15 }}>{title}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            {description}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {savedAt && <span className="saved-hint">Salvo às {savedAt}</span>}

          {isEditing ? (
            <>
              <button className="btn" onClick={handleCancelEditing}>
                Cancelar
              </button>
              <button className="btn primary" onClick={() => setConfirmingSave(true)}>
                Salvar
              </button>
            </>
          ) : (
            <>
              <button className="btn" disabled={previousText === undefined} onClick={handleUndo}>
                Desfazer
              </button>
              <button className="btn" onClick={handleStartEditing}>
                Editar
              </button>
            </>
          )}

          <button
            className="btn primary"
            disabled={isStreaming || isEditing}
            onClick={handleRun}
          >
            {isStreaming ? 'Rodando…' : 'Rodar este prompt agora'}
          </button>
        </div>
      </div>

      {extraInputLabel && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            {extraInputLabel}
          </label>
          <textarea
            className="prompt-editor"
            style={{ height: 90, minHeight: 90 }}
            placeholder={extraInputPlaceholder}
            value={extraInput}
            onChange={(e) => setExtraInput(e.target.value)}
          />
        </div>
      )}

      <textarea
        className={`prompt-editor ${isEditing ? '' : 'readonly'}`}
        value={isEditing ? draftText : savedText}
        readOnly={!isEditing}
        onChange={(e) => isEditing && setDraftText(e.target.value)}
        spellCheck={false}
      />

      {confirmingSave && (
        <ConfirmDialog
          title="Salvar alteração no prompt"
          message={`Tem certeza que quer salvar essa alteração no ${PROMPT_LABEL[promptKey]}? Isso muda como o app se comporta a partir de agora.`}
          confirmLabel="Salvar"
          onCancel={() => setConfirmingSave(false)}
          onConfirm={handleConfirmSave}
        />
      )}
    </>
  )
}
