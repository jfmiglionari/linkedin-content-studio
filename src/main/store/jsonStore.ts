import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

function dataDir(): string {
  return app.getPath('userData')
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true })
}

// Fila de execução por arquivo: serializa leituras/escritas do mesmo arquivo para
// evitar race conditions (ex: React StrictMode disparando efeitos duas vezes em dev,
// ou duas ações do pipeline lendo/escrevendo o mesmo arquivo quase ao mesmo tempo).
const queues = new Map<string, Promise<unknown>>()

function withFileLock<T>(fileName: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(fileName) ?? Promise.resolve()
  const next = previous.then(task, task)
  // Guarda a promise "silenciada" na fila (erros de uma tarefa não devem travar a próxima).
  queues.set(
    fileName,
    next.catch(() => undefined)
  )
  return next
}

/**
 * Lê um arquivo JSON em userData. Se não existir, cria com defaultValue e retorna defaultValue.
 * Escrita é atômica (escreve em um .tmp com nome único e renomeia) e serializada por arquivo,
 * para nunca deixar o arquivo corrompido a meio caminho nem sofrer race condition de escrita.
 */
export async function readJson<T>(fileName: string, defaultValue: T): Promise<T> {
  return withFileLock(fileName, () => readJsonUnlocked(fileName, defaultValue))
}

async function readJsonUnlocked<T>(fileName: string, defaultValue: T): Promise<T> {
  await ensureDir()
  const filePath = path.join(dataDir(), fileName)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException
    if (nodeErr.code === 'ENOENT') {
      await writeJsonUnlocked(fileName, defaultValue)
      return defaultValue
    }
    throw err
  }
}

export async function writeJson<T>(fileName: string, value: T): Promise<void> {
  return withFileLock(fileName, () => writeJsonUnlocked(fileName, value))
}

async function writeJsonUnlocked<T>(fileName: string, value: T): Promise<void> {
  await ensureDir()
  const filePath = path.join(dataDir(), fileName)
  const tmpPath = `${filePath}.${randomUUID()}.tmp`
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf-8')
  await fs.rename(tmpPath, filePath)
}

export function getDataDir(): string {
  return dataDir()
}
