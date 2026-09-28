import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthorReference, Candidate } from '../services/bibliographicMappers'
import { buttonLabels, readingStatusLabels, sourceLabels } from '../utils/labels'
import { Icon, IconName } from '../utils/icons'
import AuthorMiniCard from './AuthorMiniCard'
import EntityBadge from './EntityBadge'
import EntityCard from './EntityCard'

interface Props {
  candidate: Candidate
  onUse?: () => void
  onSelect?: () => void
  footer?: React.ReactNode
  useIcon?: IconName
  variant?: 'compact' | 'detail' | 'selectable' | 'mini'
}

function isbn10To13(isbn10: string): string | undefined {
  const clean = isbn10.replace(/[-\s]/g, '').toUpperCase()
  if (!/^\d{9}[\dX]$/.test(clean)) return undefined
  const base = `978${clean.slice(0, 9)}`
  const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return `${base}${(10 - sum % 10) % 10}`
}

export default function EditionCard({ candidate, onUse, onSelect, footer, useIcon = 'useThis', variant = 'compact' }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [showAllImages, setShowAllImages] = useState(false)
  const authorRefs: AuthorReference[] = candidate.author_refs?.length
    ? candidate.author_refs
    : (candidate.authors || []).map((name) => ({ display_name: name, role: 'author' }))
  const authorKeys = new Set(authorRefs.map((author) => String(author.id || author.display_name)))
  const allContributorRefs: AuthorReference[] = (candidate.contributors || [])
    .map((contributor) => ({
      id: contributor.id,
      display_name: String('display_name' in contributor ? contributor.display_name : contributor.name),
      role: contributor.role,
    }))
    .filter((contributor) => !authorKeys.has(String(contributor.id || contributor.display_name)))
  const nonAuthorRefs = allContributorRefs.filter((contributor) => contributor.role && !['author', 'co_author'].includes(contributor.role))
  const contributorRefs = allContributorRefs.filter((contributor) => !contributor.role || ['author', 'co_author'].includes(contributor.role))
  const nonAuthorRefsByRole = new Map<string, AuthorReference[]>()
  for (const contributor of nonAuthorRefs) {
    const refs = nonAuthorRefsByRole.get(contributor.role || '') || []
    refs.push(contributor)
    nonAuthorRefsByRole.set(contributor.role || '', refs)
  }
  const legacyRefsByRole: Record<string, string[] | undefined> = {
    translator: candidate.translators,
    illustrator: candidate.illustrators,
    editor: candidate.editors,
  }
  for (const [role, names] of Object.entries(legacyRefsByRole)) {
    const refs = nonAuthorRefsByRole.get(role) || []
    refs.push(...(names || []).map((display_name) => ({ display_name, role })))
    nonAuthorRefsByRole.set(role, refs)
  }
  const details: { label?: React.ReactNode; value: React.ReactNode }[] = []
  const nonAuthorRoleRefs = [...nonAuthorRefsByRole.values()].flat()
    .filter((ref, index, refs) => refs.findIndex((item) => String(item.id || item.display_name) === String(ref.id || ref.display_name)) === index)
  if (nonAuthorRoleRefs.length) {
    details.push({
      value: (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {nonAuthorRoleRefs.map((ref, index) => <AuthorMiniCard key={`${ref.id || ref.display_name}-${index}`} author={ref} showRole />)}
        </span>
      ),
    })
  }
  if (candidate.work) {
    details.push({
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <EntityBadge type="work" size="1.25rem" /> Titolo originale
        </span>
      ),
      value: (
        <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
          <Link to={`/works/${candidate.work.id}`} onClick={(event) => event.stopPropagation()}>{candidate.work.original_title}</Link>
          {candidate.work.original_subtitle && <span>{candidate.work.original_subtitle}</span>}
          {candidate.work.date?.year && <span>{candidate.work.date.year}</span>}
          {candidate.work.language && <span>{candidate.work.language}</span>}
        </span>
      ),
    })
  }
  if (candidate.isbn13) details.push({ label: 'ISBN-13', value: candidate.isbn13 })
  if (candidate.isbn10) details.push({ label: 'ISBN-10', value: candidate.isbn10 })
  if (candidate.isbn10 && candidate.isbn13) details.push({ label: 'Coerenza ISBN', value: isbn10To13(candidate.isbn10) === candidate.isbn13 ? 'ISBN-10 e ISBN-13 equivalenti' : 'Identificativi non equivalenti' })
  if (candidate.physical_format) details.push({ label: 'Formato', value: candidate.physical_format })
  if (candidate.edition_name?.length) details.push({ label: 'Edizione', value: candidate.edition_name.join(', ') })
  if (candidate.series?.length) details.push({ label: 'Collana', value: candidate.series.join(', ') })
  if (candidate.publish_places?.length) details.push({ label: 'Luogo', value: candidate.publish_places.join(', ') })
  if (candidate.info_url) details.push({ label: 'Fonte', value: candidate.info_url })
  const userState = candidate.user_state
  const statusDate = userState?.reading_end_date || userState?.reading_start_date
  const copiesLabel = userState?.copies_count ? `${userState.copies_count} ${userState.copies_count === 1 ? 'copia posseduta' : 'copie possedute'}` : null
  const visibleCovers = candidate.covers || []
  const imageAside = variant === 'detail' ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '130px' }}>
      {visibleCovers[0] && <img src={visibleCovers[0]} alt="Copertina" style={{ width: 'auto', maxWidth: '120px', height: '170px', objectFit: 'contain', alignSelf: 'center', borderRadius: '0.35rem' }} />}
      {visibleCovers.length > 1 && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); setShowAllImages((current) => !current) }}
          aria-label={showAllImages ? 'Mostra solo la copertina' : `Mostra altre ${visibleCovers.length - 1} immagini`}
          title={showAllImages ? 'Mostra solo la copertina' : `+${visibleCovers.length - 1} immagini`}
          style={{ background: 'none', border: 'none', color: '#0077cc', padding: '0.25rem 0', width: 'auto', fontSize: '0.85rem' }}
        >
          {showAllImages ? '−' : `+${visibleCovers.length - 1}`}
        </button>
      )}
      {showAllImages && visibleCovers.slice(1).map((cover, index) => (
        <img key={`${cover}-${index}`} src={cover} alt={`Immagine variante ${index + 2}`} style={{ width: 'auto', maxWidth: '120px', height: '170px', objectFit: 'contain', alignSelf: 'center', borderRadius: '0.35rem' }} />
      ))}
    </div>
  ) : (
    visibleCovers[0] && <img src={visibleCovers[0]} alt="Copertina" style={{ width: variant === 'mini' ? '45px' : '95px', height: 'auto', objectFit: 'contain', borderRadius: '0.35rem' }} />
  )
  const badges = [
    userState?.reading_status ? `${readingStatusLabels[userState.reading_status] || userState.reading_status}${statusDate ? ` · ${statusDate}` : ''}` : null,
  ].filter(Boolean)

  return (
    <EntityCard
      type="edition"
      title={candidate.title || 'Titolo sconosciuto'}
      variant={variant}
      onSelect={onSelect}
      aside={imageAside}
      header={(
        <>
          <strong style={{ display: 'block', marginBottom: '0.35rem' }}>{candidate.title || 'Titolo sconosciuto'}</strong>
          {candidate.subtitle && <p style={{ margin: '0.2rem 0' }}>{candidate.subtitle}</p>}
          {(authorRefs.length > 0 || contributorRefs.length > 0) && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.4rem 0' }}>{[...authorRefs, ...contributorRefs].map((author, index) => <AuthorMiniCard key={`${author.id || author.display_name}-${index}`} author={author} showRole={Boolean(author.role && author.role !== 'author')} />)}</div>}
        </>
      )}
      footer={(onUse || footer) && <>{onUse && <button type="button" onClick={(event) => { event.stopPropagation(); onUse() }} aria-label={buttonLabels.useThis} title={buttonLabels.useThis} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={useIcon} size={18} /></button>}{footer}</>}
    >
      <p style={{ margin: '0.55rem 0 0.25rem' }}>Editore: {candidate.publisher || candidate.publishers?.join(', ') || '—'}{candidate.year && ` (${candidate.year})`}</p>
      <p style={{ margin: '0.25rem 0' }}>ISBN: {candidate.isbn || candidate.isbn13 || candidate.isbn10 || '—'}{candidate.pages ? ` — ${candidate.pages} pp.` : ''}{candidate.language ? ` — ${candidate.language}` : ''}</p>
      {(copiesLabel || badges.length > 0) && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
        {copiesLabel && (
          <Link
            to={candidate.local_edition_id ? `/library?edition_id=${candidate.local_edition_id}` : '/library'}
            onClick={(event) => event.stopPropagation()}
            style={{ padding: '0.2rem 0.45rem', borderRadius: '0.35rem', background: '#e8f5e9', color: '#2e5c30', fontSize: '0.75rem', textDecoration: 'none' }}
          >
            {copiesLabel}
          </Link>
        )}
        {badges.map((badge) => <span key={badge} style={{ padding: '0.2rem 0.45rem', borderRadius: '0.35rem', background: '#e8f5e9', color: '#2e5c30', fontSize: '0.75rem' }}>{badge}</span>)}
      </div>}
      <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.35rem 0 0' }}>{sourceLabels[candidate.source] || candidate.source}</p>
      {candidate.warnings?.map((warning) => <p key={warning} style={{ background: '#fff3cd', color: '#765c00', padding: '0.5rem', borderRadius: '0.35rem', fontSize: '0.8rem' }}>{warning}</p>)}
      {details.length > 0 && <><button type="button" onClick={(event) => { event.stopPropagation(); setExpanded(!expanded) }} style={{ background: 'none', border: 'none', color: '#0077cc', padding: '0.25rem 0' }}>{expanded ? '− Meno dettagli' : '+ Più dettagli'}</button>{expanded && <div style={{ fontSize: '0.85rem', color: '#555' }}>{details.map((detail, index) => <p key={index} style={{ margin: '0.25rem 0' }}>{detail.label && <strong>{detail.label}: </strong>}{detail.value}</p>)}</div>}</>}
    </EntityCard>
  )
}
