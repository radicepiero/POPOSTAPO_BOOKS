import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import client from '../api/client'
import AuthorCard from '../components/AuthorCard'
import CopyFormModal from '../components/CopyFormModal'
import EditionCard from '../components/EditionCard'
import WorkCard from '../components/WorkCard'
import { Candidate } from '../services/bibliographicMappers'
import { buttonLabels, formLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

function EditionDetail() {
  const { editionId } = useParams<{ editionId: string }>()
  const navigate = useNavigate()
  const [edition, setEdition] = useState<any>(null)
  const [action, setAction] = useState<'copy' | 'reading' | null>(null)
  const [date, setDate] = useState('')
  const [currentPage, setCurrentPage] = useState('0')
  const [finished, setFinished] = useState(false)
  const [rating, setRating] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    client.get(`/editions/${editionId}`).then(({ data }) => setEdition(data)).catch((err) => setError(err.response?.data?.detail || err.message))
  }, [editionId])

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
      <EditionCard candidate={edition as Candidate} />
      <WorkCard title={edition.title} originalTitle={edition.work_title} authors={edition.authors} />
      <AuthorCard contributors={edition.contributors || []} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => setAction('reading')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="addReading" size={16} />{buttonLabels.addReading}</button>
        <button onClick={addToWishlist} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="addWishlist" size={16} />{buttonLabels.addWishlist}</button>
        <button onClick={() => setAction('copy')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="addCopy" size={16} />{buttonLabels.addCopy}</button>
      </div>
      {action === 'reading' && (
        <form className="card" onSubmit={addReading}>
          <h3>Lettura</h3>
          <label>{formLabels.acquisitionDate}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>{formLabels.page}<input type="number" min="0" value={currentPage} onChange={(event) => setCurrentPage(event.target.value)} /></label>
          <label><input type="checkbox" checked={finished} onChange={(event) => setFinished(event.target.checked)} style={{ width: 'auto', marginRight: '0.5rem' }} />Terminata</label>
          <label>{formLabels.rating}<input type="number" min="0" max="5" step="0.5" value={rating} onChange={(event) => setRating(event.target.value)} /></label>
          <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="save" size={16} />{buttonLabels.save}</button>
        </form>
      )}
      {action === 'copy' && (
        <CopyFormModal
          editionId={Number(editionId)}
          onClose={() => setAction(null)}
          onSaved={() => navigate('/library')}
        />
      )}
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default EditionDetail
