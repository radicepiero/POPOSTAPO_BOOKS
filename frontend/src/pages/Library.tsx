import { useEffect, useState } from 'react'
import client from '../api/client'
import { db } from '../db'

interface CopyItem {
  copy_id: number
  edition_id: number | null
  work_id: number | null
  status: string
  title?: string
  author?: string
}

function Library() {
  const [copies, setCopies] = useState<CopyItem[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
    load()
  }, [])

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
        <div className="card" key={c.copy_id}>
          <p><strong>{c.title || 'Titolo sconosciuto'}</strong></p>
          <p>{c.author || ''}</p>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Copia #{c.copy_id} | Edizione #{c.edition_id} | Opera #{c.work_id}
          </p>
        </div>
      ))}
      {copies.length === 0 && !error && <p>Nessuna copia confermata.</p>}
    </div>
  )
}

export default Library
