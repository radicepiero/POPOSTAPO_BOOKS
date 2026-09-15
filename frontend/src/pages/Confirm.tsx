import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import client from '../api/client'

interface JobResult {
  id: string
  copy_id?: number
  status: string
  result?: any
}

function Confirm() {
  const { jobId } = useParams<{ jobId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<JobResult | null>(null)
  const [workTitle, setWorkTitle] = useState('')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [publisher, setPublisher] = useState('')
  const [year, setYear] = useState('')
  const [isbn, setIsbn] = useState('')
  const [pages, setPages] = useState('')
  const [contributors, setContributors] = useState<{ name: string; role: string }[]>([])
  const [isLocalEdition, setIsLocalEdition] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const proposalIndex = parseInt(searchParams.get('index') || '0', 10)

  useEffect(() => {
    if (!jobId) return
    client.get(`/editions/enrichment/${jobId}`).then(({ data }) => {
      setJob(data)
      const candidates = data.result?.candidates || []
      const edition = candidates[proposalIndex] || data.result?.proposed_edition || {}
      setIsLocalEdition(Boolean(edition.local_edition_id))
      setWorkTitle(edition.work_title || edition.title || '')
      setTitle(edition.title || '')
      setSubtitle(edition.subtitle || '')
      setAuthors((edition.authors || []).join(', '))
      setPublisher((edition.publishers || []).join(', '))
      setYear(edition.year ? String(edition.year) : '')
      setIsbn(edition.isbn || '')
      setPages(edition.pages ? String(edition.pages) : '')
      setContributors((edition.contributors || []).map((c: any) => ({ name: c.name || '', role: c.role || 'author' })))
    })
  }, [jobId, proposalIndex])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jobId || !job) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await client.post('/editions/confirm', {
        job_id: jobId,
        proposal_index: proposalIndex,
        work_title: workTitle || undefined,
        title: title || undefined,
        subtitle: subtitle || undefined,
        authors: authors.split(',').map((a) => a.trim()).filter(Boolean),
        contributors: contributors.filter((c) => c.name.trim()),
        publisher: publisher || undefined,
        year: year ? parseInt(year, 10) : undefined,
        isbn: isbn || undefined,
        pages: pages ? parseInt(pages, 10) : undefined,
      })
      navigate(`/editions/${data.edition_id}`)
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setLoading(false)
    }
  }

  if (!job) return <p>Caricamento proposta...</p>

  return (
    <div>
      <h2>Conferma metadati</h2>
      <form onSubmit={handleSubmit}>
        {isLocalEdition && <div className="metadata-source">Edizione già presente nel catalogo: i dati bibliografici sono in sola lettura. Puoi aggiungere i dati della tua copia.</div>}
        <section className="card">
          <h3>Opera</h3>
          <label>
            Titolo originale
            <input value={workTitle} disabled={isLocalEdition} onChange={(e) => setWorkTitle(e.target.value)} />
          </label>
          <label>
            Autori
            <input value={authors} disabled={isLocalEdition} onChange={(e) => setAuthors(e.target.value)} />
          </label>
        </section>
        <section className="card">
          <h3>Edizione</h3>
          <label>
            Titolo
            <input value={title} disabled={isLocalEdition} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Sottotitolo
            <input value={subtitle} disabled={isLocalEdition} onChange={(e) => setSubtitle(e.target.value)} />
          </label>
          <label>
            Editore
            <input value={publisher} disabled={isLocalEdition} onChange={(e) => setPublisher(e.target.value)} />
          </label>
          <label>
            Anno
            <input type="number" value={year} disabled={isLocalEdition} onChange={(e) => setYear(e.target.value)} />
          </label>
          <label>
            ISBN
            <input value={isbn} disabled={isLocalEdition} onChange={(e) => setIsbn(e.target.value)} />
          </label>
          <label>
            Pagine
            <input type="number" value={pages} disabled={isLocalEdition} onChange={(e) => setPages(e.target.value)} />
          </label>
          <div style={{ marginTop: '0.75rem' }}>
            <strong>Curatori, traduttori, illustratori…</strong>
            {contributors.map((contributor, index) => (
              <div key={index} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Nome"
                  value={contributor.name}
                  disabled={isLocalEdition}
                  onChange={(e) => {
                    const updated = [...contributors]
                    updated[index].name = e.target.value
                    setContributors(updated)
                  }}
                  style={{ flex: 2 }}
                />
                <select
                  value={contributor.role}
                  disabled={isLocalEdition}
                  onChange={(e) => {
                    const updated = [...contributors]
                    updated[index].role = e.target.value
                    setContributors(updated)
                  }}
                  style={{ flex: 1 }}
                >
                  <option value="author">Autore</option>
                  <option value="translator">Traduttore</option>
                  <option value="editor">Curatore</option>
                  <option value="illustrator">Illustratore</option>
                  <option value="other">Altro</option>
                </select>
                {!isLocalEdition && (
                  <button type="button" onClick={() => setContributors(contributors.filter((_, i) => i !== index))} style={{ background: '#b00020' }}>×</button>
                )}
              </div>
            ))}
            {!isLocalEdition && (
              <button type="button" onClick={() => setContributors([...contributors, { name: '', role: 'author' }])} style={{ marginTop: '0.5rem' }}>Aggiungi contributore</button>
            )}
          </div>
        </section>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? 'Salvataggio...' : 'Conferma'}
        </button>
      </form>
    </div>
  )
}

export default Confirm
