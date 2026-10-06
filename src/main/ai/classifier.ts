import { resolveActiveProvider } from './activeProvider'
import { parseClassificationJSON } from './parsers'
import { readAttachmentForApi } from '../attachments'
import type { AiContentBlock } from './types'
import { ChatAttachment, PostAnalysis } from '@shared/types'

const CLASSIFICATION_SYSTEM = `Você é um analista de conteúdo do LinkedIn. Vai receber o texto de um post (e, quando
disponível, também a imagem que acompanhou o post no feed) e deve classificar em dimensões de texto e, se a imagem
estiver presente, também de imagem — retornando SOMENTE um JSON válido (sem texto antes ou depois, sem markdown),
exatamente com estas chaves:

{
  "hookType": um destes valores exatos: "dado_numero" | "pergunta" | "contraste" | "afirmacao_direta" | "historia_caso" | "outro",
  "hookNota": string curta (1-2 frases) descrevendo/citando o gancho de abertura usado,
  "tema": "Tipo 1" ou "Tipo 2" (ver definição abaixo),
  "temaAssunto": string curta com o assunto/setor do post (ex: "varejo/precificação", "fintech/dados"),
  "estruturaNota": string curta descrevendo a estrutura do meio do texto (tamanho aproximado, tom, se usa listas/quebras, nível técnico),
  "closingType": um destes valores exatos: "pergunta_reflexiva" | "afirmacao_tese" | "chamada_para_acao" | "dado_impacto" | "outro",
  "closingNota": string curta descrevendo/citando como o post fecha,
  "imagemTipo": SÓ preencha se uma imagem foi enviada junto — um destes valores exatos: "grafico_dado" | "foto_pessoas" | "ilustracao_conceito" | "texto_destaque" | "produto_screenshot" | "outro",
  "imagemNota": SÓ preencha se uma imagem foi enviada junto — string curta descrevendo o estilo visual (cores, composição, se tem texto sobreposto, tom)
}

Se nenhuma imagem for enviada, omita "imagemTipo" e "imagemNota" do JSON (ou deixe null).

Definição de "tema":
Tipo 1 — A ideia genial simples: cases em que uma empresa resolveu um problema complexo com uma ideia barata,
criativa e inesperada — a virada de chave que parece óbvia depois que você ouve, mas que ninguém havia pensado antes.
Tipo 2 — A estratégia técnica com dados: cases em que uma empresa usou dados, tecnologia, operações ou modelo de
negócio de forma inteligente e os resultados são mensuráveis.

Responda só o JSON.`

export interface ClassifyPostInput {
  textoPost?: string
  imagemPost?: ChatAttachment
}

export async function classifyPost(input: ClassifyPostInput): Promise<PostAnalysis> {
  const active = await resolveActiveProvider()

  const blocks: AiContentBlock[] = []
  if (input.textoPost) blocks.push({ type: 'text', text: input.textoPost })
  if (input.imagemPost) {
    const file = await readAttachmentForApi(input.imagemPost)
    if (file) blocks.push({ type: 'image', mimeType: file.mimeType, dataBase64: file.dataBase64 })
  }

  const result = await active.provider.streamMessage({
    apiKey: active.apiKey,
    model: active.model,
    system: CLASSIFICATION_SYSTEM,
    messages: [{ role: 'user', content: blocks }],
    maxTokens: 800,
    onDelta: () => undefined
  })

  return parseClassificationJSON(result.text)
}
