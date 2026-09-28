import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthorReference, WorkSummary } from '../services/bibliographicMappers'
import { editionLabels } from '../utils/labels'
import AuthorMiniCard from './AuthorMiniCard'
import EntityCard from './EntityCard'

interface Props {
  work?: WorkSummary | null
  title?: string
  originalTitle?: string
  authors?: string[]
  variant?: 'compact' | 'detail' | 'embedded'
}

export default function WorkCard({ work, title, originalTitle, authors, variant = 'embedded' }: Props) {
  const [showEditions, setShowEditions] = useState(false)
  const displayTitle = work?.original_title || originalTitle || title || editionLabels.unknownTitle
  const references: AuthorReference[] = work?.authors?.length
    ? work.authors
    : (authors || []).map((name) => ({ display_name: name, role: 'author' }))
  const date = work?.date?.year
    ? `${work.date.era === -1 ? `${work.date.year} a.C.` : work.date.year}`
    : null
  const related = work?.related_editions || []
  const relatedCount = Math.max(work?.related_editions_count || 0, related.length)

  return (
    <EntityCard type="work" title={displayTitle} variant={variant === 'detail' ? 'detail' : 'compact'}>
      {work?.original_subtitle && <p style={{ margin: '0.2rem 0' }}>{work.original_subtitle}</p>}
      {date && <p style={{ margin: '0.2rem 0' }}><strong>Data dell'opera:</strong> {date}</p>}
      {references.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
          {references.map((author, index) => <AuthorMiniCard key={`${author.id || author.display_name}-${index}`} author={author} />)}
        </div>
      )}
      {relatedCount > 0 && (
        <div style={{ marginTop: '0.65rem' }}>
          <button type="button" onClick={() => setShowEditions((current) => !current)} style={{ padding: '0.25rem 0.55rem' }}>
            {showEditions ? '−' : '+'} Altre edizioni ({relatedCount})
          </button>
          {showEditions && (
            <div style={{ marginTop: '0.5rem' }}>
              {related.map((edition) => (
                <Link key={edition.local_edition_id} to={`/editions/${edition.local_edition_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <EntityCard type="edition" title={edition.title} variant="mini" aside={edition.covers?.[0] && <img src={edition.covers[0]} alt="" style={{ width: '36px', height: '50px', objectFit: 'contain' }} />}>
                    <span style={{ color: '#666', fontSize: '0.8rem' }}>{[edition.year, edition.isbn].filter(Boolean).join(' · ')}</span>
                  </EntityCard>
                </Link>
              ))}
              {work?.id && relatedCount > related.length && <Link to={`/works/${work.id}`}>Vedi tutte</Link>}
            </div>
          )}
        </div>
      )}
    </EntityCard>
  )
}
