import { safeStorage } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { AiProviderId } from '@shared/types'
import { readJson, writeJson, getDataDir } from './jsonStore'

const SETTINGS_FILE = 'settings.json'
const LEGACY_API_KEY_FILE = 'apikey.enc' // chave única de antes de existir suporte a múltiplos provedores

export const DEFAULT_MODELS: Record<AiProviderId, string> = {
  anthropic: 'claude-sonnet-5',
  gemini: 'gemini-3.6-flash'
}

// O Google vem desativando modelos Gemini mais cedo do que a data de desligamento anunciada
// (ex: gemini-2.5-flash/pro passaram a dar 404 "no longer available" para chaves novas antes
// da data oficial). Se o usuário tiver um desses salvo, troca silenciosamente pelo substituto
// recomendado pela própria Google, em vez de voltar a quebrar com o mesmo erro.
const DEPRECATED_GEMINI_MODEL_REPLACEMENTS: Record<string, string> = {
  'gemini-2.5-flash': 'gemini-3.6-flash',
  'gemini-2.5-flash-lite': 'gemini-3.6-flash',
  'gemini-2.5-pro': 'gemini-3.1-pro-preview',
  'gemini-2.0-flash': 'gemini-3.6-flash',
  'gemini-2.0-flash-lite': 'gemini-3.6-flash'
}

interface SettingsFile {
  activeProvider?: AiProviderId
  anthropicModel?: string
  geminiModel?: string
  /** @deprecated campo de versões anteriores (só existia a Anthropic) */
  model?: string
}

async function readSettingsFile(): Promise<SettingsFile> {
  return readJson<SettingsFile>(SETTINGS_FILE, {})
}

export async function getActiveProviderId(): Promise<AiProviderId> {
  const settings = await readSettingsFile()
  return settings.activeProvider ?? 'anthropic'
}

export async function setActiveProviderId(provider: AiProviderId): Promise<void> {
  const settings = await readSettingsFile()
  await writeJson<SettingsFile>(SETTINGS_FILE, { ...settings, activeProvider: provider })
}

export async function getModel(provider: AiProviderId): Promise<string> {
  const settings = await readSettingsFile()
  if (provider === 'anthropic') {
    // "model" é o campo legado (de antes de existir o Gemini) — preserva a escolha do usuário.
    return settings.anthropicModel ?? settings.model ?? DEFAULT_MODELS.anthropic
  }
  const stored = settings.geminiModel ?? DEFAULT_MODELS.gemini
  return DEPRECATED_GEMINI_MODEL_REPLACEMENTS[stored] ?? stored
}

export async function setModel(provider: AiProviderId, model: string): Promise<void> {
  const settings = await readSettingsFile()
  const key = provider === 'anthropic' ? 'anthropicModel' : 'geminiModel'
  await writeJson<SettingsFile>(SETTINGS_FILE, { ...settings, [key]: model })
}

function apiKeyPath(provider: AiProviderId): string {
  return path.join(getDataDir(), `apikey-${provider}.enc`)
}

function legacyApiKeyPath(): string {
  return path.join(getDataDir(), LEGACY_API_KEY_FILE)
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function hasApiKey(provider: AiProviderId): Promise<boolean> {
  if (await fileExists(apiKeyPath(provider))) return true
  // Compatibilidade: chave da Anthropic salva antes de existir o suporte a múltiplos provedores.
  if (provider === 'anthropic' && (await fileExists(legacyApiKeyPath()))) return true
  return false
}

async function readKeyFile(filePath: string): Promise<string | null> {
  try {
    const encrypted = await fs.readFile(filePath)
    if (!safeStorage.isEncryptionAvailable()) {
      // Fallback: armazenado em texto puro (ambiente sem keychain disponível).
      return encrypted.toString('utf-8')
    }
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

export async function getApiKey(provider: AiProviderId): Promise<string | null> {
  const direct = await readKeyFile(apiKeyPath(provider))
  if (direct) return direct
  if (provider === 'anthropic') return readKeyFile(legacyApiKeyPath())
  return null
}

export async function setApiKey(provider: AiProviderId, key: string): Promise<void> {
  const trimmed = key.trim()
  const toStore = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(trimmed)
    : Buffer.from(trimmed, 'utf-8')
  await fs.mkdir(getDataDir(), { recursive: true })
  await fs.writeFile(apiKeyPath(provider), toStore)
}

export async function clearApiKey(provider: AiProviderId): Promise<void> {
  try {
    await fs.unlink(apiKeyPath(provider))
  } catch {
    // já não existia, ok
  }
  if (provider === 'anthropic') {
    try {
      await fs.unlink(legacyApiKeyPath())
    } catch {
      // já não existia, ok
    }
  }
}
