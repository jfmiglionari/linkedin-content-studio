// Tipos compartilhados entre main process e renderer (via IPC).

export type PromptKey = 'pesquisa' | 'post' | 'imagem'

export interface PromptsState {
  pesquisa: string
  post: string
  imagem: string
  updatedAt: Partial<Record<PromptKey, string>>
  /** Versão salva anterior de cada prompt, usada pelo botão "Desfazer" (um nível). */
  previous: Partial<Record<PromptKey, string>>
}

export type PautaStatus = 'sugerida' | 'escolhida' | 'publicada' | 'descartada'

export interface Pauta {
  id: string
  titulo: string
  tipo: 'Tipo 1' | 'Tipo 2' | null
  caseEmpresa: string
  resumo: string
  status: PautaStatus
  criadaEm: string
  atualizadaEm: string
}

export type HookType =
  | 'dado_numero'
  | 'pergunta'
  | 'contraste'
  | 'afirmacao_direta'
  | 'historia_caso'
  | 'outro'

export type ClosingType =
  | 'pergunta_reflexiva'
  | 'afirmacao_tese'
  | 'chamada_para_acao'
  | 'dado_impacto'
  | 'outro'

export type ImageStyleType =
  | 'grafico_dado'
  | 'foto_pessoas'
  | 'ilustracao_conceito'
  | 'texto_destaque'
  | 'produto_screenshot'
  | 'outro'

export interface PostAnalysis {
  hookType: HookType
  hookNota: string
  /** Reaproveita a mesma taxonomia já usada no Prompt de Pesquisa (Tipo 1 / Tipo 2). */
  tema: 'Tipo 1' | 'Tipo 2' | null
  temaAssunto: string
  estruturaNota: string
  closingType: ClosingType
  closingNota: string
  /** Só preenchido quando a classificação incluiu a imagem do post. */
  imagemTipo?: ImageStyleType
  imagemNota?: string
  analisadoEm: string
}

export interface DadoPost {
  id: string
  link: string
  dataPublicacao: string
  engajamentos?: number
  impressoes?: number
  /** Texto do post, colado manualmente pelo usuário (o export do LinkedIn não traz isso). */
  textoPost?: string
  /** Imagem que acompanhou o post, anexada manualmente pelo usuário. */
  imagemPost?: ChatAttachment
  /** Classificação gerada pela IA a partir de `textoPost` (e `imagemPost`, quando presente). */
  analise?: PostAnalysis
  nota: string
  /** Quando essa linha foi importada/atualizada no app (não é a data de publicação do post). */
  importedAt?: string
}

export type ChatRole = 'user' | 'assistant' | 'system-card'

export type ChatCardType =
  | 'pautas'
  | 'post'
  | 'imagem'
  | 'sugestao-prompt'
  | 'erro'

export interface ChatCard {
  type: ChatCardType
  payload: unknown
}

export type AttachmentKind = 'image' | 'pdf' | 'document'

export interface ChatAttachment {
  id: string
  name: string
  mimeType: string
  kind: AttachmentKind
  sizeBytes: number
  /** Só para imagens: data URL já pronta para <img src>. */
  previewDataUrl?: string
  /** Só para document (docx/xlsx/xls): texto já extraído no momento do anexo. */
  extractedText?: string
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  card?: ChatCard
  attachments?: ChatAttachment[]
  createdAt: string
  streaming?: boolean
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type AiProviderId = 'anthropic' | 'gemini'

export interface ProviderSettings {
  model: string
  hasApiKey: boolean
}

export interface Settings {
  activeProvider: AiProviderId
  anthropic: ProviderSettings
  gemini: ProviderSettings
}

export type RunAction = 'pesquisa' | 'post' | 'imagem'

export interface RunPromptRequest {
  action: RunAction
  /** Texto livre do usuário (Chat) ou contexto extra (ex: pauta escolhida, texto do post) */
  input?: string
}

export interface StreamChunkEvent {
  requestId: string
  delta: string
}

export interface StreamDoneEvent {
  requestId: string
  messages: ChatMessage[]
}

export interface StreamErrorEvent {
  requestId: string
  error: string
}

export interface PromptSuggestion {
  promptKey: PromptKey
  justificativa: string
  textoProposto: string
}

export interface PatternsSummary {
  sampleSize: number
  ready: boolean
  minRequired: number
  summaryText: string
}
