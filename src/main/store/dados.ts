import { randomUUID } from 'crypto'
import { readJson, writeJson } from './jsonStore'
import { ChatAttachment, DadoPost, PostAnalysis } from '@shared/types'
import { ParsedDadoRow } from '../importer'

const FILE = 'dados.json'

export async function listDados(): Promise<DadoPost[]> {
  return readJson<DadoPost[]>(FILE, [])
}

/**
 * Mescla linhas importadas por `link`: se já existe um post com esse link, atualiza só
 * as métricas/data (preservando texto/análise/nota já salvos); senão cria uma linha nova.
 */
export async function importDados(
  rows: ParsedDadoRow[]
): Promise<{ dados: DadoPost[]; importedCount: number; updatedCount: number }> {
  const current = await listDados()
  const byLink = new Map(current.map((d) => [d.link, d]))
  const importedAt = new Date().toISOString()
  let importedCount = 0
  let updatedCount = 0

  for (const row of rows) {
    const existing = byLink.get(row.link)
    if (existing) {
      byLink.set(row.link, {
        ...existing,
        dataPublicacao: row.dataPublicacao || existing.dataPublicacao,
        engajamentos: row.engajamentos ?? existing.engajamentos,
        impressoes: row.impressoes ?? existing.impressoes,
        importedAt
      })
      updatedCount++
    } else {
      byLink.set(row.link, {
        id: randomUUID(),
        link: row.link,
        dataPublicacao: row.dataPublicacao,
        engajamentos: row.engajamentos,
        impressoes: row.impressoes,
        nota: '',
        importedAt
      })
      importedCount++
    }
  }

  const next = [...byLink.values()]
  await writeJson(FILE, next)
  return { dados: next, importedCount, updatedCount }
}

export async function updateDado(id: string, patch: Partial<DadoPost>): Promise<DadoPost[]> {
  const current = await listDados()
  const next = current.map((d) => (d.id === id ? { ...d, ...patch } : d))
  await writeJson(FILE, next)
  return next
}

export async function deleteDado(id: string): Promise<DadoPost[]> {
  const current = await listDados()
  const next = current.filter((d) => d.id !== id)
  await writeJson(FILE, next)
  return next
}

export async function deleteManyDados(ids: string[]): Promise<DadoPost[]> {
  const idSet = new Set(ids)
  const current = await listDados()
  const next = current.filter((d) => !idSet.has(d.id))
  await writeJson(FILE, next)
  return next
}

export async function clearAllDados(): Promise<DadoPost[]> {
  await writeJson(FILE, [])
  return []
}

/** Salva o texto colado do post e invalida a classificação anterior (ficou obsoleta). */
export async function setPostTexto(id: string, textoPost: string): Promise<DadoPost[]> {
  const current = await listDados()
  const next = current.map((d) => (d.id === id ? { ...d, textoPost, analise: undefined } : d))
  await writeJson(FILE, next)
  return next
}

/** Salva/troca a imagem anexada e invalida a classificação anterior (ficou obsoleta). */
export async function setPostImagem(
  id: string,
  imagemPost: ChatAttachment | undefined
): Promise<DadoPost[]> {
  const current = await listDados()
  const next = current.map((d) => (d.id === id ? { ...d, imagemPost, analise: undefined } : d))
  await writeJson(FILE, next)
  return next
}

export async function setPostAnalise(id: string, analise: PostAnalysis): Promise<DadoPost[]> {
  const current = await listDados()
  const next = current.map((d) => (d.id === id ? { ...d, analise } : d))
  await writeJson(FILE, next)
  return next
}

export async function getDado(id: string): Promise<DadoPost | undefined> {
  const current = await listDados()
  return current.find((d) => d.id === id)
}
