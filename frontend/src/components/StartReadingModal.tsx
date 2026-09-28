import { useState } from 'react'
import client from '../api/client'
import { buttonLabels, formLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

export interface ReadingFormData {
  start_date?: string
  end_date?: string
  current_page?: number
  finished?: boolean
  status?: 'active' | 'finished'
  rating?: number
  copy_id?: number
  edition_variant_id?: number
}

interface Props {
  editionId: number
  editionVariantId?: number
  copyId?: number
  editionTitle?: string
  onClose: () => void
  onSaved: () => void
}

const todayString = () => new Date().toISOString().split('T')[0]

export default function StartReadingModal({ editionId, editionVariantId, copyId, editionTitle, onClose, onSaved }: Props) {
  const [startDate, setStartDate] = useState(todayString())
  const [finished, setFinished] = useState(false)
  const [endDate, setEndDate] = useState(todayString())
  const [currentPage, setCurrentPage] = useState('0')
  const [rating, setRating] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const payload: ReadingFormData = {
      start_date: startDate || undefined,
      current_page: Number(currentPage) || 0,
      finished,
      status: finished ? 'finished' : 'active',
      rating: rating ? Number(rating) : undefined,
    }
    if (finished) {
      payload.end_date = endDate || todayString()
    }
    if (copyId) {
      payload.copy_id = copyId
    } else if (editionVariantId) {
      payload.edition_variant_id = editionVariantId
    }

    try {
      await client.post(`/editions/${editionId}/readings`, payload)
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
        <h3><Icon name="addReading" size={18} /> {buttonLabels.addReading}</h3>
        {editionTitle && <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '-0.5rem' }}>{editionTitle}</p>}
        <form onSubmit={handleSubmit}>
          <label>{formLabels.startDate}<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></label>
          <label>
            <input type="checkbox" checked={finished} onChange={(e) => setFinished(e.target.checked)} style={{ width: 'auto', marginRight: '0.5rem' }} />
            Terminata
          </label>
          {finished && <label>{formLabels.endDate}<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>}
          <label>{formLabels.page}<input type="number" min="0" value={currentPage} onChange={(e) => setCurrentPage(e.target.value)} /></label>
          <label>{formLabels.rating}<input type="number" min="0" max="5" step="0.5" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="0–5" /></label>
          {error && <div className="error">{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" onClick={onClose} aria-label={buttonLabels.cancel} title={buttonLabels.cancel} style={{ flex: 1, background: '#555', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cancel" size={18} /></button>
            <button type="submit" disabled={loading} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
              <Icon name="save" size={16} />
              {loading ? 'Salvataggio...' : ''}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
