import React, { useState } from 'react'
import type { ClosingType, DadoPost, HookType, ImageStyleType } from '@shared/types'

const HOOK_LABELS: Record<HookType, string> = {
  dado_numero: 'Dado/número',
  pergunta: 'Pergunta',
  contraste: 'Contraste',
  afirmacao_direta: 'Afirmação direta',
  historia_caso: 'História/case',
  outro: 'Outro'
}

const CLOSING_LABELS: Record<ClosingType, string> = {
  pergunta_reflexiva: 'Pergunta reflexiva',
  afirmacao_tese: 'Afirmação de tese',
  chamada_para_acao: 'Chamada à ação',
  dado_impacto: 'Dado de impacto',
  outro: 'Outro'
}

const IMAGE_STYLE_LABELS: Record<ImageStyleType, string> = {
  grafico_dado: 'Gráfico/dado',
  foto_pessoas: 'Foto de pessoas',
  ilustracao_conceito: 'Ilustração conceitual',
  texto_destaque: 'Texto em destaque',
  produto_screenshot: 'Produto/screenshot',
  outro: 'Outro'
}

interface Props {
  dado: DadoPost
  onUpdated: (dados: DadoPost[]) => void
}

export function PostTextCell({ dado, onUpdated }: Props): React.JSX.Element {
  const [modalOpen, setModalOpen] = useState(false)
  const [draftTexto, setDraftTexto] = useState('')
  const [processing, setProcessing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const hasTexto = !!dado.textoPost
  const hasImagem = !!dado.imagemPost
  const bothPresent = hasTexto && hasImagem

  function openModal(): void {
    setDraftTexto(dado.textoPost ?? '')
    setModalOpen(true)
  }

  async function handleSaveTexto(): Promise<void> {
    setModalOpen(false)
    setActionError(null)
    setProcessing(true)
    const result = await window.api.dados.setTexto(dado.id, draftTexto.trim())
    onUpdated(result.dados)
    if (result.error) setActionError(result.error)
    setProcessing(false)
  }

  async function handleAttachImage(): Promise<void> {
    setActionError(null)
    setProcessing(true)
    const result = await window.api.dados.attachImage(dado.id)
    onUpdated(result.dados)
    if (result.error) setActionError(result.error)
    setProcessing(false)
  }

  async function handleRemoveImage(): Promise<void> {
    const next = await window.api.dados.removeImage(dado.id)
    onUpdated(next)
  }

  async function handleReclassify(): Promise<void> {
    setActionError(null)
    setProcessing(true)
    const result = await window.api.dados.classify(dado.id)
    onUpdated(result.dados)
    if (result.error) setActionError(result.error)
    setProcessing(false)
  }

  return (
    <div className="post-text-cell">
      <div className="post-inputs-row">
        <button className="btn" onClick={openModal}>
          {hasTexto ? 'Editar texto' : 'Colar texto do post'}
        </button>

        {hasImagem ? (
          <div className="post-image-thumb-wrap">
            <img className="post-image-thumb" src={dado.imagemPost!.previewDataUrl} alt="" />
            <button className="icon-btn" title="Remover imagem" onClick={handleRemoveImage}>
              ✕
            </button>
          </div>
        ) : (
          <button className="btn" onClick={handleAttachImage}>
            Anexar imagem
          </button>
        )}
      </div>

      {hasTexto && <span className="post-text-snippet">{dado.textoPost!.slice(0, 60)}…</span>}

      {processing && <span className="saved-hint">Processando…</span>}

      {!processing && !bothPresent && (hasTexto || hasImagem) && (
        <span className="post-text-hint">
          Aguardando também {hasTexto ? 'a imagem' : 'o texto'} para classificar.
        </span>
      )}

      {!processing && actionError && <span className="post-text-error">{actionError}</span>}

      {!processing && dado.analise && (
        <div className="post-analysis">
          <div className="pill-row">
            <span className="pill">{HOOK_LABELS[dado.analise.hookType]}</span>
            {dado.analise.tema && <span className="pill">{dado.analise.tema}</span>}
            <span className="pill">{CLOSING_LABELS[dado.analise.closingType]}</span>
            {dado.analise.imagemTipo && (
              <span className="pill">{IMAGE_STYLE_LABELS[dado.analise.imagemTipo]}</span>
            )}
          </div>
          <button className="btn" onClick={handleReclassify}>
            Reclassificar
          </button>
        </div>
      )}

      {!processing && bothPresent && !dado.analise && (
        <button className="btn primary" onClick={handleReclassify}>
          {actionError ? 'Tentar classificar de novo' : 'Classificar com IA'}
        </button>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Texto do post</h2>
            <textarea
              className="prompt-editor"
              style={{ minHeight: 220, marginBottom: 16 }}
              placeholder="Cole aqui o texto completo do post do LinkedIn…"
              value={draftTexto}
              onChange={(e) => setDraftTexto(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button className="btn primary" onClick={handleSaveTexto}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
