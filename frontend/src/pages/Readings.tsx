import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import client from '../api/client'
import ReadingCard from '../components/ReadingCard'
import { ReadingItem } from '../services/bibliographicMappers'
import BookmarkModal from '../components/BookmarkModal'
import WishlistStartReadingModal, { WishlistItem } from '../components/WishlistStartReadingModal'
import { buttonLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

type ReadingFilter = 'active' | 'wishlist' | 'finished' | 'abandoned' | 'all'
type ReadingStatus = 'active' | 'finished' | 'abandoned'

const filters: { value: ReadingFilter; label: string }[] = [
  { value: 'active', label: 'In corso' },
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'finished', label: 'Terminate' },
  { value: 'abandoned', label: 'Interrotte' },
  { value: 'all', label: 'Tutte' },
]

function formatDate(value?: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

function Readings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFilter = filters.some((item) => item.value === searchParams.get('status')) ? searchParams.get('status') as ReadingFilter : 'active'
  const [filter, setFilter] = useState<ReadingFilter>(initialFilter)
  const [readings, setReadings] = useState<ReadingItem[]>([])
  const [wishlist, setWishlist] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookmarkReading, setBookmarkReading] = useState<ReadingItem | null>(null)
  const [startingWishlistItem, setStartingWishlistItem] = useState<WishlistItem | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      if (filter === 'wishlist') {
        const { data } = await client.get('/wishlist', { params: { status: 'active' } })
        setWishlist(data.items || [])
        setReadings([])
      } else {
        const { data } = await client.get('/readings', { params: { status: filter, limit: 200 } })
        setReadings(data.items || [])
        setWishlist([])
      }
    } catch (err: any) {
      setError(err.response?.status === 401 ? 'Accedi per vedere le tue letture.' : 'Impossibile caricare i dati.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
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

  const deleteWishlistItem = async (itemId: number) => {
    if (!window.confirm('Vuoi davvero eliminare questo elemento dalla wishlist?')) return
    try {
      await client.delete(`/wishlist/${itemId}`)
      setWishlist((current) => current.filter((item) => item.id !== itemId))
    } catch {
      setError('Impossibile eliminare la voce dalla wishlist.')
    }
  }

  const refresh = async () => {
    setBookmarkReading(null)
    setStartingWishlistItem(null)
    await load()
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

      {loading && <p>Caricamento...</p>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && filter === 'wishlist' && wishlist.length === 0 && <p>Nessun elemento nella wishlist.</p>}
      {!loading && !error && filter !== 'wishlist' && readings.length === 0 && <p>Nessuna lettura in questa sezione.</p>}

      {filter === 'wishlist' && wishlist.map((item) => (
        <article className="card" key={item.id} style={{ marginBottom: '0.75rem' }}>
          <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>{item.title || item.work_title || 'Titolo sconosciuto'}</p>
          {item.author && <p style={{ margin: '0 0 0.35rem', color: '#555' }}>{item.author}</p>}
          {item.note && <p style={{ margin: '0.35rem 0', fontStyle: 'italic' }}>{item.note}</p>}
          {item.created_at && <p style={{ margin: '0.5rem 0', color: '#777', fontSize: '0.8rem' }}>Aggiunto il {formatDate(item.created_at)}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            <button type="button" onClick={() => setStartingWishlistItem(item)} disabled={!item.work_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <Icon name="addReading" size={14} />{buttonLabels.startReading}
            </button>
            <button type="button" onClick={() => deleteWishlistItem(item.id)} style={{ background: '#b00020', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <Icon name="delete" size={14} />{buttonLabels.delete}
            </button>
          </div>
          {!item.work_id && <p style={{ color: '#777', fontSize: '0.8rem', marginBottom: 0 }}>Collega prima questa voce a un'opera per iniziare la lettura.</p>}
        </article>
      ))}

      {filter !== 'wishlist' && readings.map((reading) => (
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
      {startingWishlistItem && (
        <WishlistStartReadingModal
          item={startingWishlistItem}
          onClose={() => setStartingWishlistItem(null)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

export default Readings
