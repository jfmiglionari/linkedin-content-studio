import type { AiProviderId } from '@shared/types'
import { getActiveProviderId, getApiKey, getModel } from '../store/settings'
import { anthropicProvider } from './providers/anthropic'
import { geminiProvider } from './providers/gemini'
import type { AiProvider } from './types'

const PROVIDER_LABEL: Record<AiProviderId, string> = {
  anthropic: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)'
}

function providerImpl(id: AiProviderId): AiProvider {
  return id === 'anthropic' ? anthropicProvider : geminiProvider
}

export interface ResolvedProvider {
  id: AiProviderId
  provider: AiProvider
  apiKey: string
  model: string
}

/**
 * Resolve o provedor ativo agora (Claude ou Gemini) junto com sua chave de API e modelo
 * escolhidos nas Configurações. Lança um erro claro se a chave desse provedor não estiver
 * configurada — nunca tenta rodar uma ação sem chave.
 */
export async function resolveActiveProvider(): Promise<ResolvedProvider> {
  const id = await getActiveProviderId()
  const apiKey = await getApiKey(id)
  if (!apiKey) {
    throw new Error(
      `Nenhuma chave de API configurada para ${PROVIDER_LABEL[id]}. Abra as Configurações e cole sua chave.`
    )
  }
  const model = await getModel(id)
  return { id, provider: providerImpl(id), apiKey, model }
}
