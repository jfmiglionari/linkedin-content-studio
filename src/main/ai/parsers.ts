import {
  ClosingType,
  HookType,
  ImageStyleType,
  Pauta,
  PostAnalysis,
  PromptKey,
  PromptSuggestion
} from '@shared/types'

const SUGGESTION_START = '[SUGESTAO_DE_AJUSTE_DE_PROMPT]'
const SUGGESTION_END = '[FIM_DA_SUGESTAO]'

function normalize(text: string): string {
  // Remove acentos só para comparação robusta de marcadores (o texto original é preservado no resultado).
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Procura o bloco de sugestão de ajuste de prompt no texto e o remove do texto principal.
 * Nunca aplica a sugestão sozinho — só extrai para exibição (Aplicar/Ignorar na UI).
 */
export function extractSuggestionBlock(text: string): {
  cleanText: string
  suggestion: PromptSuggestion | null
} {
  const normalized = normalize(text)
  const startIdx = normalized.indexOf(normalize(SUGGESTION_START))
  if (startIdx === -1) return { cleanText: text.trim(), suggestion: null }

  const endIdx = normalized.indexOf(normalize(SUGGESTION_END), startIdx)
  const blockEnd = endIdx === -1 ? text.length : endIdx + SUGGESTION_END.length
  const block = text.slice(startIdx, blockEnd)
  const cleanText = (text.slice(0, startIdx) + text.slice(blockEnd)).trim()

  const promptKeyMatch = block.match(/Prompt alvo:\s*(pesquisa|post|imagem)/i)
  const justificativaMatch = block.match(/Justificativa:\s*([\s\S]*?)(?=\nTexto proposto:|$)/i)
  const textoPropostoMatch = block.match(
    /Texto proposto:\s*([\s\S]*?)(?=\[FIM_DA_SUGESTAO\]|$)/i
  )

  if (!promptKeyMatch || !textoPropostoMatch) {
    return { cleanText, suggestion: null }
  }

  const suggestion: PromptSuggestion = {
    promptKey: promptKeyMatch[1].toLowerCase() as PromptKey,
    justificativa: (justificativaMatch?.[1] ?? '').trim(),
    textoProposto: textoPropostoMatch[1].trim()
  }

  return { cleanText, suggestion }
}

export const APP_SUGGESTION_INSTRUCTIONS = `INSTRUÇÃO INTERNA DO APLICATIVO (não faz parte do prompt original acima, é uma camada adicional):
Se, com base nos dados de performance fornecidos como contexto ou em um padrão que você perceber se repetindo, você identificar que um dos 3 prompts do pipeline (pesquisa, post ou imagem) deveria ser ajustado, você PODE incluir ao final da sua resposta — depois de todo o conteúdo normal — um bloco extra exatamente neste formato:

[SUGESTAO_DE_AJUSTE_DE_PROMPT]
Prompt alvo: pesquisa OU post OU imagem
Justificativa: [explique em 2-4 linhas, de preferência citando o dado que embasa a sugestão]
Texto proposto: [o novo texto completo sugerido para esse prompt]
[FIM_DA_SUGESTAO]

Só inclua esse bloco quando tiver uma sugestão genuína e bem fundamentada — não force uma sugestão a cada resposta. Nunca edite os prompts você mesmo; esse bloco é só uma sugestão que o usuário vai revisar e aprovar manualmente no aplicativo.`

export interface ParsedPauta {
  titulo: string
  tipo: 'Tipo 1' | 'Tipo 2' | null
  caseEmpresa: string
  resumo: string
}

/** Parser tolerante do formato de output do Prompt de Pesquisa (10 pautas numeradas). */
export function parsePautasFromText(text: string): ParsedPauta[] {
  const blocks = text.split(/\n(?=\d+\.\s*TIPO\s*[12]\s*[—-])/i)
  const pautas: ParsedPauta[] = []

  for (const block of blocks) {
    const headerMatch = block.match(/^\d+\.\s*(TIPO\s*[12])\s*[—-]\s*(.+)/i)
    if (!headerMatch) continue

    const tipoRaw = headerMatch[1].toUpperCase().replace(/\s+/g, ' ')
    const tipo: 'Tipo 1' | 'Tipo 2' = tipoRaw.includes('1') ? 'Tipo 1' : 'Tipo 2'
    const titulo = headerMatch[2].trim()

    const caseMatch = block.match(/Case:\s*(.+)/i)
    const resumoMatch = block.match(/Resumo:\s*([\s\S]*?)(?=\nDados de resultado:|$)/i)

    pautas.push({
      titulo,
      tipo,
      caseEmpresa: caseMatch?.[1]?.trim() ?? '',
      resumo: resumoMatch?.[1]?.trim() ?? ''
    })
  }

  return pautas
}

export interface ParsedPost {
  post: string
  fontes: string | null
  autoavaliacao: string | null
}

/** Parser tolerante do formato de output do Prompt de Post (3 blocos). */
export function parsePostBlocks(text: string): ParsedPost {
  const fontesMatch = text.match(
    /\[?FONTES PESQUISADAS\]?[:\s]*([\s\S]*?)(?=\n?\[?BLOCO 3|AUTOAVALIA[ÇC][ÃA]O|$)/i
  )
  const autoavaliacaoMatch = text.match(/AUTOAVALIA[ÇC][ÃA]O[:\s]*([\s\S]*)$/i)

  let post = text
  if (fontesMatch?.index !== undefined) {
    post = text.slice(0, fontesMatch.index)
  } else if (autoavaliacaoMatch?.index !== undefined) {
    post = text.slice(0, autoavaliacaoMatch.index)
  }

  return {
    post: post.trim(),
    fontes: fontesMatch?.[1]?.trim() || null,
    autoavaliacao: autoavaliacaoMatch?.[1]?.trim() || null
  }
}

export function pautaSummaryLine(p: Pick<Pauta, 'titulo' | 'caseEmpresa' | 'status'>): string {
  return `- [${p.status}] ${p.titulo} (case: ${p.caseEmpresa})`
}

const HOOK_TYPES: HookType[] = [
  'dado_numero',
  'pergunta',
  'contraste',
  'afirmacao_direta',
  'historia_caso',
  'outro'
]

const CLOSING_TYPES: ClosingType[] = [
  'pergunta_reflexiva',
  'afirmacao_tese',
  'chamada_para_acao',
  'dado_impacto',
  'outro'
]

const IMAGE_STYLE_TYPES: ImageStyleType[] = [
  'grafico_dado',
  'foto_pessoas',
  'ilustracao_conceito',
  'texto_destaque',
  'produto_screenshot',
  'outro'
]

function coerceEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  const str = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const match = allowed.find((a) => a.toLowerCase() === str)
  return match ?? fallback
}

function coerceOptionalEnum<T extends string>(
  value: unknown,
  allowed: T[],
  fallback: T
): T | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const str = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return allowed.find((a) => a.toLowerCase() === str) ?? fallback
}

function coerceTema(value: unknown): 'Tipo 1' | 'Tipo 2' | null {
  const str = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (str.includes('1')) return 'Tipo 1'
  if (str.includes('2')) return 'Tipo 2'
  return null
}

/**
 * Extrai o JSON de classificação da resposta da IA (tolerante a texto extra ao redor,
 * ou o bloco vindo dentro de ```json ... ```), validando os campos enum contra a
 * taxonomia conhecida (cai para 'outro' se a IA responder algo fora da lista).
 */
export function parseClassificationJSON(text: string): PostAnalysis {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const braceMatch = candidate.match(/\{[\s\S]*\}/)
  const jsonText = braceMatch ? braceMatch[0] : candidate

  let raw: Record<string, unknown> = {}
  try {
    raw = JSON.parse(jsonText)
  } catch {
    raw = {}
  }

  return {
    hookType: coerceEnum(raw.hookType, HOOK_TYPES, 'outro'),
    hookNota: typeof raw.hookNota === 'string' ? raw.hookNota.trim() : '',
    tema: coerceTema(raw.tema),
    temaAssunto: typeof raw.temaAssunto === 'string' ? raw.temaAssunto.trim() : '',
    estruturaNota: typeof raw.estruturaNota === 'string' ? raw.estruturaNota.trim() : '',
    closingType: coerceEnum(raw.closingType, CLOSING_TYPES, 'outro'),
    closingNota: typeof raw.closingNota === 'string' ? raw.closingNota.trim() : '',
    imagemTipo: coerceOptionalEnum(raw.imagemTipo, IMAGE_STYLE_TYPES, 'outro'),
    imagemNota: typeof raw.imagemNota === 'string' && raw.imagemNota.trim() ? raw.imagemNota.trim() : undefined,
    analisadoEm: new Date().toISOString()
  }
}
