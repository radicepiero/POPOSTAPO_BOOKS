import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import client from '../api/client'
import ReadingCard, { ReadingItem } from '../components/ReadingCard'
import BookmarkModal from '../components/BookmarkModal'

type ReadingFilter = 'active' | 'wishlist' | 'finished' | 'abandoned' | 'all'
type ReadingStatus = 'active' | 'wishlist' | 'finished' | 'abandoned'

const filters: { value: ReadingFilter; label: string }[] = [
  { value: 'active', label: 'In corso' },
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'finished', label: 'Terminate' },
  { value: 'abandoned', label: 'Interrotte' },
  { value: 'all', label: 'Tutte' },
]

function Readings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFilter = filters.some((item) => item.value === searchParams.get('status')) ? searchParams.get('status') as ReadingFilter : 'active'
  const [filter, setFilter] = useState<ReadingFilter>(initialFilter)
  const [readings, setReadings] = useState<ReadingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookmarkReading, setBookmarkReading] = useState<ReadingItem | null>(null)

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

  const deleteReading = async (readingId: number) => {
    if (!window.confirm('Vuoi davvero cancellare questa lettura?')) return
    try {
      await client.delete(`/readings/${readingId}`)
      setReadings((current) => current.filter((r) => r.reading_id !== readingId))
    } catch {
      setError('Impossibile cancellare la lettura.')
    }
  }

  const refresh = async () => {
    try {
      const { data } = await client.get('/readings', { params: { status: filter, limit: 200 } })
      setReadings(data.items || [])
      setBookmarkReading(null)
    } catch {
      setError('Impossibile aggiornare le letture.')
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

      {readings.map((reading) => (
        <ReadingCard
          key={reading.reading_id}
          reading={reading}
          onStatusChange={(status) => updateStatus(reading.reading_id, status)}
          onDelete={() => deleteReading(reading.reading_id)}
          onAddBookmark={() => setBookmarkReading(reading)}
        />
      ))}

      {bookmarkReading && (
        <BookmarkModal
          readingId={bookmarkReading.reading_id}
          currentPage={bookmarkReading.current_page}
          totalPages={bookmarkReading.pages}
          onClose={() => setBookmarkReading(null)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

export default Readings
