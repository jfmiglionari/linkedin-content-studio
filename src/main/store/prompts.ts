import { readJson, writeJson } from './jsonStore'
import { PromptKey, PromptsState } from '@shared/types'
import { SEED_PROMPT_PESQUISA, SEED_PROMPT_POST, SEED_PROMPT_IMAGEM } from '@shared/seedPrompts'

const FILE = 'prompts.json'

const seed: PromptsState = {
  pesquisa: SEED_PROMPT_PESQUISA,
  post: SEED_PROMPT_POST,
  imagem: SEED_PROMPT_IMAGEM,
  updatedAt: {},
  previous: {}
}

export async function getPrompts(): Promise<PromptsState> {
  const stored = await readJson<PromptsState>(FILE, seed)
  // Compatibilidade com prompts.json salvo antes do campo `previous` existir.
  return { ...stored, previous: stored.previous ?? {} }
}

export async function setPrompt(key: PromptKey, text: string): Promise<PromptsState> {
  const current = await getPrompts()
  const next: PromptsState = {
    ...current,
    [key]: text,
    updatedAt: { ...current.updatedAt, [key]: new Date().toISOString() },
    previous: { ...current.previous, [key]: current[key] }
  }
  await writeJson(FILE, next)
  return next
}

/** Reverte `key` para a versão salva anterior (um nível). Chamar de novo alterna de volta. */
export async function undoPrompt(key: PromptKey): Promise<PromptsState> {
  const current = await getPrompts()
  const previousText = current.previous[key]
  if (previousText === undefined) return current

  const next: PromptsState = {
    ...current,
    [key]: previousText,
    updatedAt: { ...current.updatedAt, [key]: new Date().toISOString() },
    previous: { ...current.previous, [key]: current[key] }
  }
  await writeJson(FILE, next)
  return next
}
