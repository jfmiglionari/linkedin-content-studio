import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { DadoPost, PatternsSummary } from '@shared/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PostTextCell } from '../components/PostTextCell'

function formatImportedAt(iso?: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatRate(d: DadoPost): string {
  if (!d.engajamentos || !d.impressoes) return '—'
  return `${((d.engajamentos / d.impressoes) * 100).toFixed(1)}%`
}

function deriveLabelFromLink(link: string): string {
  try {
    const decoded = decodeURIComponent(link)
    const lastSegment = decoded.split('/').filter(Boolean).pop() ?? decoded
    const withoutShare = lastSegment.replace(/-share-.*$/i, '')
    const withoutAuthorPrefix = withoutShare.replace(/^[^_]*_/, '')
    const readable = withoutAuthorPrefix.replace(/[-_]+/g, ' ').trim()
    return readable || link
  } catch {
    return link
  }
}

export function DadosTab(): React.JSX.Element {
  const [dados, setDados] = useState<DadoPost[]>([])
  const [patterns, setPatterns] = useState<PatternsSummary | null>(null)
  const [importing, setImporting] = useState(false)
  const [lastImportMsg, setLastImportMsg] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmingDeleteSelected, setConfirmingDeleteSelected] = useState(false)
  const [confirmingClearAll, setConfirmingClearAll] = useState(false)

  const refreshPatterns = useCallback(() => {
    window.api.dados.patternsSummary().then(setPatterns)
  }, [])

  useEffect(() => {
    window.api.dados.list().then(setDados)
    refreshPatterns()
  }, [refreshPatterns])

  function pruneSelection(currentDados: DadoPost[]): void {
    const validIds = new Set(currentDados.map((d) => d.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => validIds.has(id))))
  }

  async function handleImport(): Promise<void> {
    setImporting(true)
    setImportError(null)
    try {
      const result = await window.api.dados.import()
      setDados(result.dados)
      pruneSelection(result.dados)
      if (result.error) {
        setImportError(result.error)
      } else if (!result.canceled) {
        setLastImportMsg(
          `${result.importedCount ?? 0} novo(s), ${result.updatedCount ?? 0} atualizado(s).`
        )
        setTimeout(() => setLastImportMsg(null), 4000)
        refreshPatterns()
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  async function handleFieldChange(
    id: string,
    field: 'dataPublicacao' | 'engajamentos' | 'impressoes' | 'nota',
    value: string
  ): Promise<void> {
    const isNumeric = field === 'engajamentos' || field === 'impressoes'
    const patch = { [field]: isNumeric ? Number(value) || undefined : value }
    setDados((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
    await window.api.dados.update(id, patch)
  }

  async function handleDelete(id: string): Promise<void> {
    const next = await window.api.dados.delete(id)
    setDados(next)
    pruneSelection(next)
    refreshPatterns()
  }

  async function handleDeleteSelected(): Promise<void> {
    const next = await window.api.dados.deleteMany([...selectedIds])
    setDados(next)
    setSelectedIds(new Set())
    setConfirmingDeleteSelected(false)
    refreshPatterns()
  }

  async function handleClearAll(): Promise<void> {
    const next = await window.api.dados.clearAll()
    setDados(next)
    setSelectedIds(new Set())
    setConfirmingClearAll(false)
    refreshPatterns()
  }

  function handlePostUpdated(next: DadoPost[]): void {
    setDados(next)
    refreshPatterns()
  }

  function toggleSelected(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(): void {
    setSelectedIds((prev) => (prev.size === dados.length ? new Set() : new Set(dados.map((d) => d.id))))
  }

  const allSelected = dados.length > 0 && selectedIds.size === dados.length

  // Mais recentemente importado primeiro, para facilitar achar e apagar uma planilha
  // errada que tenha sido subida em um dia específico.
  const sortedDados = useMemo(
    () => [...dados].sort((a, b) => (b.importedAt ?? '').localeCompare(a.importedAt ?? '')),
    [dados]
  )

  return (
    <>
      <div className="dados-toolbar">
        <div>
          <h1 style={{ margin: 0, fontSize: 15 }}>Dados de performance</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            Exporte "Aggregate Analytics" no LinkedIn Analytics do seu perfil (.xlsx) e importe
            aqui. Cole o texto de cada post que quiser analisar — a IA classifica gancho, tema e
            fechamento automaticamente, e isso passa a calibrar pesquisa, post e imagem.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastImportMsg && <span className="saved-hint">{lastImportMsg}</span>}
          {selectedIds.size > 0 && (
            <button className="btn danger" onClick={() => setConfirmingDeleteSelected(true)}>
              Apagar selecionados ({selectedIds.size})
            </button>
          )}
          {dados.length > 0 && (
            <button className="btn danger dados-toolbar-btn" onClick={() => setConfirmingClearAll(true)}>
              Apagar tudo
            </button>
          )}
          <button
            className="btn primary dados-toolbar-btn"
            disabled={importing}
            onClick={handleImport}
          >
            {importing ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>

      {importError && <div className="error-banner">{importError}</div>}

      {patterns && dados.length > 0 && (
        <details className="patterns-panel" open={patterns.ready}>
          <summary>
            Padrões de escrita — {patterns.sampleSize}/{patterns.minRequired} posts classificados
            {patterns.ready ? ' (em uso nos prompts)' : ' (ainda não em uso)'}
          </summary>
          <pre className="patterns-text">{patterns.summaryText}</pre>
        </details>
      )}

      {dados.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Nenhum dado importado ainda.
        </p>
      ) : (
        <table className="dados-table">
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              </th>
              <th>Post</th>
              <th>Data</th>
              <th>Importado em</th>
              <th title="Engajamentos">Engajamentos</th>
              <th title="Impressões">Impressões</th>
              <th>Taxa</th>
              <th>Texto &amp; classificação</th>
              <th>Nota</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedDados.map((d) => (
              <tr key={d.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(d.id)}
                    onChange={() => toggleSelected(d.id)}
                  />
                </td>
                <td>
                  <a className="dados-post-link" href={d.link} target="_blank" rel="noreferrer" title={d.link}>
                    {deriveLabelFromLink(d.link)}
                  </a>
                </td>
                <td>
                  <input
                    value={d.dataPublicacao}
                    onChange={(e) => handleFieldChange(d.id, 'dataPublicacao', e.target.value)}
                  />
                </td>
                <td className="dados-imported-at">{formatImportedAt(d.importedAt)}</td>
                <td>
                  <input
                    value={d.engajamentos ?? ''}
                    onChange={(e) => handleFieldChange(d.id, 'engajamentos', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    value={d.impressoes ?? ''}
                    onChange={(e) => handleFieldChange(d.id, 'impressoes', e.target.value)}
                  />
                </td>
                <td className="dados-imported-at">{formatRate(d)}</td>
                <td>
                  <PostTextCell dado={d} onUpdated={handlePostUpdated} />
                </td>
                <td>
                  <input value={d.nota} onChange={(e) => handleFieldChange(d.id, 'nota', e.target.value)} />
                </td>
                <td>
                  <button className="btn" onClick={() => handleDelete(d.id)}>
                    Apagar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirmingDeleteSelected && (
        <ConfirmDialog
          title="Apagar linhas selecionadas"
          message={`${selectedIds.size} linha(s) selecionada(s) serão apagadas permanentemente.`}
          confirmLabel="Apagar"
          danger
          onCancel={() => setConfirmingDeleteSelected(false)}
          onConfirm={handleDeleteSelected}
        />
      )}

      {confirmingClearAll && (
        <ConfirmDialog
          title="Apagar todos os dados"
          message="Todas as linhas de performance importadas serão apagadas permanentemente. Essa ação não pode ser desfeita."
          confirmLabel="Apagar tudo"
          danger
          onCancel={() => setConfirmingClearAll(false)}
          onConfirm={handleClearAll}
        />
      )}
    </>
  )
}
