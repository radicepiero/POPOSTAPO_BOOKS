import { useEffect, useState } from 'react'
import client from '../api/client'

interface AcquisitionType {
  id: number
  name_ita?: string
  name: string
  direction?: string
}

interface Shelf {
  id: number
  name: string
}

interface Library {
  id: number
  name: string
  shelves: Shelf[]
}

export interface CopyFormData {
  acquisition_date?: string
  acquisition_type_id?: number
  price?: number
  currency?: string
  condition_note?: string
  shelf_id?: number
  status?: string
}

interface Props {
  editionId?: number
  copy?: {
    copy_id: number
    edition_id?: number | null
    acquisition_date?: string | null
    acquisition_type_name?: string
    acquisition_type_id?: number | null
    price?: number | null
    currency?: string | null
    condition_note?: string | null
    shelf_name?: string | null
    shelf_id?: number | null
    status?: string
  }
  onClose: () => void
  onSaved: () => void
}

export default function CopyFormModal({ editionId, copy, onClose, onSaved }: Props) {
  const [date, setDate] = useState(copy?.acquisition_date || '')
  const [acquisitionTypeId, setAcquisitionTypeId] = useState(String(copy?.acquisition_type_id || ''))
  const [price, setPrice] = useState(copy?.price ? String(copy.price) : '')
  const [currency, setCurrency] = useState(copy?.currency || 'EUR')
  const [conditionNote, setConditionNote] = useState(copy?.condition_note || '')
  const [libraryId, setLibraryId] = useState('')
  const [shelfId, setShelfId] = useState(String(copy?.shelf_id || ''))
  const [acquisitionTypes, setAcquisitionTypes] = useState<AcquisitionType[]>([])
  const [libraries, setLibraries] = useState<Library[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    client.get('/copies/acquisition-types').then(({ data }) => setAcquisitionTypes(data)).catch(() => setAcquisitionTypes([]))
    client.get('/copies/libraries').then(({ data }) => {
      const libs = data as Library[]
      setLibraries(libs)
      if (copy?.shelf_id) {
        for (const lib of libs) {
          if (lib.shelves.some((s: Shelf) => s.id === copy.shelf_id)) {
            setLibraryId(String(lib.id))
            break
          }
        }
      }
    }).catch(() => setLibraries([]))
  }, [copy?.shelf_id])

  const selectedLibrary = libraries.find((l) => String(l.id) === libraryId)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    const payload: CopyFormData = {
      acquisition_date: date || undefined,
      acquisition_type_id: acquisitionTypeId ? Number(acquisitionTypeId) : undefined,
      shelf_id: shelfId ? Number(shelfId) : undefined,
      price: price ? Number(price) : undefined,
      currency: price ? currency : undefined,
      condition_note: conditionNote || undefined,
    }
    try {
      if (copy) {
        await client.patch(`/copies/${copy.copy_id}`, payload)
      } else if (editionId) {
        await client.post(`/editions/${editionId}/copies`, payload)
      }
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
        <h3>{copy ? 'Modifica copia' : 'Aggiungi copia'}</h3>
        <form onSubmit={submit}>
          <label>Data di acquisto<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Tipo di acquisizione
            <select value={acquisitionTypeId} onChange={(e) => setAcquisitionTypeId(e.target.value)}>
              <option value="">-- seleziona --</option>
              {acquisitionTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name_ita || t.name}</option>
              ))}
            </select>
          </label>
          <label>Prezzo
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={{ flex: 1 }} />
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 'auto' }}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </label>
          <label>Libreria
            <select value={libraryId} onChange={(e) => { setLibraryId(e.target.value); setShelfId('') }}>
              <option value="">-- seleziona --</option>
              {libraries.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <label>Scaffale
            <select value={shelfId} onChange={(e) => setShelfId(e.target.value)} disabled={!selectedLibrary}>
              <option value="">-- seleziona --</option>
              {(selectedLibrary?.shelves || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>Condizioni e note<textarea maxLength={450} value={conditionNote} onChange={(e) => setConditionNote(e.target.value)} /></label>
          {error && <div className="error">{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: '#555' }}>Annulla</button>
            <button type="submit" disabled={loading} style={{ flex: 1 }}>{loading ? 'Salvataggio...' : 'Salva'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
