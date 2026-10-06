import React, { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import { ChatProvider, useChatContext } from './context/ChatContext'
import { ChatTab } from './tabs/ChatTab'
import { PromptTab } from './tabs/PromptTab'
import { DadosTab } from './tabs/DadosTab'
import { SettingsModal } from './components/SettingsModal'
import { LinkedInLogo } from './components/LinkedInLogo'
import { ConversationNavList } from './components/ConversationNavList'

type TabId = 'chat' | 'pesquisa' | 'post' | 'imagem' | 'dados'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'pesquisa', label: 'Prompt de Pesquisa' },
  { id: 'post', label: 'Prompt de Post' },
  { id: 'imagem', label: 'Prompt de Imagem' },
  { id: 'dados', label: 'Dados' }
]

function AppShell(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('chat')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const { registerNavigateToChat } = useChatContext()

  useEffect(() => {
    window.api.settings.get().then(setSettings)
  }, [])

  useEffect(() => {
    registerNavigateToChat(() => setActiveTab('chat'))
  }, [registerNavigateToChat])

  useEffect(() => {
    if (settings && !settings[settings.activeProvider].hasApiKey) {
      setSettingsOpen(true)
    }
  }, [settings])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-title">
          <LinkedInLogo />
          <span>LinkedIn Content Studio</span>
        </div>
        <nav className="sidebar-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <ConversationNavList onSelect={() => setActiveTab('chat')} />

        <div className="sidebar-footer">
          <button onClick={() => setSettingsOpen(true)}>
            <span
              className={`status-dot ${settings && settings[settings.activeProvider].hasApiKey ? 'ok' : 'missing'}`}
            />
            Configurações
          </button>
        </div>
      </aside>

      <main className="main-panel">
        {activeTab === 'chat' && <ChatTab />}
        {activeTab !== 'chat' && activeTab !== 'dados' && (
          <div className="panel-body">
            {activeTab === 'pesquisa' && (
              <PromptTab
                promptKey="pesquisa"
                title="Prompt de Pesquisa"
                description="Editável por você a qualquer momento. Define como o app pesquisa pautas novas."
              />
            )}
            {activeTab === 'post' && (
              <PromptTab
                promptKey="post"
                title="Prompt de Post"
                description="Editável por você a qualquer momento. Define como o app escreve o post final."
                extraInputLabel="Case / notícia base (opcional se você já tiver escolhido uma pauta pelo Chat)"
                extraInputPlaceholder="Cole aqui a notícia ou case que deve servir de base para o post…"
              />
            )}
            {activeTab === 'imagem' && (
              <PromptTab
                promptKey="imagem"
                title="Prompt de Imagem"
                description="Editável por você a qualquer momento. Define como o app gera o prompt de imagem para o Gemini."
                extraInputLabel="Texto do post (opcional se você já tiver gerado um post pelo Chat)"
                extraInputPlaceholder="Cole aqui o texto do post do LinkedIn…"
              />
            )}
          </div>
        )}
        {activeTab === 'dados' && (
          <div className="panel-body">
            <DadosTab />
          </div>
        )}
      </main>

      {settingsOpen && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={setSettings}
        />
      )}
    </div>
  )
}

export function App(): React.JSX.Element {
  return (
    <ChatProvider>
      <AppShell />
    </ChatProvider>
  )
}
