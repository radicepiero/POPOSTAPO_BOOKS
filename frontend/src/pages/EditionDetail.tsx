import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import client from '../api/client'

function EditionDetail() {
  const { editionId } = useParams<{ editionId: string }>()
  const navigate = useNavigate()
  const [edition, setEdition] = useState<any>(null)
  const [action, setAction] = useState<'copy' | 'reading' | null>(null)
  const [date, setDate] = useState('')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [currentPage, setCurrentPage] = useState('0')
  const [finished, setFinished] = useState(false)
  const [rating, setRating] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    client.get(`/editions/${editionId}`).then(({ data }) => setEdition(data)).catch((err) => setError(err.response?.data?.detail || err.message))
  }, [editionId])

  const addCopy = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await client.post(`/editions/${editionId}/copies`, {
        acquisition_date: date || undefined,
        price: price ? Number(price) : undefined,
        condition_note: note || undefined,
      })
      navigate('/library')
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  const addToWishlist = async () => {
    try {
      await client.post(`/editions/${editionId}/readings`, { status: 'wishlist' })
      navigate('/readings?status=wishlist')
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  const addReading = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await client.post(`/editions/${editionId}/readings`, {
        start_date: date || undefined,
        current_page: Number(currentPage) || 0,
        finished,
        rating: rating ? Number(rating) : undefined,
      })
      setAction(null)
      setDate('')
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  if (error && !edition) return <div className="error">{error}</div>
  if (!edition) return <p>Caricamento edizione...</p>

  return (
    <div>
      <h2>{edition.title}</h2>
      {(Object.keys(edition.images || {}).length > 0 || edition.covers?.length > 0) && (
        <section className="card">
          <h3>Immagini dell'edizione</h3>
          <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto' }}>
            {(Object.keys(edition.images || {}).length > 0
              ? Object.entries(edition.images).map(([role, url]) => ({ role, url }))
              : edition.covers.map((url: string, index: number) => ({ role: index === 0 ? 'front cover' : 'image', url })))
              .map((item: any) => (
                <figure key={`${item.role}-${item.url}`} style={{ margin: 0, minWidth: '110px' }}>
                  <img src={item.url} alt={item.role} style={{ width: '110px', height: '150px', objectFit: 'contain', borderRadius: '0.4rem' }} />
                  <figcaption style={{ fontSize: '0.75rem', color: '#666' }}>{{ 'front cover': 'Copertina', 'back cover': 'Retro', 'copyright or title page': 'Dati editoriali', image: 'Immagine' }[item.role as string] || item.role}</figcaption>
                </figure>
              ))}
          </div>
        </section>
      )}
      <section className="card">
        <h3>Opera</h3>
        <p><strong>Titolo originale:</strong> {edition.work_title || 'Non ancora identificata'}</p>
        <p><strong>Autori:</strong> {edition.authors?.join(', ') || 'Non ancora identificati'}</p>
      </section>
      <section className="card">
        <h3>Edizione</h3>
        {edition.subtitle && <p><strong>Sottotitolo:</strong> {edition.subtitle}</p>}
        <p><strong>Editore:</strong> {edition.publishers?.join(', ') || '—'}</p>
        <p><strong>Anno:</strong> {edition.year || '—'}</p>
        <p><strong>ISBN:</strong> {edition.isbn || '—'}</p>
        <p><strong>Pagine:</strong> {edition.pages || '—'}</p>
        {edition.contributors?.map((contributor: any, index: number) => <p key={index}><strong>{contributor.role}:</strong> {contributor.name}</p>)}
      </section>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => setAction('reading')}>Registra lettura</button>
        <button onClick={addToWishlist}>Aggiungi alla wishlist</button>
        <button onClick={() => setAction('copy')}>Aggiungi copia</button>
      </div>
      {action === 'reading' && (
        <form className="card" onSubmit={addReading}>
          <h3>Lettura</h3>
          <label>Data di inizio<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Pagina corrente<input type="number" min="0" value={currentPage} onChange={(event) => setCurrentPage(event.target.value)} /></label>
          <label><input type="checkbox" checked={finished} onChange={(event) => setFinished(event.target.checked)} style={{ width: 'auto', marginRight: '0.5rem' }} />Terminata</label>
          <label>Valutazione<input type="number" min="0" max="5" step="0.5" value={rating} onChange={(event) => setRating(event.target.value)} /></label>
          <button type="submit">Salva lettura</button>
        </form>
      )}
      {action === 'copy' && (
        <form className="card" onSubmit={addCopy}>
          <h3>Copia</h3>
          <label>Data di acquisto<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Prezzo<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
          <label>Condizioni e note<textarea maxLength={255} value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <button type="submit">Aggiungi alla libreria</button>
        </form>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default EditionDetail
