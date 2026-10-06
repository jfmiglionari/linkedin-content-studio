import React, { useState } from 'react'
import type { AiProviderId, ProviderSettings, Settings } from '@shared/types'

const MODEL_OPTIONS: Record<AiProviderId, Array<{ value: string; label: string }>> = {
  anthropic: [
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (recomendado — bom equilíbrio custo/qualidade)' },
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 (mais caro e mais lento, qualidade máxima)' }
  ],
  gemini: [
    { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (recomendado — rápido e barato)' },
    {
      value: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro (preview — raciocínio mais forte, mais caro/lento)'
    }
  ]
}

const PROVIDER_LABEL: Record<AiProviderId, string> = {
  anthropic: 'Claude',
  gemini: 'Gemini'
}

interface Props {
  settings: Settings
  onClose: () => void
  onSaved: (settings: Settings) => void
}

function ProviderKeySection({
  provider,
  data,
  onSaved
}: {
  provider: AiProviderId
  data: ProviderSettings
  onSaved: (settings: Settings) => void
}): React.JSX.Element {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSaveKey(): Promise<void> {
    if (!apiKeyInput.trim()) return
    setSaving(true)
    const updated = await window.api.settings.setApiKey(provider, apiKeyInput.trim())
    setApiKeyInput('')
    setSaving(false)
    onSaved(updated)
  }

  async function handleClearKey(): Promise<void> {
    const updated = await window.api.settings.clearApiKey(provider)
    onSaved(updated)
  }

  async function handleModelChange(newModel: string): Promise<void> {
    const updated = await window.api.settings.setModel(provider, newModel)
    onSaved(updated)
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <label>
        <span className={`status-dot ${data.hasApiKey ? 'ok' : 'missing'}`} />
        {PROVIDER_LABEL[provider]} {data.hasApiKey ? '(configurado)' : '(não configurado)'}
      </label>
      <input
        type="password"
        placeholder="cole a chave de API aqui"
        value={apiKeyInput}
        onChange={(e) => setApiKeyInput(e.target.value)}
      />
      <div className="modal-actions" style={{ marginBottom: 12 }}>
        {data.hasApiKey && (
          <button className="btn" onClick={handleClearKey}>
            Remover chave
          </button>
        )}
        <button className="btn primary" disabled={saving || !apiKeyInput.trim()} onClick={handleSaveKey}>
          {saving ? 'Salvando…' : 'Salvar chave'}
        </button>
      </div>

      <label>Modelo</label>
      <select value={data.model} onChange={(e) => handleModelChange(e.target.value)}>
        {MODEL_OPTIONS[provider].map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function SettingsModal({ settings, onClose, onSaved }: Props): React.JSX.Element {
  async function handleSwitchProvider(provider: AiProviderId): Promise<void> {
    if (provider === settings.activeProvider) return
    const updated = await window.api.settings.setActiveProvider(provider)
    onSaved(updated)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Configurações</h2>

        <label>Motor de IA ativo</label>
        <div className="modal-actions" style={{ justifyContent: 'flex-start', marginBottom: 20 }}>
          <button
            className={`btn ${settings.activeProvider === 'anthropic' ? 'primary' : ''}`}
            onClick={() => handleSwitchProvider('anthropic')}
          >
            Claude
          </button>
          <button
            className={`btn ${settings.activeProvider === 'gemini' ? 'primary' : ''}`}
            onClick={() => handleSwitchProvider('gemini')}
          >
            Gemini
          </button>
        </div>

        <ProviderKeySection provider="anthropic" data={settings.anthropic} onSaved={onSaved} />
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -10, marginBottom: 18 }}>
          Crie a chave em console.anthropic.com (Settings → API Keys) e cadastre um cartão — a
          cobrança é por uso. Busca na web tem custo adicional por busca.
        </p>

        <ProviderKeySection provider="gemini" data={settings.gemini} onSaved={onSaved} />
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -10, marginBottom: 16 }}>
          Importante: o plano Google AI Pro (assinatura do app Gemini) é separado da API — crie
          uma chave própria em aistudio.google.com (Google AI Studio), que tem camada gratuita
          para começar a testar sem cadastrar cartão.
        </p>

        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
