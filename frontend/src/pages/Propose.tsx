import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import client from '../api/client'

interface JobResult {
  id: string
  copy_id?: number
  status: string
  result?: any
}

function Propose() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const [job, setJob] = useState<JobResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    const interval = setInterval(async () => {
      try {
        const { data } = await client.get(`/editions/enrichment/${jobId}`)
        setJob(data)
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval)
        }
      } catch (err: any) {
        const msg = err.response?.data?.detail || err.message
        setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [jobId])

  if (error) return <div className="error">{error}</div>
  if (!job) return <p>Recupero proposta in corso...</p>

  if (job.status === 'pending') {
    return <p>Recupero proposta da Open Library / Google Books in corso... attendi fino a 20 secondi.</p>
  }

  const ocr = job.result?.raw?.ocr || job.result?.ocr

  if (job.status === 'failed') {
    return (
      <div>
        <h2>Enrichment fallito</h2>
        <p>Non sono riuscito a trovare i metadati automaticamente.</p>
        {job.result?.reason && <p style={{ color: '#666' }}>Motivo: {typeof job.result.reason === 'string' ? job.result.reason : JSON.stringify(job.result.reason)}</p>}
        {ocr && (
          <details style={{ margin: '1rem 0', color: '#666' }}>
            <summary>Testo letto dall’OCR</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{JSON.stringify(ocr, null, 2)}</pre>
          </details>
        )}
        <button onClick={() => navigate(`/confirm/${jobId}`)}>
          Inserisci manualmente
        </button>
      </div>
    )
  }

  const candidates = job.result?.candidates || []

  if (candidates.length === 0) {
    return (
      <div>
        <h2>Nessuna proposta</h2>
        <button onClick={() => navigate(`/confirm/${jobId}`)}>
          Inserisci manualmente
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2>Scegli l'edizione</h2>
      {candidates.map((candidate: any, index: number) => (
        <div className="card" key={`${candidate.isbn || candidate.title}-${index}`}>
          {candidate.covers?.[0] && (
            <img src={candidate.covers[0]} alt={`Copertina di ${candidate.title || 'questa edizione'}`} style={{ maxWidth: '100px', maxHeight: '150px', objectFit: 'contain' }} />
          )}
          <section className="metadata-section">
            <h3>Opera</h3>
            <p><strong>Titolo:</strong> {candidate.title || 'Non identificato'}</p>
            <p><strong>Autore:</strong> {candidate.authors?.join(', ') || '—'}</p>
          </section>
          <section className="metadata-section">
            <h3>Edizione</h3>
            <p><strong>Titolo:</strong> {candidate.title || '—'}</p>
            {candidate.subtitle && <p><strong>Sottotitolo:</strong> {candidate.subtitle}</p>}
            {candidate.contributors?.map((contributor: any, contributorIndex: number) => (
              <p key={`${contributor.role}-${contributorIndex}`}><strong>{contributor.role === 'translator' ? 'Traduttore' : contributor.role === 'editor' ? 'Curatore' : contributor.role}:</strong> {contributor.name}</p>
            ))}
            <p><strong>Editore:</strong> {candidate.publishers?.join(', ') || '—'}</p>
            <p><strong>Data di pubblicazione:</strong> {candidate.publish_date || candidate.year || '—'}</p>
            <p><strong>ISBN:</strong> {candidate.isbn || '—'}</p>
            {candidate.pages && <p><strong>Pagine:</strong> {candidate.pages}</p>}
            {(candidate.language || candidate.languages?.[0]) && <p><strong>Lingua:</strong> {candidate.language || candidate.languages?.[0]}</p>}
            {candidate.edition_name?.length > 0 && <p><strong>Edizione:</strong> {candidate.edition_name.join(', ')}</p>}
          </section>
          <section className="metadata-source">
            <p><strong>Fonte:</strong> {candidate.source || 'sconosciuta'}</p>
            {candidate.external_id && <p><strong>ID fonte:</strong> {candidate.external_id}</p>}
          </section>
          <button onClick={() => navigate(`/confirm/${jobId}?index=${index}`)}>
            Scegli questa edizione
          </button>
        </div>
      ))}
      {ocr && (
        <details style={{ margin: '1rem 0', color: '#666' }}>
          <summary>Testo letto dall’OCR</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{JSON.stringify(ocr, null, 2)}</pre>
        </details>
      )}
    </div>
  )
}

export default Propose
