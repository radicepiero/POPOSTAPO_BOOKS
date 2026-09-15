import { useState } from 'react'
import { Candidate } from '../services/bibliographicMappers'
import { buttonLabels, sourceLabels } from '../utils/labels'
import { Icon, IconName } from '../utils/icons'

interface Props {
  candidate: Candidate
  onUse?: () => void
  onSelect?: () => void
  footer?: React.ReactNode
  useIcon?: IconName
}

function isbn10To13(isbn10: string): string | undefined {
  const clean = isbn10.replace(/[-\s]/g, '').toUpperCase()
  if (!/^\d{9}[\dX]$/.test(clean)) return undefined
  const base = `978${clean.slice(0, 9)}`
  const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return `${base}${(10 - sum % 10) % 10}`
}

export default function EditionCard({ candidate, onUse, onSelect, footer, useIcon = 'useThis' }: Props) {
  const [expanded, setExpanded] = useState(false)

  const details: { label: string; value: string }[] = []
  if (candidate.language) details.push({ label: 'Lingua', value: candidate.language })
  if (candidate.isbn13) details.push({ label: 'ISBN-13', value: candidate.isbn13 })
  if (candidate.isbn10) details.push({ label: 'ISBN-10', value: candidate.isbn10 })
  if (candidate.isbn10 && candidate.isbn13) {
    details.push({
      label: 'Coerenza ISBN',
      value: isbn10To13(candidate.isbn10) === candidate.isbn13 ? 'ISBN-10 e ISBN-13 equivalenti' : 'Identificativi non equivalenti',
    })
  }
  if (candidate.physical_format) details.push({ label: 'Formato', value: candidate.physical_format })
  if (candidate.edition_name?.length) details.push({ label: 'Edizione', value: candidate.edition_name.join(', ') })
  if (candidate.series?.length) details.push({ label: 'Collana', value: candidate.series.join(', ') })
  if (candidate.publish_places?.length) details.push({ label: 'Luogo', value: candidate.publish_places.join(', ') })
  if (candidate.ebook_access && candidate.ebook_access !== 'no_ebook') details.push({ label: 'eBook', value: candidate.ebook_access })
  if (candidate.average_rating) details.push({ label: 'Rating', value: `${candidate.average_rating}${candidate.ratings_count ? ` (${candidate.ratings_count})` : ''}` })
  if (candidate.info_url) details.push({ label: 'Fonte', value: candidate.info_url })

  const sourceLabel = sourceLabels[candidate.source] || candidate.source

  const body = (
    <>
      {candidate.covers?.[0] && (
        <img
          src={candidate.covers[0]}
          alt="Copertina"
          style={{ maxWidth: '80px', maxHeight: '120px', objectFit: 'contain', marginRight: '0.75rem', float: 'left' }}
        />
      )}
      <p><strong>{candidate.title || 'Titolo sconosciuto'}</strong></p>
      {candidate.subtitle && <p>{candidate.subtitle}</p>}
      <p>Autori: {candidate.authors?.join(', ') || '—'}</p>
      {candidate.contributors && candidate.contributors.length > 0 && (
        <p>Contributori: {candidate.contributors.map((c) => `${c.name}${c.role ? ` (${c.role})` : ''}`).join(', ')}</p>
      )}
      <p>
        Editore: {candidate.publisher || candidate.publishers?.join(', ') || '—'}
        {candidate.year && ` (${candidate.year})`}
      </p>
      <p>
        ISBN: {candidate.isbn || candidate.isbn13 || candidate.isbn10 || '—'}
        {candidate.pages ? ` — ${candidate.pages} pp.` : ''}
      </p>
      <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.25rem 0 0' }}>{sourceLabel}</p>
      {candidate.warnings?.map((warning) => (
        <p key={warning} style={{ background: '#fff3cd', color: '#765c00', padding: '0.5rem', borderRadius: '0.35rem', fontSize: '0.8rem' }}>{warning}</p>
      ))}
      <div style={{ clear: 'both' }} />
    </>
  )

  const sourceBgColors: Record<string, string> = { postgresql: '#e8f5e9', openai_vision: '#e3f2fd' }

  return (
    <div
      className="card"
      style={{
        marginBottom: '0.75rem',
        backgroundColor: sourceBgColors[candidate.source] || '#fff',
      }}
    >
      <div style={{ cursor: onSelect ? 'pointer' : undefined }} onClick={onSelect}>
        {body}
      </div>
      {details.length > 0 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            style={{
              background: 'none', border: 'none', color: '#0077cc', cursor: 'pointer',
              padding: '0.25rem 0', fontSize: '0.85rem', marginTop: '0.25rem',
            }}
          >
            {expanded ? '− Meno dettagli' : '+ Più dettagli'}
          </button>
          {expanded && (
            <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.25rem' }}>
              {details.map((d) => (
                <p key={d.label} style={{ margin: '0.15rem 0' }}>
                  <strong>{d.label}:</strong>{' '}
                  {d.label === 'Fonte' ? (
                    <a href={d.value} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      {d.value}
                    </a>
                  ) : d.value}
                </p>
              ))}
            </div>
          )}
        </>
      )}
      {(onUse || footer) && (
        <div style={{ marginTop: '0.75rem' }}>
          {onUse && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onUse() }} style={{ width: '100%' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                <Icon name={useIcon} size={16} />
                {buttonLabels.useThis}
              </span>
            </button>
          )}
          {footer}
        </div>
      )}
    </div>
  )
}
