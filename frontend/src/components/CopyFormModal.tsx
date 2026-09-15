import { useEffect, useMemo, useState } from 'react'
import client from '../api/client'
import { buttonLabels, formLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

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

interface Friend {
  id: number
  name: string
}

export interface CopyFormData {
  acquisition_date?: string
  acquisition_type_id?: number
  acquisition_friend_id?: number
  shelf_id?: number
  price?: number
  currency?: string
  condition_note?: string
}

interface Props {
  editionId?: number
  copy?: {
    copy_id: number
    edition_id?: number | null
    acquisition_date?: string | null
    acquisition_type_name?: string
    acquisition_type_id?: number | null
    acquisition_friend_id?: number | null
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

function typeNeedsPrice(typeName: string) {
  const lower = typeName.toLowerCase()
  return /acquist|compr|vend/.test(lower)
}

function typeNeedsFriend(typeName: string) {
  const lower = typeName.toLowerCase()
  return /regal|scambi|prestit|don|ered/.test(lower)
}

export default function CopyFormModal({ editionId, copy, onClose, onSaved }: Props) {
  const [step, setStep] = useState(copy?.acquisition_type_id ? 2 : 1)
  const [date, setDate] = useState(copy?.acquisition_date || '')
  const [acquisitionTypeId, setAcquisitionTypeId] = useState(String(copy?.acquisition_type_id || ''))
  const [acquisitionFriendId, setAcquisitionFriendId] = useState(String(copy?.acquisition_friend_id || ''))
  const [price, setPrice] = useState(copy?.price ? String(copy.price) : '')
  const [currency, setCurrency] = useState(copy?.currency || 'EUR')
  const [conditionNote, setConditionNote] = useState(copy?.condition_note || '')
  const [libraryId, setLibraryId] = useState('')
  const [shelfId, setShelfId] = useState(String(copy?.shelf_id || ''))
  const [acquisitionTypes, setAcquisitionTypes] = useState<AcquisitionType[]>([])
  const [libraries, setLibraries] = useState<Library[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    client.get('/copies/acquisition-types')
      .then(({ data }) => setAcquisitionTypes((data as AcquisitionType[]).filter((t) => !t.direction || t.direction === 'in')))
      .catch(() => setAcquisitionTypes([]))
    client.get('/copies/libraries')
      .then(({ data }) => {
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
      })
      .catch(() => setLibraries([]))
    client.get('/copies/friends')
      .then(({ data }) => setFriends(data as Friend[]))
      .catch(() => setFriends([]))
  }, [copy?.shelf_id])

  const selectedType = acquisitionTypes.find((t) => String(t.id) === acquisitionTypeId)
  const selectedTypeName = selectedType?.name_ita || selectedType?.name || ''
  const needsPrice = useMemo(() => typeNeedsPrice(selectedTypeName), [selectedTypeName])
  const needsFriend = useMemo(() => typeNeedsFriend(selectedTypeName), [selectedTypeName])

  const selectedLibrary = libraries.find((l) => String(l.id) === libraryId)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    const payload: CopyFormData = {
      acquisition_date: date || undefined,
      acquisition_type_id: acquisitionTypeId ? Number(acquisitionTypeId) : undefined,
      acquisition_friend_id: needsFriend && acquisitionFriendId ? Number(acquisitionFriendId) : undefined,
      shelf_id: shelfId ? Number(shelfId) : undefined,
      price: needsPrice && price ? Number(price) : undefined,
      currency: needsPrice && price ? currency : undefined,
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

  const goBack = () => {
    setAcquisitionTypeId('')
    setStep(1)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{copy ? buttonLabels.modify : buttonLabels.addCopy}</h3>
        {step === 1 && (
          <div>
            <label>{formLabels.acquisitionType}
              <select
                value={acquisitionTypeId}
                onChange={(e) => {
                  setAcquisitionTypeId(e.target.value)
                  if (e.target.value) setStep(2)
                }}
              >
                <option value="">-- seleziona --</option>
                {acquisitionTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name_ita || t.name}</option>
                ))}
              </select>
            </label>
            <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Dati gestibili dal database: tipo di acquisizione, data, prezzo, valuta, amico (se regalo/scambio/prestito), libreria/scaffale, condizioni/note.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" onClick={onClose} style={{ flex: 1, background: '#555' }}>{buttonLabels.cancel}</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <form onSubmit={submit}>
            <p style={{ color: '#666', fontSize: '0.9rem', marginTop: 0 }}>
              <strong>Tipo:</strong> {selectedTypeName}
              <button type="button" onClick={goBack} style={{ marginLeft: '0.5rem', padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}>{buttonLabels.back}</button>
            </p>
            <label>{formLabels.acquisitionDate}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            {needsPrice && (
              <label>{formLabels.price}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={{ flex: 1 }} />
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 'auto' }}>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </label>
            )}
            {needsFriend && (
              <label>{formLabels.fromFriend}
                <select value={acquisitionFriendId} onChange={(e) => setAcquisitionFriendId(e.target.value)}>
                  <option value="">-- seleziona --</option>
                  {friends.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label>{formLabels.library}
              <select value={libraryId} onChange={(e) => { setLibraryId(e.target.value); setShelfId('') }}>
                <option value="">-- seleziona --</option>
                {libraries.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>
            <label>{formLabels.shelf}
              <select value={shelfId} onChange={(e) => setShelfId(e.target.value)} disabled={!selectedLibrary}>
                <option value="">-- seleziona --</option>
                {(selectedLibrary?.shelves || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label>{formLabels.conditionNote}<textarea maxLength={450} value={conditionNote} onChange={(e) => setConditionNote(e.target.value)} /></label>
            {error && <div className="error">{error}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" onClick={onClose} style={{ flex: 1, background: '#555' }}>{buttonLabels.cancel}</button>
              <button type="button" onClick={goBack} style={{ flex: 1, background: '#777' }}>{buttonLabels.back}</button>
              <button type="submit" disabled={loading} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}><Icon name="save" size={16} />{loading ? 'Salvataggio...' : buttonLabels.save}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
