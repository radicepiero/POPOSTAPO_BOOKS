import { useState } from 'react'
import client from '../api/client'
import { buttonLabels, formLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

interface Props {
  readingId: number
  currentPage: number
  totalPages?: number
  onClose: () => void
  onSaved: () => void
}

export default function BookmarkModal({ readingId, currentPage, totalPages, onClose, onSaved }: Props) {
  const [page, setPage] = useState(String(currentPage))
  const [note, setNote] = useState('')
  const [rating, setRating] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const pageNum = Number(page)
    if (Number.isNaN(pageNum) || pageNum < 0) {
      setError('Inserisci un numero di pagina valido')
      return
    }
    if (totalPages && pageNum > totalPages) {
      setError(`La pagina non può superare il totale (${totalPages})`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await client.post(`/readings/${readingId}/bookmarks`, {
        page: pageNum,
        bookmark_date: date || undefined,
        note: note || undefined,
        rating: rating ? Number(rating) : undefined,
      })
      onSaved()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Nuovo segnalibro</h3>
        <form onSubmit={submit}>
          <label>{formLabels.page}<input type="number" min="0" value={page} onChange={(e) => setPage(e.target.value)} /></label>
          <label>{formLabels.bookmarkDate}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>{formLabels.rating}<input type="number" min="0" max="5" step="0.5" value={rating} onChange={(e) => setRating(e.target.value)} /></label>
          <label>{formLabels.note}<textarea maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          {error && <div className="error">{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: '#555' }}>{buttonLabels.cancel}</button>
            <button type="submit" disabled={loading} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}><Icon name="save" size={16} />{loading ? 'Salvataggio...' : buttonLabels.save}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
