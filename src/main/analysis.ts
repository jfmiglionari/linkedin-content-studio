import { listDados } from './store/dados'
import { DadoPost, PatternsSummary } from '@shared/types'

const MIN_CLASSIFIED_POSTS = 20

function engagementRate(d: DadoPost): number | null {
  if (!d.engajamentos || !d.impressoes) return null
  return d.engajamentos / d.impressoes
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

interface RatedPost {
  d: DadoPost
  rate: number
}

function withComputableRate(dados: DadoPost[]): RatedPost[] {
  return dados
    .map((d) => ({ d, rate: engagementRate(d) }))
    .filter((x): x is RatedPost => x.rate !== null)
}

function classifiedWithRate(dados: DadoPost[]): RatedPost[] {
  return withComputableRate(dados.filter((d) => d.analise && d.textoPost))
}

function groupAverage<T extends string>(
  items: RatedPost[],
  keyFn: (d: DadoPost) => T | null
): Array<{ key: T; count: number; avgRate: number }> {
  const groups = new Map<T, number[]>()
  for (const { d, rate } of items) {
    const key = keyFn(d)
    if (key === null) continue
    const arr = groups.get(key) ?? []
    arr.push(rate)
    groups.set(key, arr)
  }
  return [...groups.entries()]
    .map(([key, rates]) => ({
      key,
      count: rates.length,
      avgRate: rates.reduce((a, b) => a + b, 0) / rates.length
    }))
    .sort((a, b) => b.avgRate - a.avgRate)
}

/**
 * Cruza a classificação da IA (gancho/tema/fechamento) com a taxa de engajamento dos
 * posts que já têm texto colado + análise. Só considera os padrões confiáveis o
 * suficiente pra alimentar os prompts a partir de MIN_CLASSIFIED_POSTS exemplos.
 */
export async function analyzePatterns(): Promise<PatternsSummary> {
  const dados = await listDados()
  const classified = dados.filter((d) => d.analise && d.textoPost)
  const sampleSize = classified.length
  const ready = sampleSize >= MIN_CLASSIFIED_POSTS

  if (sampleSize === 0) {
    return {
      sampleSize,
      ready: false,
      minRequired: MIN_CLASSIFIED_POSTS,
      summaryText: 'Nenhum post com texto colado e classificado ainda.'
    }
  }

  if (!ready) {
    return {
      sampleSize,
      ready: false,
      minRequired: MIN_CLASSIFIED_POSTS,
      summaryText:
        `Só há ${sampleSize} de ${MIN_CLASSIFIED_POSTS} posts classificados (texto colado + análise ` +
        'da IA) — ainda não há amostra suficiente para o app usar padrões de forma confiável. ' +
        'Continue colando texto e classificando posts na aba Dados.'
    }
  }

  const withRate = classifiedWithRate(dados)
  const lines: string[] = []

  const byHook = groupAverage(withRate, (d) => d.analise!.hookType)
  if (byHook.length > 0) {
    lines.push('Por tipo de gancho de abertura (taxa média de engajamento):')
    lines.push(...byHook.map((g) => `- ${g.key} (${g.count} posts): ${pct(g.avgRate)}`))
  }

  const byClosing = groupAverage(withRate, (d) => d.analise!.closingType)
  if (byClosing.length > 0) {
    lines.push('', 'Por tipo de fechamento (taxa média de engajamento):')
    lines.push(...byClosing.map((g) => `- ${g.key} (${g.count} posts): ${pct(g.avgRate)}`))
  }

  const byTema = groupAverage(withRate, (d) => d.analise!.tema)
  if (byTema.length > 0) {
    lines.push('', 'Por tema (Tipo 1 = ideia simples genial / Tipo 2 = estratégia técnica com dados):')
    lines.push(...byTema.map((g) => `- ${g.key} (${g.count} posts): ${pct(g.avgRate)}`))
  }

  const byImagem = groupAverage(withRate, (d) => d.analise!.imagemTipo ?? null)
  if (byImagem.length > 0) {
    lines.push('', 'Por tipo de imagem/estilo visual usado no post (taxa média de engajamento):')
    lines.push(...byImagem.map((g) => `- ${g.key} (${g.count} posts): ${pct(g.avgRate)}`))
  }

  const topExamples = [...withRate].sort((a, b) => b.rate - a.rate).slice(0, 3)
  if (topExamples.length > 0) {
    lines.push('', 'Exemplos de posts de alta performance (referência concreta):')
    lines.push(
      ...topExamples.map(({ d, rate }) => {
        const imagemPart = d.analise!.imagemTipo
          ? `; imagem: ${d.analise!.imagemTipo} (${d.analise!.imagemNota ?? ''})`
          : ''
        return (
          `- ${pct(rate)} — gancho: ${d.analise!.hookType} (${d.analise!.hookNota}); ` +
          `fechamento: ${d.analise!.closingType} (${d.analise!.closingNota})${imagemPart}`
        )
      })
    )
  }

  return { sampleSize, ready: true, minRequired: MIN_CLASSIFIED_POSTS, summaryText: lines.join('\n') }
}

/** Ranking simples por taxa de engajamento — sempre disponível, não depende do limiar. */
function rawMetricsSummary(dados: DadoPost[]): string {
  const withRate = withComputableRate(dados)
  if (withRate.length === 0) {
    return 'Nenhum post com engajamentos e impressões suficientes para calcular taxa de engajamento ainda.'
  }

  const ordenados = [...withRate].sort((a, b) => b.rate - a.rate)
  const top = ordenados.slice(0, 3)
  const bottom = ordenados.slice(-3).reverse()

  const fmt = (x: RatedPost): string =>
    `- ${x.d.link} — taxa de engajamento ${pct(x.rate)} (${x.d.engajamentos} engajamentos / ${x.d.impressoes} impressões)` +
    `${x.d.nota ? `. Nota: ${x.d.nota}` : ''}`

  return [
    'MELHORES POSTS HISTÓRICOS POR TAXA DE ENGAJAMENTO:',
    ...top.map(fmt),
    '',
    'POSTS COM PIOR TAXA DE ENGAJAMENTO (evitar padrões parecidos):',
    ...bottom.map(fmt)
  ].join('\n')
}

/** Contexto combinado (métricas + padrões classificados), injetado nas 3 etapas do pipeline. */
export async function buildDadosContext(): Promise<string> {
  const dados = await listDados()
  if (dados.length === 0) {
    return 'Nenhum dado de performance importado ainda. Não calibre por dados históricos.'
  }

  const patterns = await analyzePatterns()

  return [
    rawMetricsSummary(dados),
    '',
    `PADRÕES DE ESCRITA ENCONTRADOS (${patterns.sampleSize}/${patterns.minRequired} posts classificados):`,
    patterns.summaryText
  ].join('\n')
}
