import * as XLSX from 'xlsx'
import { DadoPost } from '@shared/types'

export type ParsedDadoRow = Pick<DadoPost, 'link' | 'dataPublicacao'> &
  Partial<Pick<DadoPost, 'engajamentos' | 'impressoes'>>

const TARGET_SHEET_HINTS = ['publicacoes mais em alta', 'publicações mais em alta']

function normalize(text: string): string {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function findTargetSheet(workbook: XLSX.WorkBook): string {
  const match = workbook.SheetNames.find((name) =>
    TARGET_SHEET_HINTS.some((hint) => normalize(name).includes(normalize(hint)))
  )
  if (match) return match
  throw new Error(
    'Não encontrei a aba "Publicações mais em alta" neste arquivo. Confirme que é um export de ' +
      'Aggregate Analytics do LinkedIn (Analytics do seu perfil → Exportar).'
  )
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) {
    const cleaned = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function toStr(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

/**
 * Faz o parse da aba "Publicações mais em alta" do export "Aggregate Analytics" do
 * LinkedIn. Essa aba tem duas tabelas lado a lado na mesma planilha: colunas A-C são
 * o Top 50 por Engajamentos (link, data, engajamentos), colunas E-G são o Top 50 por
 * Impressões (link, data, impressões) — nem todo link aparece nas duas listas.
 */
export function parseDadosFile(filePath: string): ParsedDadoRow[] {
  const workbook = XLSX.readFile(filePath)
  const sheetName = findTargetSheet(workbook)
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })

  const headerIdx = rows.findIndex((row) => {
    const joined = row.map((c) => normalize(toStr(c))).join(' ')
    return joined.includes('engajamento') && joined.includes('impress')
  })
  if (headerIdx === -1) {
    throw new Error(
      'Não reconheci o formato da aba "Publicações mais em alta" — o cabeçalho esperado ' +
        '(Engajamentos/Impressões) não foi encontrado.'
    )
  }

  const merged = new Map<string, ParsedDadoRow>()

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const leftLink = toStr(row[0])
    const rightLink = toStr(row[4])
    if (!leftLink && !rightLink) continue

    if (leftLink) {
      const existing = merged.get(leftLink) ?? { link: leftLink, dataPublicacao: toStr(row[1]) }
      existing.dataPublicacao = existing.dataPublicacao || toStr(row[1])
      existing.engajamentos = toNumber(row[2])
      merged.set(leftLink, existing)
    }
    if (rightLink) {
      const existing = merged.get(rightLink) ?? { link: rightLink, dataPublicacao: toStr(row[5]) }
      existing.dataPublicacao = existing.dataPublicacao || toStr(row[5])
      existing.impressoes = toNumber(row[6])
      merged.set(rightLink, existing)
    }
  }

  return [...merged.values()]
}
