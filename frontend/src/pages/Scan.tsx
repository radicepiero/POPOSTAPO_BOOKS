import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import BarcodeScanner from '../components/BarcodeScanner'
import BookCameraCapture from '../components/BookCameraCapture'
import EditionCard from '../components/EditionCard'
import ImageCropper from '../components/ImageCropper'
import {
  Candidate,
  mapGoogleBooksResponse,
  mapOpenLibrarySearchResponse,
  mapOpenAIVisionResponse,
} from '../services/bibliographicMappers'
import { formLabels, imageRoleLabels, scanLabels, sourceLabels } from '../utils/labels'

type ImageKind = 'front' | 'back' | 'copyright' | 'spine'

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
  const [copyrightPages, setCopyrightPages] = useState<{ file: File; preview: string }[]>([])
  const [spineImage, setSpineImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [backPreview, setBackPreview] = useState<string | null>(null)
  const [spinePreview, setSpinePreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [capturing, setCapturing] = useState<ImageKind | null>(null)
  const [cropImage, setCropImage] = useState<{ kind: ImageKind; src: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [pendingSources, setPendingSources] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Candidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditForm | null>(null)
  const navigate = useNavigate()
  const abortControllerRef = useRef<AbortController | null>(null)
  const pendingFileRef = useRef<{ kind: ImageKind; file: File } | null>(null)

  const setImageForKind = (kind: ImageKind, file: File) => {
    const url = URL.createObjectURL(file)
    if (kind === 'front') {
      setImage(file)
      setPreview(url)
    } else if (kind === 'back') {
      setBackImage(file)
      setBackPreview(url)
    } else if (kind === 'copyright') {
      setCopyrightPages((current) => [...current, { file, preview: url }])
    } else if (kind === 'spine') {
      setSpineImage(file)
      setSpinePreview(url)
    }
  }

  const openCropper = (kind: ImageKind, file: File) => {
    pendingFileRef.current = { kind, file }
    setCropImage({ kind, src: URL.createObjectURL(file) })
  }

  const handleCropDone = (file: File) => {
    if (!cropImage) return
    setImageForKind(cropImage.kind, file)
    setCropImage(null)
    pendingFileRef.current = null
  }

  const handleCropCancel = () => {
    if (!cropImage) return
    const pending = pendingFileRef.current
    if (pending && pending.kind === cropImage.kind) {
      setImageForKind(pending.kind, pending.file)
    }
    setCropImage(null)
    pendingFileRef.current = null
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    openCropper('front', file)
  }

  const handleOptionalFile = (kind: Exclude<ImageKind, 'front'>, file?: File) => {
    if (!file) return
    openCropper(kind, file)
  }

  const handleCameraCapture = (file: File) => {
    setImageForKind(capturing || 'front', file)
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
      copyrightPages.forEach((cp) => form.append('copyright_pages', cp.file))
      if (spineImage) form.append('spine_image', spineImage)
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
      <h2>{scanLabels.title}</h2>
      <form onSubmit={handleSubmit}>
        {/* --- Simple search (single field) --- */}
        {!showAdvanced && !showCamera && (
          <>
            <label htmlFor="isbn-search" style={{ fontWeight: 600 }}>ISBN</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: '0.5rem', alignItems: 'stretch' }}>
              <input id="isbn-search" type="text" inputMode="numeric" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={scanLabels.isbnPlaceholder} style={{ margin: 0 }} />
              <button type="button" onClick={() => setScanning(true)} aria-label={scanLabels.scanner} title={scanLabels.scanner} style={{ padding: '0.65rem 0.8rem' }}>{scanLabels.scanner}</button>
              <button type="submit" disabled={searching} style={{ padding: '0.65rem 0.9rem' }}>{searching ? '...' : scanLabels.search}</button>
            </div>
            <button type="button" onClick={() => setShowAdvanced(true)} style={{ display: 'block', marginTop: '0.75rem', padding: 0, background: 'transparent', color: '#555', fontSize: '0.85rem' }}>{scanLabels.titleAuthorSearch}</button>
          </>
        )}

        {/* --- Advanced search (separate fields) --- */}
        {showAdvanced && !showCamera && (
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Ricerca per dati bibliografici</strong><button type="button" onClick={() => setShowAdvanced(false)} style={{ background: 'transparent', color: '#555' }}>Chiudi</button></div>
            <label>ISBN<input type="text" value={isbn} onChange={(e) => setIsbn(e.target.value)} /></label>
            <label>{formLabels.title}<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label>{formLabels.author}<input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
            <button type="submit" disabled={searching} style={{ width: '100%' }}>{searching ? 'Ricerca in corso...' : scanLabels.search}</button>
            <button type="button" onClick={() => setShowCamera(true)} style={{ display: 'block', marginTop: '0.75rem', padding: 0, background: 'transparent', color: '#1769aa', textDecoration: 'underline' }}>{scanLabels.imageSearch}</button>
          </div>
        )}

        {/* --- Camera tools (collapsed) --- */}
        {showCamera && (
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}><strong>Identifica il libro dalle foto</strong><button type="button" onClick={() => setShowCamera(false)} style={{ background: 'transparent', color: '#555' }}>Indietro</button></div>
            <p style={{ color: '#666', marginTop: 0 }}>{scanLabels.coverHint}</p>
            {[
              { kind: 'front' as const, label: imageRoleLabels['front cover'], required: true, file: image, preview },
              { kind: 'back' as const, label: imageRoleLabels['back cover'], required: false, file: backImage, preview: backPreview },
              { kind: 'spine' as const, label: imageRoleLabels['spine'], required: false, file: spineImage, preview: spinePreview },
            ].map((item) => (
              <div key={item.kind} style={{ borderTop: '1px solid #ddd', padding: '0.9rem 0' }}>
                <strong>{item.label}</strong><span style={{ color: '#777', fontSize: '0.8rem' }}> · {item.required ? 'obbligatoria' : 'opzionale'}</span>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setCapturing(item.kind)} style={{ flex: 1 }}>Scatta</button>
                  <label style={{ flex: 1, margin: 0 }}>Carica<input type="file" accept="image/*" onChange={(e) => item.kind === 'front' ? handleFileChange(e) : handleOptionalFile(item.kind, e.target.files?.[0])} /></label>
                </div>
                {!item.required && !item.file && (
                  <button
                    type="button"
                    onClick={() => {
                      const messages: Record<typeof item.kind, string> = {
                        back: scanLabels.proceedBack,
                        spine: scanLabels.proceedSpine,
                        front: '',
                      }
                      setNotice(messages[item.kind])
                    }}
                    style={{ marginTop: '0.5rem', padding: 0, background: 'transparent', color: '#555', textDecoration: 'underline' }}
                  >
                    {(() => {
                      const labels: Record<typeof item.kind, string> = {
                        back: scanLabels.skipBack,
                        spine: scanLabels.skipSpine,
                        front: '',
                      }
                      return labels[item.kind]
                    })()}
                  </button>
                )}
                {item.preview && <img src={item.preview} alt={item.label} style={{ display: 'block', maxWidth: '100%', maxHeight: '160px', marginTop: '0.6rem', borderRadius: '0.5rem' }} />}
              </div>
            ))}
            <div style={{ borderTop: '1px solid #ddd', padding: '0.9rem 0' }}>
              <strong>{imageRoleLabels['copyright or title page']}</strong><span style={{ color: '#777', fontSize: '0.8rem' }}> · opzionale, più pagine</span>
              {copyrightPages.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.5rem 0' }}>
                  {copyrightPages.map((cp, index) => (
                    <div key={index} style={{ position: 'relative' }}>
                      <img src={cp.preview} alt={`Pagina dati editoriali ${index + 1}`} style={{ width: '60px', height: '80px', objectFit: 'cover', borderRadius: '0.4rem' }} />
                      <button
                        type="button"
                        onClick={() => setCopyrightPages((current) => current.filter((_, i) => i !== index))}
                        style={{ position: 'absolute', top: '-0.3rem', right: '-0.3rem', width: '1.2rem', height: '1.2rem', padding: 0, borderRadius: '50%', background: '#b00020', color: '#fff', fontSize: '0.7rem', lineHeight: 1 }}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setCapturing('copyright')} style={{ flex: 1 }}>Scatta</button>
                <label style={{ flex: 1, margin: 0 }}>Carica<input type="file" accept="image/*" onChange={(e) => handleOptionalFile('copyright', e.target.files?.[0])} /></label>
              </div>
              <button
                type="button"
                onClick={() => setNotice(scanLabels.proceedCopyright)}
                style={{ marginTop: '0.5rem', padding: 0, background: 'transparent', color: '#555', textDecoration: 'underline' }}
              >
                {scanLabels.skipCopyright}
              </button>
            </div>
            <button type="submit" disabled={!image || searching} style={{ width: '100%', marginTop: '0.5rem' }}>{searching ? 'Analisi in corso...' : scanLabels.analyze}</button>
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
          <h3>{scanLabels.results}</h3>
          {sortedResults.map((candidate, idx) => (
            <EditionCard
              key={`${candidate.source}-${candidate.external_id || candidate.isbn || candidate.title || ''}-${idx}`}
              candidate={candidate}
              onUse={() => handleCandidateSelect(candidate)}
            />
          ))}
        </div>
      )}

      {cropImage && (
        <ImageCropper
          imageSrc={cropImage.src}
          onCropDone={handleCropDone}
          onCancel={handleCropCancel}
        />
      )}
      {scanning && <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />}
      {capturing && <BookCameraCapture onCapture={handleCameraCapture} onClose={() => setCapturing(null)} />}
    </div>
  )
}

export default Scan
