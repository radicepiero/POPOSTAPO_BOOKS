import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import client from '../api/client'
import { db } from '../db'
import CopyFormModal from '../components/CopyFormModal'

interface CopyItem {
  copy_id: number
  edition_id: number | null
  work_id: number | null
  status: string
  title?: string
  author?: string
  covers?: string[] | null
  publisher?: string | null
  pages?: number | null
  acquisition_date?: string
  acquisition_type_name?: string
  shelf_name?: string | null
  library_name?: string | null
  condition_note?: string | null
  reading_status?: string | null
  reading_id?: number | null
}

function formatDate(value?: string) {
  if (!value) return undefined
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function Library() {
  const navigate = useNavigate()
  const [copies, setCopies] = useState<CopyItem[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [editingCopy, setEditingCopy] = useState<CopyItem | null>(null)
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

  return (
    <div>
      <h2>La mia libreria</h2>
      {error && <div className="error">{error}</div>}
      {pending.length > 0 && (
        <>
          <h3>In attesa di sync</h3>
          {pending.map((c) => (
            <div className="card" key={`pending-${c.id}`}>
              <p>Copia #{c.copyId} — {c.isbn || 'senza ISBN'}</p>
              <p>Stato: {c.status}</p>
            </div>
          ))}
        </>
      )}
      <h3>Copie confermate</h3>
      {copies.map((c) => (
        <div className="card" key={c.copy_id} style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {c.covers?.[0] ? (
              <Link to={`/editions/${c.edition_id}`}>
                <img
                  src={c.covers[0]}
                  alt={`Copertina di ${c.title || 'questa edizione'}`}
                  style={{ width: '80px', height: '110px', objectFit: 'contain', borderRadius: '0.4rem' }}
                />
              </Link>
            ) : (
              <div style={{ width: '80px', height: '110px', background: '#eee', borderRadius: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '0.75rem' }}>No cover</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}><Link to={`/editions/${c.edition_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{c.title || 'Titolo sconosciuto'}</Link></p>
              {c.author && <p style={{ margin: '0 0 0.35rem', color: '#555' }}>{c.author}</p>}
              <p style={{ margin: '0', color: '#666', fontSize: '0.85rem' }}>
                {c.publisher}{c.publisher && c.pages ? ' · ' : ''}{c.pages ? `${c.pages} pp.` : ''}
              </p>
              {c.acquisition_type_name && (
                <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.8rem' }}>
                  {c.acquisition_type_name}{c.acquisition_date ? ` · ${formatDate(c.acquisition_date)}` : ''}
                </p>
              )}
              {(c.library_name || c.shelf_name) && (
                <p style={{ margin: '0.15rem 0 0', color: '#666', fontSize: '0.8rem' }}>
                  {[c.library_name, c.shelf_name].filter(Boolean).join(' · ')}
                </p>
              )}
              {c.reading_status ? (
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>
                  Stato lettura: <strong>{c.reading_status === 'active' ? 'in corso' : c.reading_status === 'finished' ? 'terminata' : c.reading_status === 'wishlist' ? 'wishlist' : c.reading_status}</strong>
                </p>
              ) : (
                c.edition_id && (
                  <button
                    type="button"
                    onClick={() => startReading(c.copy_id, c.edition_id!)}
                    style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                  >
                    Inizia lettura
                  </button>
                )
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
            <button type="button" onClick={() => setEditingCopy(c)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}>Modifica</button>
            <button type="button" onClick={() => copyAction(c.copy_id, 'lend')} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}>Presta</button>
            <button type="button" onClick={() => copyAction(c.copy_id, 'gift')} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}>Regala</button>
            <button type="button" onClick={() => copyAction(c.copy_id, 'sell')} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}>Vendi</button>
            <button type="button" onClick={() => copyAction(c.copy_id, 'return')} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}>Restituisci</button>
            <button type="button" onClick={() => deleteCopy(c.copy_id)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: '#b00020' }}>Elimina</button>
          </div>
        </div>
      ))}
      {copies.length === 0 && !error && <p>Nessuna copia confermata.</p>}

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
