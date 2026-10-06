import { randomUUID } from 'crypto'
import { readJson, writeJson } from './jsonStore'
import { Pauta, PautaStatus } from '@shared/types'

const FILE = 'pautas.json'

export async function listPautas(): Promise<Pauta[]> {
  return readJson<Pauta[]>(FILE, [])
}

export async function addPautas(
  novas: Array<Pick<Pauta, 'titulo' | 'tipo' | 'caseEmpresa' | 'resumo'>>
): Promise<Pauta[]> {
  const current = await listPautas()
  const now = new Date().toISOString()
  const created: Pauta[] = novas.map((p) => ({
    id: randomUUID(),
    titulo: p.titulo,
    tipo: p.tipo,
    caseEmpresa: p.caseEmpresa,
    resumo: p.resumo,
    status: 'sugerida' as PautaStatus,
    criadaEm: now,
    atualizadaEm: now
  }))
  const next = [...current, ...created]
  await writeJson(FILE, next)
  return next
}

export async function updatePautaStatus(id: string, status: PautaStatus): Promise<Pauta[]> {
  const current = await listPautas()
  const next = current.map((p) =>
    p.id === id ? { ...p, status, atualizadaEm: new Date().toISOString() } : p
  )
  await writeJson(FILE, next)
  return next
}

/** Texto resumido para injetar como contexto no prompt de Pesquisa (evitar repetição de tema). */
export async function summarizeForResearch(): Promise<string> {
  const pautas = await listPautas()
  if (pautas.length === 0) return 'Nenhuma pauta sugerida ou publicada ainda.'
  return pautas
    .map((p) => `- [${p.status}] ${p.titulo} (case: ${p.caseEmpresa})`)
    .join('\n')
}
