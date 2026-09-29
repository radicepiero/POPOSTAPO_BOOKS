import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ReadingItem, readingToCandidate } from '../services/bibliographicMappers'
import EditionCard from './EditionCard'
import { buttonLabels, readingListLabels, readingStatusLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

export type { ReadingItem }

interface Props {
  reading: ReadingItem
  onStatusChange: (status: ReadingItem['status']) => void
  onDelete: () => void
  onAddBookmark: () => void
}

function formatDate(value?: string) {
  if (!value) return undefined
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

export default function ReadingCard({ reading, onStatusChange, onDelete, onAddBookmark }: Props) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const hasProgress = reading.status === 'active' && Boolean(reading.pages && reading.pages > 0)
  const progress = hasProgress ? Math.min(100, Math.max(0, Math.round(reading.current_page / reading.pages! * 100))) : 0
  const activityDate = reading.last_activity || reading.end_date || reading.start_date

  const actionButton = (label: string, iconName: Parameters<typeof Icon>[0]['name'], onClick: () => void, style?: React.CSSProperties) => (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onClick() }}
      style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', ...style }}
    >
      <Icon name={iconName} size={14} />
      {label}
    </button>
  )

  const progressBlock = reading.status === 'finished' ? (
    <p style={{ margin: '0.15rem 0' }}>{readingStatusLabels.finished}{reading.end_date ? ` il ${formatDate(reading.end_date)}` : ''}</p>
  ) : reading.status === 'abandoned' ? (
    <p style={{ margin: '0.15rem 0' }}>{readingStatusLabels.abandoned}{reading.current_page > 0 ? ` a pagina ${reading.current_page}` : ''}</p>
  ) : hasProgress ? (
    <div style={{ margin: '0.5rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
        <span>{readingListLabels.pageOf(reading.current_page, reading.pages)}</span>
        <strong>{progress}%</strong>
      </div>
      <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} style={{ height: '0.65rem', background: '#ddd', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: '#1769aa' }} />
      </div>
    </div>
  ) : (
    <p style={{ margin: '0.15rem 0' }}>{reading.current_page > 0 ? readingListLabels.pageOf(reading.current_page) : readingStatusLabels.active}</p>
  )

  return (
    <EditionCard
      candidate={readingToCandidate(reading)}
      variant="compact"
      onSelect={() => navigate(`/editions/${reading.edition_id}`)}
      footer={(
        <div>
          {reading.is_inactive && <span style={{ display: 'inline-block', padding: '0.2rem 0.45rem', borderRadius: '0.4rem', background: '#fff3cd', color: '#765c00', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Inattiva da più di 2 mesi</span>}
          <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            {progressBlock}
            {reading.rating != null && <p style={{ margin: '0.15rem 0' }}>Valutazione: {Number(reading.rating).toLocaleString('it-IT')} / 5</p>}
            {reading.last_note && <p style={{ margin: '0.25rem 0', fontStyle: 'italic' }}>“{reading.last_note}”</p>}
            <p style={{ margin: '0.15rem 0' }}>
              {activityDate ? `${readingListLabels.lastUpdate}: ${formatDate(activityDate)}` : 'Data non disponibile'}
              {reading.variant_label ? ` · ${reading.variant_label}` : ''}
              {reading.bookmark_count > 0 ? ` · ${reading.bookmark_count} ${readingListLabels.bookmarkCount}` : ''}
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open) }}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <Icon name="actions" size={16} />
              {menuOpen ? buttonLabels.closeActions : buttonLabels.actions}
            </button>
            {menuOpen && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                {(reading.status === 'abandoned' || reading.status === 'finished') && actionButton(buttonLabels.continue, 'continue', () => onStatusChange('active'))}
                {reading.status === 'active' && (
                  <>
                    {actionButton(buttonLabels.addBookmark, 'addBookmark', onAddBookmark)}
                    {actionButton(buttonLabels.markAbandoned, 'delete', () => onStatusChange('abandoned'), { background: '#e5e5e5', color: '#333' })}
                    {actionButton(buttonLabels.markFinished, 'useThis', () => onStatusChange('finished'))}
                  </>
                )}
                {actionButton(buttonLabels.deleteReading, 'delete', onDelete, { background: '#b00020' })}
              </div>
            )}
          </div>
        </div>
      )}
    />
  )
}
