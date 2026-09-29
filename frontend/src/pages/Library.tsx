import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import client from '../api/client'
import { db } from '../db'
import CopyFormModal from '../components/CopyFormModal'
import EditionCard from '../components/EditionCard'
import { CopyItem, copyToCandidate } from '../services/bibliographicMappers'
import { buttonLabels, libraryLabels } from '../utils/labels'
import { Icon } from '../utils/icons'

function formatDate(value?: string) {
  if (!value) return undefined
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function Library() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editionId = Number(searchParams.get('edition_id'))
  const [copies, setCopies] = useState<CopyItem[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [editingCopy, setEditingCopy] = useState<CopyItem | null>(null)
  const [menuCopyId, setMenuCopyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const localPending = await db.pendingCopies.toArray()
    try {
      const { data } = await client.get('/copies')
      const serverCopies: CopyItem[] = Array.isArray(data) ? data : data.items || []
      const approvedIds = new Set(serverCopies.filter((copy) => copy.status === 'approved').map((copy) => copy.copy_id))
      const completed = localPending.filter((copy) => copy.copyId && approvedIds.has(copy.copyId))
      await db.pendingCopies.bulkDelete(completed.flatMap((copy) => copy.id ? [copy.id] : []))
      setPending(localPending.filter((copy) => !copy.copyId || !approvedIds.has(copy.copyId)))
      setCopies(serverCopies)
    } catch {
      setPending(localPending)
      setError('Catalogo server non disponibile offline')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const startReading = async (copyId: number, editionId: number) => {
    try {
      await client.post(`/copies/${copyId}/start-reading`)
      navigate(`/editions/${editionId}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  const deleteCopy = async (copyId: number) => {
    if (!window.confirm('Vuoi davvero eliminare questa copia?')) return
    try {
      await client.delete(`/copies/${copyId}`)
      setCopies((current) => current.filter((c) => c.copy_id !== copyId))
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  const copyAction = async (copyId: number, type: 'lend' | 'gift' | 'sell' | 'return') => {
    try {
      await client.post(`/copies/${copyId}/action`, { type })
      load()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }

  const displayedCopies = Number.isInteger(editionId) && editionId > 0
    ? copies.filter((copy) => copy.edition_id === editionId)
    : copies

  return (
    <div>
      <h2>{libraryLabels.title}</h2>
      {error && <div className="error">{error}</div>}
      {pending.length > 0 && (
        <>
          <h3>{libraryLabels.pending}</h3>
          {pending.map((c) => (
            <div className="card" key={`pending-${c.id}`}>
              <p>Copia #{c.copyId} — {c.isbn || 'senza ISBN'}</p>
              <p>Stato: {c.status}</p>
            </div>
          ))}
        </>
      )}
      <h3>{libraryLabels.confirmed}</h3>
      {displayedCopies.map((c) => (
        <EditionCard
          key={c.copy_id}
          candidate={copyToCandidate(c)}
          variant="compact"
          onSelect={() => c.edition_id && navigate(`/editions/${c.edition_id}`)}
          footer={(
            <div>
              <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                {c.acquisition_type_name && (
                  <p style={{ margin: '0.15rem 0' }}>{c.acquisition_type_name}{c.acquisition_date ? ` · ${formatDate(c.acquisition_date)}` : ''}</p>
                )}
                {(c.library_name || c.shelf_name) && (
                  <p style={{ margin: '0.15rem 0' }}>{[c.library_name, c.shelf_name].filter(Boolean).join(' · ')}</p>
                )}
                {c.variant_label && <p style={{ margin: '0.15rem 0' }}>{c.variant_label}</p>}
                {c.reading_status ? (
                  <p style={{ margin: '0.15rem 0' }}>Stato lettura: <strong>{c.reading_status === 'active' ? 'in corso' : c.reading_status === 'finished' ? 'terminata' : c.reading_status === 'wishlist' ? 'wishlist' : c.reading_status}</strong></p>
                ) : (
                  c.edition_id && (
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); startReading(c.copy_id, c.edition_id!) }}
                      style={{ marginTop: '0.25rem', padding: '0.4rem 0.6rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <Icon name="addReading" size={14} />
                      {buttonLabels.startReading}
                    </button>
                  )
                )}
              </div>
              <div>
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); setMenuCopyId(menuCopyId === c.copy_id ? null : c.copy_id) }}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Icon name="actions" size={16} />
                  {menuCopyId === c.copy_id ? buttonLabels.closeActions : buttonLabels.actions}
                </button>
                {menuCopyId === c.copy_id && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                    <button type="button" onClick={(event) => { event.stopPropagation(); setEditingCopy(c); setMenuCopyId(null) }} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="edit" size={14} />{buttonLabels.modify}</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); copyAction(c.copy_id, 'lend') }} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="lend" size={14} />{buttonLabels.lend}</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); copyAction(c.copy_id, 'gift') }} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="gift" size={14} />{buttonLabels.gift}</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); copyAction(c.copy_id, 'sell') }} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="sell" size={14} />{buttonLabels.sell}</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); copyAction(c.copy_id, 'return') }} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="return" size={14} />{buttonLabels.return}</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); deleteCopy(c.copy_id) }} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: '#b00020', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="delete" size={14} />{buttonLabels.delete}</button>
                  </div>
                )}
              </div>
            </div>
          )}
        />
      ))}
      {displayedCopies.length === 0 && !error && <p>{libraryLabels.empty}</p>}

      {editingCopy && (
        <CopyFormModal
          copy={editingCopy}
          onClose={() => setEditingCopy(null)}
          onSaved={() => {
            setEditingCopy(null)
            load()
          }}
        />
      )}
    </div>
  )
}

export default Library
