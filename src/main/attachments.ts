import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { app, dialog, BrowserWindow } from 'electron'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import { AttachmentKind, ChatAttachment } from '@shared/types'

const MAX_ATTACHMENTS = 8
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

function attachmentsDir(): string {
  return path.join(app.getPath('userData'), 'attachments')
}

function classify(ext: string): { kind: AttachmentKind; mimeType: string } | null {
  const lower = ext.toLowerCase()
  if (IMAGE_MIME_BY_EXT[lower]) return { kind: 'image', mimeType: IMAGE_MIME_BY_EXT[lower] }
  if (lower === '.pdf') return { kind: 'pdf', mimeType: 'application/pdf' }
  if (lower === '.docx')
    return {
      kind: 'document',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
  if (lower === '.xlsx')
    return {
      kind: 'document',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  if (lower === '.xls') return { kind: 'document', mimeType: 'application/vnd.ms-excel' }
  return null
}

async function extractSpreadsheetText(filePath: string): Promise<string> {
  const workbook = XLSX.readFile(filePath)
  const parts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    if (csv.trim()) parts.push(`[Aba: ${sheetName}]\n${csv.trim()}`)
  }
  return parts.join('\n\n')
}

async function extractDocxText(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value.trim()
}

async function extractText(filePath: string, mimeType: string): Promise<string | undefined> {
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocxText(filePath)
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    return extractSpreadsheetText(filePath)
  }
  return undefined
}

async function buildImagePreview(filePath: string, mimeType: string): Promise<string> {
  const buffer = await fs.readFile(filePath)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export async function pickAttachments(
  win: BrowserWindow | undefined
): Promise<ChatAttachment[] | { error: string }> {
  const result = await dialog.showOpenDialog(win as BrowserWindow, {
    title: 'Anexar arquivos',
    filters: [
      { name: 'Anexos', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'xlsx', 'xls', 'docx'] }
    ],
    properties: ['openFile', 'multiSelections']
  })
  if (result.canceled || result.filePaths.length === 0) return []

  if (result.filePaths.length > MAX_ATTACHMENTS) {
    return { error: `Selecione no máximo ${MAX_ATTACHMENTS} arquivos por vez.` }
  }

  await fs.mkdir(attachmentsDir(), { recursive: true })

  const attachments: ChatAttachment[] = []
  for (const filePath of result.filePaths) {
    const ext = path.extname(filePath)
    const classified = classify(ext)
    if (!classified) {
      return { error: `Tipo de arquivo não suportado: ${path.basename(filePath)}` }
    }
    const stat = await fs.stat(filePath)
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      return { error: `"${path.basename(filePath)}" é maior que ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.` }
    }

    const id = randomUUID()
    const destPath = path.join(attachmentsDir(), `${id}${ext.toLowerCase()}`)
    await fs.copyFile(filePath, destPath)

    const attachment: ChatAttachment = {
      id,
      name: path.basename(filePath),
      mimeType: classified.mimeType,
      kind: classified.kind,
      sizeBytes: stat.size
    }

    if (classified.kind === 'image') {
      attachment.previewDataUrl = await buildImagePreview(destPath, classified.mimeType)
    }
    if (classified.kind === 'document') {
      attachment.extractedText = await extractText(destPath, classified.mimeType)
    }

    attachments.push(attachment)
  }

  return attachments
}

/** Diálogo restrito a imagens, para anexar a imagem que acompanhou um post (aba Dados). */
export async function pickSingleImage(
  win: BrowserWindow | undefined
): Promise<ChatAttachment | { error: string } | null> {
  const result = await dialog.showOpenDialog(win as BrowserWindow, {
    title: 'Anexar imagem do post',
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const ext = path.extname(filePath)
  const classified = classify(ext)
  if (!classified || classified.kind !== 'image') {
    return { error: `Tipo de imagem não suportado: ${path.basename(filePath)}` }
  }
  const stat = await fs.stat(filePath)
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    return { error: `"${path.basename(filePath)}" é maior que ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.` }
  }

  await fs.mkdir(attachmentsDir(), { recursive: true })
  const id = randomUUID()
  const destPath = path.join(attachmentsDir(), `${id}${ext.toLowerCase()}`)
  await fs.copyFile(filePath, destPath)

  return {
    id,
    name: path.basename(filePath),
    mimeType: classified.mimeType,
    kind: 'image',
    sizeBytes: stat.size,
    previewDataUrl: await buildImagePreview(destPath, classified.mimeType)
  }
}

function attachmentPath(attachment: ChatAttachment): string {
  const ext = path.extname(attachment.name).toLowerCase() || guessExtFromMime(attachment.mimeType)
  return path.join(attachmentsDir(), `${attachment.id}${ext}`)
}

function guessExtFromMime(mimeType: string): string {
  const entry = Object.entries(IMAGE_MIME_BY_EXT).find(([, mime]) => mime === mimeType)
  if (entry) return entry[0]
  if (mimeType === 'application/pdf') return '.pdf'
  return ''
}

/** Lê e re-encoda em base64 sob demanda — só para anexos binários (image/pdf) reenviados ao modelo. */
export async function readAttachmentForApi(
  attachment: ChatAttachment
): Promise<{ mimeType: string; dataBase64: string } | null> {
  if (attachment.kind === 'document') return null
  const buffer = await fs.readFile(attachmentPath(attachment))
  return { mimeType: attachment.mimeType, dataBase64: buffer.toString('base64') }
}
