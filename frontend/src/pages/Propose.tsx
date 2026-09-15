import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import client from '../api/client'
import EditionCard from '../components/EditionCard'
import { Candidate } from '../services/bibliographicMappers'

interface JobResult {
  id: string
  copy_id?: number
  status: string
  result?: any
}

function toCandidate(candidate: any): Candidate {
  return {
    source: candidate.source || 'unknown',
    record_type: candidate.record_type || 'edition',
    external_id: candidate.external_id,
    local_edition_id: candidate.local_edition_id,
    title: candidate.title,
    subtitle: candidate.subtitle,
    edition_name: candidate.edition_name,
    authors: candidate.authors,
    contributors: candidate.contributors,
    translators: candidate.translators,
    illustrators: candidate.illustrators,
    editors: candidate.editors,
    publishers: candidate.publishers,
    publisher: candidate.publisher,
    publish_date: candidate.publish_date,
    year: candidate.year,
    publish_places: candidate.publish_places,
    physical_format: candidate.physical_format,
    print_type: candidate.print_type,
    isbn: candidate.isbn,
    isbn10: candidate.isbn10,
    isbn13: candidate.isbn13,
    issn: candidate.issn,
    lccn: candidate.lccn,
    oclc: candidate.oclc,
    other_identifiers: candidate.other_identifiers,
    pages: candidate.pages,
    language: candidate.language || candidate.languages?.[0],
    series: candidate.series,
    covers: candidate.covers,
    images: candidate.images,
    thumbnail: candidate.thumbnail,
    preview_url: candidate.preview_url,
    info_url: candidate.info_url,
    ebook_access: candidate.ebook_access,
    has_fulltext: candidate.has_fulltext,
    average_rating: candidate.average_rating,
    ratings_count: candidate.ratings_count,
    dimensions: candidate.dimensions,
    weight: candidate.weight,
    warnings: candidate.warnings,
    raw: candidate.raw,
  }
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
            <summary>Testo letto dall&apos;OCR</summary>
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
      <h2>Scegli l&apos;edizione</h2>
      {candidates.map((candidate: any, index: number) => (
        <EditionCard
          key={`${candidate.isbn || candidate.title}-${index}`}
          candidate={toCandidate(candidate)}
          onUse={() => navigate(`/confirm/${jobId}?index=${index}`)}
        />
      ))}
      {ocr && (
        <details style={{ margin: '1rem 0', color: '#666' }}>
          <summary>Testo letto dall&apos;OCR</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{JSON.stringify(ocr, null, 2)}</pre>
        </details>
      )}
    </div>
  )
}

export default Propose
