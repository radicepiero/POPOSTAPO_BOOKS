import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import client from '../api/client'
import { readingStatusLabels } from '../utils/labels'

interface AuthorEdition {
  edition_id: number
  title: string
  subtitle?: string | null
  cover?: string | null
  reading_status?: string | null
  reading_id?: number | null
  has_copy: boolean
  copy_id?: number | null
}

interface AuthorWork {
  work_id: number
  title: string
  editions: AuthorEdition[]
}

interface AuthorData {
  author_id: number
  name: string
  given_name?: string | null
  family_name?: string | null
  birth_date?: string | null
  death_date?: string | null
  works: AuthorWork[]
}

function Badge({ type, label }: { type: 'reading' | 'copy'; label: string }) {
  const styles: Record<string, React.CSSProperties> = {
    reading: { background: '#e3f2fd', color: '#174a6e' },
    copy: { background: '#e8f5e9', color: '#2e5c30' },
  }
  return (
    <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '0.35rem', ...styles[type] }}>
      {label}
    </span>
  )
}

function WorkRow({ work }: { work: AuthorWork }) {
  return (
    <div className="card" style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: '#1769aa', color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}>O</span>
        <strong>{work.title || 'Opera senza titolo'}</strong>
      </div>
      {work.editions.length === 0 ? (
        <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>Nessuna edizione collegata.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {work.editions.map((edition) => (
            <Link
              key={edition.edition_id}
              to={`/editions/${edition.edition_id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #eee', borderRadius: '0.4rem', padding: '0.5rem', background: '#fafafa' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1.5rem', height: '1.5rem', borderRadius: '0.25rem', background: '#555', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>E</span>
                {edition.cover && <img src={edition.cover} alt="" style={{ width: '36px', height: '50px', objectFit: 'contain', borderRadius: '0.25rem' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{edition.title}</div>
                  {edition.subtitle && <div style={{ fontSize: '0.8rem', color: '#666' }}>{edition.subtitle}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                    {edition.reading_status && <Badge type="reading" label={readingStatusLabels[edition.reading_status] || edition.reading_status} />}
                    {edition.has_copy && <Badge type="copy" label="In libreria" />}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function AuthorPage() {
  const { authorId } = useParams<{ authorId: string }>()
  const navigate = useNavigate()
  const [author, setAuthor] = useState<AuthorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        let resolvedId = authorId
        if (authorId === 'latest') {
          const { data } = await client.get('/authors/latest/reading')
          resolvedId = String(data.author_id)
          if (resolvedId !== 'latest') {
            navigate(`/authors/${resolvedId}`, { replace: true })
            return
          }
        }
        const { data } = await client.get(`/authors/${resolvedId}`)
        setAuthor(data)
      } catch (err: any) {
        setError(err.response?.data?.detail || err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [authorId, navigate])

  if (loading) return <p>Caricamento autore...</p>
  if (error) return <div className="error">{error}</div>
  if (!author) return <p>Nessun dato disponibile.</p>

  const dates = [author.birth_date, author.death_date].filter(Boolean).join(' – ')

  return (
    <div>
      <h2>{author.name}</h2>
      {(author.given_name || author.family_name) && (
        <p style={{ color: '#666', marginTop: '-0.5rem' }}>{[author.given_name, author.family_name].filter(Boolean).join(' ')}</p>
      )}
      {dates && <p style={{ color: '#666', fontSize: '0.9rem' }}>{dates}</p>}
      <h3>Opere</h3>
      {author.works.length === 0 && <p>Nessuna opera trovata per questo autore.</p>}
      {author.works.map((work) => (
        <WorkRow key={work.work_id} work={work} />
      ))}
    </div>
  )
}

export default AuthorPage
