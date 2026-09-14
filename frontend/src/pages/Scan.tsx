import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import BarcodeScanner from '../components/BarcodeScanner'
import BookCameraCapture from '../components/BookCameraCapture'
import {
  Candidate,
  mapGoogleBooksResponse,
  mapOpenLibrarySearchResponse,
  mapOpenAIVisionResponse,
} from '../services/bibliographicMappers'

const sourceColors: Record<string, string> = {
  postgresql: '#e8f5e9',
  open_library: '#f0f0f0',
  google_books: '#f0f0f0',
  openai_vision: '#e3f2fd',
}

const sourceLabels: Record<string, string> = {
  postgresql: 'Catalogo locale',
  open_library: 'Open Library',
  google_books: 'Google Books',
  openai_vision: 'Foto copertina',
}

function isbn10To13(isbn10: string): string | undefined {
  const clean = isbn10.replace(/[-\s]/g, '').toUpperCase()
  if (!/^\d{9}[\dX]$/.test(clean)) return undefined
  const base = `978${clean.slice(0, 9)}`
  const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return `${base}${(10 - sum % 10) % 10}`
}

function canonicalIsbn(value: string): string {
  const clean = value.replace(/[-\s]/g, '').toUpperCase()
  return clean.length === 10 ? isbn10To13(clean) || clean : clean
}

function candidateScore(c: Candidate): number {
  let score = 0
  if (c.source === 'postgresql') score += 10
  if (c.title) score += 10
  if (c.authors?.length) score += 10
  if (c.publisher) score += 8
  if (c.isbn || c.isbn13 || c.isbn10) score += 8
  if (c.year) score += 5
  if (c.pages) score += 3
  if (c.covers?.length) score += 5
  if (c.language) score += 2
  return score
}

function CandidateCard({ candidate, onSelect }: { candidate: Candidate; onSelect: (c: Candidate) => void }) {
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

  const bgColor = sourceColors[candidate.source] || '#fff'
  const sourceLabel = sourceLabels[candidate.source] || candidate.source

  return (
    <div className="card" style={{ marginBottom: '0.75rem', backgroundColor: bgColor }}>
      <div
        onClick={() => onSelect(candidate)}
        style={{ cursor: 'pointer' }}
      >
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
        <p>
          Editore: {candidate.publisher || '—'}
          {candidate.year && ` (${candidate.year})`}
        </p>
        <p>ISBN: {candidate.isbn || '—'}{candidate.pages ? ` — ${candidate.pages} pp.` : ''}</p>
        <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.25rem 0 0' }}>{sourceLabel}</p>
        {candidate.warnings?.map((warning) => (
          <p key={warning} style={{ background: '#fff3cd', color: '#765c00', padding: '0.5rem', borderRadius: '0.35rem', fontSize: '0.8rem' }}>{warning}</p>
        ))}
        <div style={{ clear: 'both' }} />
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
    </div>
  )
}

function isValidIsbn13(value: string) {
  if (!/^97[89]\d{10}$/.test(value)) return false
  const sum = value.slice(0, 12).split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10 === Number(value[12])
}

function isValidIsbn10(value: string) {
  if (!/^\d{9}[\dX]$/.test(value)) return false
  const sum = value.split('').reduce((total, character, index) => {
    const digit = character === 'X' ? 10 : Number(character)
    return total + digit * (10 - index)
  }, 0)
  return sum % 11 === 0
}

interface EditForm {
  candidate: Candidate
  title: string
  subtitle: string
  authors: string
  publisher: string
  year: string
  isbn: string
  pages: string
}

function Scan() {
  const [query, setQuery] = useState('')
  const [isbn, setIsbn] = useState('')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [image, setImage] = useState<File | null>(null)
  const [backImage, setBackImage] = useState<File | null>(null)
  const [copyrightPage, setCopyrightPage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [backPreview, setBackPreview] = useState<string | null>(null)
  const [copyrightPreview, setCopyrightPreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [capturing, setCapturing] = useState<'front' | 'back' | 'copyright' | null>(null)
  const [searching, setSearching] = useState(false)
  const [pendingSources, setPendingSources] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Candidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditForm | null>(null)
  const navigate = useNavigate()
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }

  const handleOptionalFile = (kind: 'back' | 'copyright', file?: File) => {
    if (!file) return
    if (kind === 'back') {
      setBackImage(file)
      setBackPreview(URL.createObjectURL(file))
    } else {
      setCopyrightPage(file)
      setCopyrightPreview(URL.createObjectURL(file))
    }
  }

  const handleCameraCapture = (file: File) => {
    if (capturing === 'back') handleOptionalFile('back', file)
    else if (capturing === 'copyright') handleOptionalFile('copyright', file)
    else {
      setImage(file)
      setPreview(URL.createObjectURL(file))
    }
    setCapturing(null)
  }

  const clearSearch = () => {
    setResults([])
    setPendingSources(new Set())
    setError(null)
    setNotice(null)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }

  const candidateKey = (c: Candidate): string => {
    const t = (c.title || '').trim().toLowerCase()
    const pub = (c.publisher || '').trim().toLowerCase()
    const yr = c.year ?? ''
    const pg = c.pages ?? ''
    return `${t}|${pub}|${yr}|${pg}`
  }

  const dedup = (existing: Candidate[], incoming: Candidate[]): Candidate[] => {
    const seenIsbns = new Set<string>()
    const seenKeys = new Set<string>()
    for (const c of existing) {
      if (c.isbn13) seenIsbns.add(canonicalIsbn(c.isbn13))
      if (c.isbn10) seenIsbns.add(canonicalIsbn(c.isbn10))
      if (c.isbn) seenIsbns.add(canonicalIsbn(c.isbn))
      seenKeys.add(candidateKey(c))
    }
    return incoming.filter((c) => {
      if (c.isbn13 && seenIsbns.has(canonicalIsbn(c.isbn13))) return false
      if (c.isbn10 && seenIsbns.has(canonicalIsbn(c.isbn10))) return false
      if (c.isbn && seenIsbns.has(canonicalIsbn(c.isbn))) return false
      const key = candidateKey(c)
      if (seenKeys.has(key)) return false
      if (c.isbn13) seenIsbns.add(canonicalIsbn(c.isbn13))
      if (c.isbn10) seenIsbns.add(canonicalIsbn(c.isbn10))
      if (c.isbn) seenIsbns.add(canonicalIsbn(c.isbn))
      seenKeys.add(key)
      return true
    })
  }

  const looksLikeIsbn = (value: string): boolean => {
    const clean = value.replace(/[\s-]/g, '').toUpperCase()
    return isValidIsbn13(clean) || isValidIsbn10(clean)
  }

  /** Check if a candidate matches the advanced search criteria */
  const matchesAdvancedCriteria = (
    c: Candidate,
    criteria: { isbn?: string; title?: string; author?: string },
  ): boolean => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    if (criteria.isbn) {
      const ci = canonicalIsbn(criteria.isbn)
      const candidateIsbns = [c.isbn, c.isbn13, c.isbn10]
        .filter(Boolean)
        .map((s) => canonicalIsbn(s!))
      if (!candidateIsbns.some((i) => i === ci)) return false
    }

    if (criteria.title) {
      const words = norm(criteria.title).split(/\s+/).filter(Boolean)
      const haystack = norm([c.title || '', c.subtitle || ''].join(' '))
      if (!words.every((w) => haystack.includes(w))) return false
    }

    if (criteria.author) {
      const words = norm(criteria.author).split(/\s+/).filter(Boolean)
      const haystack = norm((c.authors || []).join(' '))
      if (!words.every((w) => haystack.includes(w))) return false
    }

    return true
  }

  const runTextSearch = (searchQuery: { isbn?: string; title?: string; author?: string }, seedCandidates?: Candidate[]) => {
    clearSearch()
    if (seedCandidates?.length) {
      setResults(seedCandidates)
    }
    if (!searchQuery.isbn && !searchQuery.title && !searchQuery.author) {
      setError('Inserisci almeno ISBN, titolo o autore')
      return
    }
    setSearching(true)
    const controller = new AbortController()
    abortControllerRef.current = controller

    const isbnField = searchQuery.isbn || ''
    const isRealIsbn = looksLikeIsbn(isbnField)
    const isAdvanced = showAdvanced

    const markDone = (source: string) => {
      setPendingSources((prev) => {
        const next = new Set(prev)
        next.delete(source)
        return next
      })
    }

    const filterAndAdd = (incoming: Candidate[]) => {
      let filtered = isAdvanced
        ? incoming.filter((c) => matchesAdvancedCriteria(c, searchQuery))
        : incoming
      if (isRealIsbn) {
        const requestedIsbn = canonicalIsbn(isbnField)
        filtered = filtered.filter((candidate) => [candidate.isbn, candidate.isbn10, candidate.isbn13]
          .filter(Boolean)
          .some((value) => canonicalIsbn(value!) === requestedIsbn))
      }
      setResults((prev) => [...prev, ...dedup(prev, filtered)])
    }

    if (isRealIsbn) {
      // Real ISBN: search local by ISBN first, if found stop, else launch all
      const localEndpoint = isAdvanced ? '/editions/search/local/advanced' : '/editions/search/local'
      setPendingSources(new Set(['local']))
      const params = { isbn: isbnField, title: searchQuery.title || '', author: searchQuery.author || '' }
      client
        .get(localEndpoint, { params, signal: controller.signal })
        .then(({ data }) => {
          if (data.found && data.candidates) filterAndAdd(data.candidates)
          markDone('local')
        })
        .catch(() => markDone('local'))
        .then(() => {
          setResults((prev) => {
            if (prev.length > 0) {
              setSearching(false)
              return prev
            }
            // Not found locally: launch API + full-text local
            setPendingSources(new Set(['local_ft', 'openlibrary', 'google']))
            const ftParams = { isbn: '', title: isbnField, author: searchQuery.author || '' }
            client
              .get(localEndpoint, { params: ftParams, signal: controller.signal })
              .then(({ data }) => {
                if (data.found && data.candidates) filterAndAdd(data.candidates)
                markDone('local_ft')
              })
              .catch(() => markDone('local_ft'))
            launchExternalSearches(params, controller, markDone, filterAndAdd)
            return prev
          })
        })
    } else {
      // Not a real ISBN: search in parallel
      setPendingSources(new Set(['local', 'openlibrary', 'google']))

      if (isAdvanced) {
        // Advanced: field-specific local search
        const localParams = { isbn: '', title: searchQuery.title || '', author: searchQuery.author || '' }
        client
          .get('/editions/search/local/advanced', { params: localParams, signal: controller.signal })
          .then(({ data }) => {
            if (data.found && data.candidates) filterAndAdd(data.candidates)
            markDone('local')
          })
          .catch(() => markDone('local'))
      } else {
        // Simple: full-text with all terms combined
        const allTerms = [isbnField, searchQuery.title || '', searchQuery.author || ''].filter(Boolean).join(' ').trim()
        const localParams = { isbn: '', title: allTerms, author: '' }
        client
          .get('/editions/search/local', { params: localParams, signal: controller.signal })
          .then(({ data }) => {
            if (data.found && data.candidates) filterAndAdd(data.candidates)
            markDone('local')
          })
          .catch(() => markDone('local'))
      }

      // API searches use the original field split
      const apiParams = {
        isbn: '',
        title: [isbnField, searchQuery.title || ''].filter(Boolean).join(' ').trim(),
        author: searchQuery.author || '',
      }
      launchExternalSearches(apiParams, controller, markDone, filterAndAdd)
    }
  }

  const launchExternalSearches = (
    params: { isbn: string; title: string; author: string },
    controller: AbortController,
    markDone: (s: string) => void,
    addResults: (c: Candidate[]) => void,
  ) => {
    const olQuery = params.isbn || (params.title ? `${params.title}${params.author ? ` author:${params.author}` : ''}` : `author:${params.author}`)
    const olFields = 'key,title,editions,editions.key,editions.title,editions.subtitle,editions.publisher,editions.publish_date,editions.number_of_pages,editions.isbn,editions.cover_i,editions.author_name'
    const olParams = new URLSearchParams({
      q: olQuery,
      fields: olFields,
      limit: '10',
    })
    const openlibraryReq = fetch(`https://openlibrary.org/search.json?${olParams.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Open Library request failed')
        return res.json()
      })
      .then((data) => {
        addResults(mapOpenLibrarySearchResponse(data))
        markDone('openlibrary')
      })
      .catch(() => markDone('openlibrary'))

    const googleReq = client
      .get('/editions/search/google', { params, signal: controller.signal })
      .then(({ data }) => {
        addResults(mapGoogleBooksResponse(data))
        markDone('google')
      })
      .catch(() => markDone('google'))

    Promise.allSettled([openlibraryReq, googleReq]).finally(() => setSearching(false))
  }

  const uploadImageSearch = async () => {
    if (!image) return
    setSearching(true)
    setError(null)
    setNotice(null)
    let launchedTextSearch = false
    try {
      const form = new FormData()
      form.append('image', image)
      if (backImage) form.append('back_image', backImage)
      if (copyrightPage) form.append('copyright_page', copyrightPage)
      const resp = await client.post('/editions/search/cover', form)
      const data = resp.data

      const visionCandidate = mapOpenAIVisionResponse(data)

      const searchParams = {
        isbn: visionCandidate.isbn || '',
        title: visionCandidate.title || '',
        author: (visionCandidate.authors || []).join(' '),
      }
      if (searchParams.isbn || searchParams.title || searchParams.author) {
        setNotice('Analisi completata. Ricerca di edizioni corrispondenti...')
        runTextSearch(searchParams, [visionCandidate])
        launchedTextSearch = true
      } else {
        setResults([visionCandidate])
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Errore analisi copertina'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      if (!launchedTextSearch) setSearching(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (image) {
      await uploadImageSearch()
      return
    }
    if (showAdvanced) {
      // Advanced mode: use separate fields
      runTextSearch({ isbn: isbn.trim(), title: title.trim(), author: author.trim() })
    } else {
      // Simple mode: single query field — detect if it looks like an ISBN
      const q = query.trim()
      if (!q) {
        setError('Inserisci un testo di ricerca')
        return
      }
      const clean = q.replace(/[\s-]/g, '').toUpperCase()
      if (looksLikeIsbn(clean)) {
        runTextSearch({ isbn: clean })
      } else {
        runTextSearch({ title: q })
      }
    }
  }

  const handleScan = async (code: string) => {
    const scannedCode = code.replace(/[\s-]/g, '').toUpperCase()
    setScanning(false)
    setError(null)
    if (showAdvanced) {
      setIsbn(scannedCode)
    } else {
      setQuery(scannedCode)
    }
    if (!isValidIsbn13(scannedCode) && !isValidIsbn10(scannedCode)) {
      setNotice(`Codice acquisito: ${scannedCode}. Non è stato riconosciuto come ISBN; puoi verificarlo o avviare manualmente la ricerca.`)
      return
    }
    setNotice('ISBN valido acquisito. Avvio della ricerca bibliografica...')
    runTextSearch({ isbn: scannedCode })
  }

  const handleCandidateSelect = (candidate: Candidate) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (candidate.local_edition_id) {
      navigate(`/editions/${candidate.local_edition_id}`)
      return
    }
    setEditing({
      candidate,
      title: candidate.title || '',
      subtitle: candidate.subtitle || '',
      authors: candidate.authors?.join(', ') || '',
      publisher: candidate.publisher || '',
      year: candidate.year ? String(candidate.year) : '',
      isbn: candidate.isbn || '',
      pages: candidate.pages ? String(candidate.pages) : '',
    })
  }

  const handleConfirmEditing = async () => {
    if (!editing) return
    setSearching(true)
    setError(null)
    try {
      const { raw, ...base } = editing.candidate
      const confirmData = {
        ...base,
        title: editing.title || undefined,
        subtitle: editing.subtitle || undefined,
        authors: editing.authors.split(',').map((a) => a.trim()).filter(Boolean),
        publisher: editing.publisher || undefined,
        year: editing.year ? parseInt(editing.year, 10) : undefined,
        isbn: editing.isbn || undefined,
        pages: editing.pages ? parseInt(editing.pages, 10) : undefined,
      }
      const resp = await client.post('/editions/confirm-candidate', confirmData)
      setEditing(null)
      navigate(`/editions/${resp.data.edition_id}`)
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Errore conferma edizione'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setSearching(false)
    }
  }

  const sortedResults = [...results].sort((a, b) => candidateScore(b) - candidateScore(a))

  return (
    <div>
      <h2>Cerca un'edizione</h2>
      <form onSubmit={handleSubmit}>
        {/* --- Simple search (single field) --- */}
        {!showAdvanced && !showCamera && (
          <>
            <label htmlFor="isbn-search" style={{ fontWeight: 600 }}>ISBN</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: '0.5rem', alignItems: 'stretch' }}>
              <input id="isbn-search" type="text" inputMode="numeric" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Inserisci ISBN" style={{ margin: 0 }} />
              <button type="button" onClick={() => setScanning(true)} aria-label="Scansiona codice a barre" title="Scansiona codice a barre" style={{ padding: '0.65rem 0.8rem' }}>Scanner</button>
              <button type="submit" disabled={searching} style={{ padding: '0.65rem 0.9rem' }}>{searching ? '...' : 'Cerca'}</button>
            </div>
            <button type="button" onClick={() => setShowAdvanced(true)} style={{ display: 'block', marginTop: '0.75rem', padding: 0, background: 'transparent', color: '#555', fontSize: '0.85rem' }}>Ricerca per titolo o autore</button>
          </>
        )}

        {/* --- Advanced search (separate fields) --- */}
        {showAdvanced && !showCamera && (
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Ricerca per dati bibliografici</strong><button type="button" onClick={() => setShowAdvanced(false)} style={{ background: 'transparent', color: '#555' }}>Chiudi</button></div>
            <label>ISBN<input type="text" value={isbn} onChange={(e) => setIsbn(e.target.value)} /></label>
            <label>Titolo<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label>Autore<input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
            <button type="submit" disabled={searching} style={{ width: '100%' }}>{searching ? 'Ricerca in corso...' : 'Cerca'}</button>
            <button type="button" onClick={() => setShowCamera(true)} style={{ display: 'block', marginTop: '0.75rem', padding: 0, background: 'transparent', color: '#1769aa', textDecoration: 'underline' }}>Cerca per immagini</button>
          </div>
        )}

        {/* --- Camera tools (collapsed) --- */}
        {showCamera && (
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}><strong>Identifica il libro dalle foto</strong><button type="button" onClick={() => setShowCamera(false)} style={{ background: 'transparent', color: '#555' }}>Indietro</button></div>
            <p style={{ color: '#666', marginTop: 0 }}>La copertina anteriore è necessaria. Le altre immagini migliorano il riconoscimento.</p>
            {[
              { kind: 'front' as const, label: 'Foto copertina', required: true, file: image, preview },
              { kind: 'back' as const, label: 'Foto retro', required: false, file: backImage, preview: backPreview },
              { kind: 'copyright' as const, label: 'Foto dati editoriali', required: false, file: copyrightPage, preview: copyrightPreview },
            ].map((item) => (
              <div key={item.kind} style={{ borderTop: '1px solid #ddd', padding: '0.9rem 0' }}>
                <strong>{item.label}</strong><span style={{ color: '#777', fontSize: '0.8rem' }}> · {item.required ? 'obbligatoria' : 'opzionale'}</span>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setCapturing(item.kind)} style={{ flex: 1 }}>Scatta</button>
                  <label style={{ flex: 1, margin: 0 }}>Carica<input type="file" accept="image/*" onChange={(e) => item.kind === 'front' ? handleFileChange(e) : handleOptionalFile(item.kind, e.target.files?.[0])} /></label>
                </div>
                {!item.required && !item.file && <button type="button" onClick={() => setNotice(item.kind === 'back' ? 'Procedi senza foto del retro.' : 'Procedi senza pagina interna.')} style={{ marginTop: '0.5rem', padding: 0, background: 'transparent', color: '#555', textDecoration: 'underline' }}>{item.kind === 'back' ? 'Non ho la foto del retro' : 'Non ho la pagina interna'}</button>}
                {item.preview && <img src={item.preview} alt={item.label} style={{ display: 'block', maxWidth: '100%', maxHeight: '160px', marginTop: '0.6rem', borderRadius: '0.5rem' }} />}
              </div>
            ))}
            <button type="submit" disabled={!image || searching} style={{ width: '100%', marginTop: '0.5rem' }}>{searching ? 'Analisi in corso...' : 'Analizza libro'}</button>
          </div>
        )}

        {notice && <div style={{ background: '#e8f4fd', color: '#174a6e', padding: '0.75rem', borderRadius: '0.5rem', marginTop: '1rem' }}>{notice}</div>}
        {error && <div className="error">{error}</div>}
      </form>

      {searching && pendingSources.size > 0 && (
        <div style={{ marginTop: '1rem', color: '#666' }}>
          In attesa di: {[...pendingSources].map((s) => sourceLabels[s] || s).join(', ')}
        </div>
      )}

      {editing && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3>Conferma e modifica dati</h3>
          <div className="card" style={{ padding: '1rem' }}>
            {editing.candidate.covers?.[0] && (
              <img
                src={editing.candidate.covers[0]}
                alt="Copertina"
                style={{ maxWidth: '100px', maxHeight: '150px', objectFit: 'contain', marginBottom: '0.75rem' }}
              />
            )}
            <label>
              Titolo
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </label>
            <label>
              Sottotitolo
              <input value={editing.subtitle} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} />
            </label>
            <label>
              Autori (separati da virgola)
              <input value={editing.authors} onChange={(e) => setEditing({ ...editing, authors: e.target.value })} />
            </label>
            <label>
              Editore
              <input value={editing.publisher} onChange={(e) => setEditing({ ...editing, publisher: e.target.value })} />
            </label>
            <label>
              Anno di pubblicazione
              <input type="number" value={editing.year} onChange={(e) => setEditing({ ...editing, year: e.target.value })} />
            </label>
            <label>
              ISBN
              <input value={editing.isbn} onChange={(e) => setEditing({ ...editing, isbn: e.target.value })} />
            </label>
            <label>
              Pagine
              <input type="number" value={editing.pages} onChange={(e) => setEditing({ ...editing, pages: e.target.value })} />
            </label>
            {editing.candidate.source && (
              <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
                Fonte: {sourceLabels[editing.candidate.source] || editing.candidate.source}
              </p>
            )}
            {error && <div className="error">{error}</div>}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
              <button onClick={handleConfirmEditing} disabled={searching || !editing.title.trim()}>
                {searching ? 'Salvataggio...' : 'Salva edizione'}
              </button>
              <button type="button" onClick={() => setEditing(null)} style={{ background: '#ccc', color: '#333' }}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {!editing && sortedResults.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Risultati</h3>
          {sortedResults.map((candidate, idx) => (
            <CandidateCard
              key={`${candidate.source}-${candidate.external_id || candidate.isbn || candidate.title || ''}-${idx}`}
              candidate={candidate}
              onSelect={handleCandidateSelect}
            />
          ))}
        </div>
      )}

      {scanning && <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />}
      {capturing && <BookCameraCapture onCapture={handleCameraCapture} onClose={() => setCapturing(null)} />}
    </div>
  )
}

export default Scan
