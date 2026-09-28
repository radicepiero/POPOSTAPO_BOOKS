import { useEffect, useMemo, useState } from 'react'
import client from '../api/client'
import { EditionVariant } from '../services/bibliographicMappers'
import { buttonLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

export interface WishlistItem {
  id: number
  work_id?: number | null
  work_title?: string | null
  title?: string | null
  author?: string | null
  note?: string | null
  status: string
  created_at?: string
}

interface RelatedEdition {
  local_edition_id: number
  title: string
  year?: number
  isbn?: string
}

interface Props {
  item: WishlistItem
  onClose: () => void
  onSaved: () => void
}

export default function WishlistStartReadingModal({ item, onClose, onSaved }: Props) {
  const [editions, setEditions] = useState<RelatedEdition[]>([])
  const [variants, setVariants] = useState<EditionVariant[]>([])
  const [editionId, setEditionId] = useState('')
  const [variantId, setVariantId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!item.work_id) {
      setLoading(false)
      return
    }
    client.get(`/works/${item.work_id}`)
      .then(({ data }) => {
        const related = data.related_editions || []
        setEditions(related)
        const first = related[0]?.local_edition_id
        if (first) setEditionId(String(first))
      })
      .catch((err) => setError(err.response?.data?.detail || err.message))
      .finally(() => setLoading(false))
  }, [item.work_id])

  useEffect(() => {
    if (!editionId) {
      setVariants([])
      return
    }
    client.get(`/editions/${editionId}`)
      .then(({ data }) => {
        const nextVariants = data.variants || []
        setVariants(nextVariants)
        const selected = nextVariants.find((variant: EditionVariant) => variant.is_default) || nextVariants[0]
        setVariantId(selected ? String(selected.id) : '')
      })
      .catch((err) => setError(err.response?.data?.detail || err.message))
  }, [editionId])

  const canSubmit = useMemo(() => Boolean(variantId), [variantId])

  const submit = async () => {
    if (!variantId) return
    setSaving(true)
    setError(null)
    try {
      await client.post(`/wishlist/${item.id}/start-reading`, { edition_variant_id: Number(variantId) })
      onSaved()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <h3>Inizia lettura</h3>
        <p><strong>{item.title || item.work_title}</strong>{item.author ? ` — ${item.author}` : ''}</p>
        {loading && <p>Caricamento edizioni...</p>}
        {!loading && !item.work_id && <p>Questa voce non è ancora collegata a un'opera del catalogo.</p>}
        {!loading && item.work_id && editions.length === 0 && <p>Nessuna edizione disponibile per quest'opera.</p>}
        {editions.length > 0 && (
          <>
            <label>Edizione
              <select value={editionId} onChange={(event) => setEditionId(event.target.value)}>
                {editions.map((edition) => (
                  <option key={edition.local_edition_id} value={edition.local_edition_id}>
                    {edition.title}{edition.year ? ` (${edition.year})` : ''}{edition.isbn ? ` · ${edition.isbn}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {variants.length > 1 && (
              <label>Variante
                <select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.label || `Variante ${variant.id}`}{variant.pages ? ` · ${variant.pages} pp.` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button type="button" onClick={onClose} aria-label={buttonLabels.cancel} title={buttonLabels.cancel} style={{ flex: 1, background: '#555', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cancel" size={18} /></button>
          <button type="button" onClick={submit} disabled={!canSubmit || saving} style={{ flex: 1 }}>{saving ? 'Avvio...' : buttonLabels.startReading}</button>
        </div>
      </div>
    </div>
  )
}
