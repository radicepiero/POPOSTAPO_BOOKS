import { useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import EntityBadge from '../components/EntityBadge'
import { authorLabels, buttonLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

interface AuthorResult {
  author_id?: number
  edition_id?: number
  edition_title?: string
  name: string
  source: 'author' | 'edition'
}

function Authors() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AuthorResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await client.get('/authors/search', { params: { q: trimmed } })
      setResults(data.items || [])
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : (typeof err.message === 'string' ? err.message : JSON.stringify(err.response?.data || err)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>{authorLabels.title}</h2>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={authorLabels.searchPlaceholder}
          style={{ flex: 1, margin: 0 }}
        />
        <button type="submit" disabled={loading} aria-label={buttonLabels.search} title={buttonLabels.search}>
          <Icon name="search" size={16} />
          {loading ? '...' : ''}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {results.length === 0 && !loading && !error && query.trim() && (
        <p>{authorLabels.noResults}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {results.map((result, index) => {
          const to = result.author_id ? `/authors/${result.author_id}` : `/editions/${result.edition_id}`
          return (
            <Link
              key={`${result.source}-${result.name}-${index}`}
              to={to}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem' }}>
                <EntityBadge type={result.source === 'author' ? 'author' : 'edition'} size="1.5rem" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{result.name}</div>
                  {result.source === 'edition' && result.edition_title && (
                    <div style={{ fontSize: '0.8rem', color: '#666' }}>
                      {authorLabels.fromEdition}: {result.edition_title}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default Authors
