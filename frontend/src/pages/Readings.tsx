import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import client from '../api/client'

type ReadingFilter = 'active' | 'wishlist' | 'finished' | 'abandoned' | 'all'
type ReadingStatus = 'active' | 'wishlist' | 'finished' | 'abandoned'

interface ReadingItem {
  reading_id: number
  edition_id: number
  start_date?: string
  end_date?: string
  current_page: number
  finished: boolean
  status: ReadingStatus
  status_changed_at?: string
  created_at: string
  is_inactive: boolean
  rating?: number
  is_shared: boolean
  title: string
  subtitle?: string
  pages?: number
  authors: string[]
  publisher?: string
  last_activity?: string
  bookmark_count: number
  last_note?: string
}

const filters: { value: ReadingFilter; label: string }[] = [
  { value: 'active', label: 'In corso' },
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'finished', label: 'Terminate' },
  { value: 'abandoned', label: 'Interrotte' },
  { value: 'all', label: 'Tutte' },
]

function formatDate(value?: string) {
  if (!value) return undefined
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function Readings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFilter = filters.some((item) => item.value === searchParams.get('status')) ? searchParams.get('status') as ReadingFilter : 'active'
  const [filter, setFilter] = useState<ReadingFilter>(initialFilter)
  const [readings, setReadings] = useState<ReadingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    client.get('/readings', { params: { status: filter, limit: 200 } })
      .then(({ data }) => setReadings(data.items || []))
      .catch((err) => setError(err.response?.status === 401 ? 'Accedi per vedere le tue letture.' : 'Impossibile caricare le letture.'))
      .finally(() => setLoading(false))
  }, [filter])

  const updateStatus = async (readingId: number, status: ReadingStatus) => {
    try {
      await client.patch(`/readings/${readingId}/status`, { status })
      setReadings((current) => current
        .map((reading) => reading.reading_id === readingId
          ? { ...reading, status, finished: status === 'finished', is_inactive: false }
          : reading)
        .filter((reading) => filter === 'all' || reading.status === filter))
    } catch {
      setError('Impossibile aggiornare lo stato della lettura.')
    }
  }

  return (
    <div>
      <h2>Le mie letture</h2>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => { setFilter(item.value); setSearchParams({ status: item.value }) }}
            style={filter === item.value ? undefined : { background: '#e5e5e5', color: '#333' }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && <p>Caricamento letture...</p>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && readings.length === 0 && <p>Nessuna lettura in questa sezione.</p>}

      {readings.map((reading) => {
        const hasProgress = reading.status === 'active' && Boolean(reading.pages && reading.pages > 0)
        const progress = hasProgress ? Math.min(100, Math.max(0, Math.round(reading.current_page / reading.pages! * 100))) : 0
        const activityDate = reading.last_activity || reading.end_date || reading.start_date
        return (
          <article key={reading.reading_id} className="card" style={{ marginBottom: '0.75rem' }}>
            <Link to={`/editions/${reading.edition_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <p style={{ marginBottom: '0.25rem' }}><strong>{reading.title}</strong></p>
            </Link>
            {reading.authors.length > 0 && <p style={{ margin: '0 0 0.5rem', color: '#555' }}>{reading.authors.join(', ')}</p>}
            {reading.is_inactive && <span style={{ display: 'inline-block', padding: '0.2rem 0.45rem', borderRadius: '0.4rem', background: '#fff3cd', color: '#765c00', fontSize: '0.8rem', fontWeight: 600 }}>Inattiva da più di 2 mesi</span>}

            {reading.status === 'wishlist' ? (
              <p style={{ margin: '0.35rem 0' }}>Da leggere</p>
            ) : reading.status === 'finished' ? (
              <p style={{ margin: '0.35rem 0' }}>Terminata{reading.end_date ? ` il ${formatDate(reading.end_date)}` : ''}</p>
            ) : reading.status === 'abandoned' ? (
              <p style={{ margin: '0.35rem 0' }}>Lettura interrotta{reading.current_page > 0 ? ` a pagina ${reading.current_page}` : ''}</p>
            ) : hasProgress ? (
              <div style={{ margin: '0.65rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                  <span>Pagina {reading.current_page} di {reading.pages}</span>
                  <strong>{progress}%</strong>
                </div>
                <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} style={{ height: '0.65rem', background: '#ddd', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: '#1769aa' }} />
                </div>
              </div>
            ) : (
              <p style={{ margin: '0.35rem 0' }}>{reading.current_page > 0 ? `Pagina ${reading.current_page}` : 'Lettura iniziata'}</p>
            )}

            {reading.rating != null && <p style={{ margin: '0.35rem 0' }}>Valutazione: {Number(reading.rating).toLocaleString('it-IT')} / 5</p>}
            {reading.last_note && <p style={{ margin: '0.5rem 0', fontStyle: 'italic' }}>“{reading.last_note}”</p>}
            <p style={{ margin: '0.5rem 0', color: '#777', fontSize: '0.8rem' }}>
              {reading.status === 'wishlist'
                ? `Aggiunto alla wishlist: ${formatDate(reading.created_at.slice(0, 10))}`
                : activityDate ? `Ultimo aggiornamento: ${formatDate(activityDate)}` : 'Data non disponibile'}
              {reading.bookmark_count > 0 ? ` · ${reading.bookmark_count} tappe` : ''}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {reading.status === 'wishlist' && <button type="button" onClick={() => updateStatus(reading.reading_id, 'active')}>Inizia lettura</button>}
              {(reading.status === 'abandoned' || reading.status === 'finished') && <button type="button" onClick={() => updateStatus(reading.reading_id, 'active')}>Continua</button>}
              {reading.status === 'active' && <button type="button" onClick={() => updateStatus(reading.reading_id, 'abandoned')} style={{ background: '#e5e5e5', color: '#333' }}>Segna come interrotta</button>}
              {reading.status !== 'finished' && reading.status !== 'wishlist' && <button type="button" onClick={() => updateStatus(reading.reading_id, 'finished')}>Segna come terminata</button>}
            </div>
          </article>
        )
      })}
    </div>
  )
}

export default Readings
