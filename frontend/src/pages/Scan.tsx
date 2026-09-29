import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import BarcodeScanner from '../components/BarcodeScanner'
import EditionImagesEditor, { EditionImageFiles, emptyFiles } from '../components/EditionImagesEditor'
import EntityBadge from '../components/EntityBadge'
import ImageLightbox from '../components/ImageLightbox'
import SpeechInput from '../components/SpeechInput'
import {
  Candidate,
  mapGoogleBooksResponse,
  mapOpenLibrarySearchResponse,
  mapOpenAIVisionResponse,
} from '../services/bibliographicMappers'
import { Icon } from '../utils/icons'
import { buttonLabels, formLabels, scanLabels, sourceLabels } from '../utils/labels'

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

function candidateScore(c: Candidate, isbnQuery?: string): number {
  let score = 0
  if (c.source === 'postgresql') score += 50
  if (c.source === 'openai_vision') score += 12
  if (c.title) score += 10
  if (c.authors?.length) score += 10
  if (c.publisher) score += 8
  if (c.isbn || c.isbn13 || c.isbn10) score += 8
  if (c.year) score += 5
  if (c.pages) score += 3
  if (c.covers?.length) score += 5
  if (c.language) score += 2
  if (isbnQuery) {
    const matches = [c.isbn, c.isbn13, c.isbn10]
      .filter(Boolean)
      .some((value) => canonicalIsbn(value!) === isbnQuery)
    if (matches) score += 30
  }
  return score
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function editionKey(c: Candidate): string {
  const isbn = c.isbn13 || c.isbn || c.isbn10
  if (isbn) return `isbn:${canonicalIsbn(isbn)}`
  const title = normalizeText(c.title || '')
  const authors = normalizeText([...(c.authors || [])].sort().join(' '))
  const publisher = normalizeText(c.publisher || c.publishers?.[0] || '')
  const language = normalizeText(c.language || '')
  return `fuzzy:${title}|${authors}|${publisher}|${language}`
}

function variantDistinctiveness(c: Candidate): number {
  let count = 0
  if (c.year) count++
  if (c.pages) count++
  if (c.physical_format) count++
  if (c.series?.length) count++
  if (c.edition_name?.length) count++
  if (c.publish_date && String(c.publish_date) !== String(c.year)) count++
  if (c.dimensions?.height || c.dimensions?.width || c.dimensions?.thickness) count++
  if (c.weight) count++
  if (c.covers?.length) count++
  return count
}

interface VariantInfo {
  candidate: Candidate
  distinctiveness: number
}

interface EditionGroup {
  key: string
  title: string
  subtitle?: string
  authors: string[]
  publisher?: string
  isbn?: string
  language?: string
  variants: VariantInfo[]
}

function expandCandidateVariants(candidate: Candidate): Candidate[] {
  if (!candidate.variants || candidate.variants.length === 0) return [candidate]
  return candidate.variants.map((variant) => ({
    ...candidate,
    variants: undefined,
    default_variant_id: variant.id,
    year: variant.printing_year ?? candidate.year,
    pages: variant.pages ?? candidate.pages,
    physical_format: variant.binding ?? candidate.physical_format,
    covers: variant.covers ?? candidate.covers,
    images: variant.images ?? candidate.images,
    series: variant.series ? [variant.series] : candidate.series,
    dimensions: variant.height_mm || variant.width_mm || variant.thickness_mm
      ? {
          height: variant.height_mm ? `${variant.height_mm} mm` : candidate.dimensions?.height,
          width: variant.width_mm ? `${variant.width_mm} mm` : candidate.dimensions?.width,
          thickness: variant.thickness_mm ? `${variant.thickness_mm} mm` : candidate.dimensions?.thickness,
        }
      : candidate.dimensions,
    weight: variant.weight_g ? `${variant.weight_g} g` : candidate.weight,
  }))
}

function groupCandidates(candidates: Candidate[]): EditionGroup[] {
  const groups = new Map<string, EditionGroup>()
  const order: string[] = []
  for (const candidate of candidates) {
    for (const variantCandidate of expandCandidateVariants(candidate)) {
      const key = editionKey(variantCandidate)
      if (!groups.has(key)) {
        order.push(key)
        groups.set(key, {
          key,
          title: variantCandidate.title || 'Titolo sconosciuto',
          subtitle: variantCandidate.subtitle,
          authors: variantCandidate.authors || [],
          publisher: variantCandidate.publisher || variantCandidate.publishers?.[0],
          isbn: variantCandidate.isbn13 || variantCandidate.isbn || variantCandidate.isbn10,
          language: variantCandidate.language,
          variants: [],
        })
      }
      const group = groups.get(key)!
      group.variants.push({ candidate: variantCandidate, distinctiveness: variantDistinctiveness(variantCandidate) })
    }
  }
  return order
    .map((key) => groups.get(key)!)
    .map((group) => ({
      ...group,
      variants: [...group.variants].sort((a, b) => a.distinctiveness - b.distinctiveness),
    }))
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
  const [imageFiles, setImageFiles] = useState<EditionImageFiles>(emptyFiles)
  const [scanning, setScanning] = useState(false)
  const [searching, setSearching] = useState(false)
  const [pendingSources, setPendingSources] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Candidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditForm | null>(null)
  const [showConfirmationImages, setShowConfirmationImages] = useState(false)
  const [searchCompleted, setSearchCompleted] = useState(false)
  const [failedSources, setFailedSources] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<{ open: boolean; src: string; alt: string }>({ open: false, src: '', alt: '' })
  const openLightbox = (src: string, alt: string) => setLightbox({ open: true, src, alt })
  const closeLightbox = () => setLightbox({ open: false, src: '', alt: '' })
  const navigate = useNavigate()
  const abortControllerRef = useRef<AbortController | null>(null)

  const clearSearch = () => {
    setResults([])
    setPendingSources(new Set())
    setFailedSources(new Set())
    setSearchCompleted(false)
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

    const markDone = (source: string, err?: any) => {
      setPendingSources((prev) => {
        const next = new Set(prev)
        next.delete(source)
        return next
      })
      if (err) {
        setFailedSources((prev) => {
          const next = new Set(prev)
          next.add(source)
          return next
        })
      }
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
        .catch((err) => markDone('local', err))
        .then(() => {
          setResults((prev) => {
            if (prev.length > 0) {
              setSearching(false)
              setSearchCompleted(true)
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
              .catch((err) => markDone('local_ft', err))
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
          .catch((err) => markDone('local', err))
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
          .catch((err) => markDone('local', err))
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
    markDone: (s: string, err?: any) => void,
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
      .catch((err) => markDone('openlibrary', err))

    const googleReq = client
      .get('/editions/search/google', { params, signal: controller.signal })
      .then(({ data }) => {
        addResults(mapGoogleBooksResponse(data))
        markDone('google')
      })
      .catch((err) => markDone('google', err))

    Promise.allSettled([openlibraryReq, googleReq]).finally(() => {
      setSearching(false)
      setSearchCompleted(true)
    })
  }

  const uploadImageSearch = async () => {
    if (!imageFiles.front) return
    setSearching(true)
    setError(null)
    setNotice(null)
    let launchedTextSearch = false
    try {
      const form = new FormData()
      form.append('image', imageFiles.front)
      if (imageFiles.back) form.append('back_image', imageFiles.back)
      imageFiles.copyright.forEach((file) => form.append('copyright_pages', file))
      if (imageFiles.spine) form.append('spine_image', imageFiles.spine)
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
    if (imageFiles.front) {
      await uploadImageSearch()
      return
    }
    if (showAdvanced) {
      // Advanced mode: use separate fields
      runTextSearch({ isbn: isbn.trim(), title: title.trim(), author: author.trim() })
    } else {
      const q = query.trim()
      const clean = q.replace(/[\s-]/g, '').toUpperCase()
      if (looksLikeIsbn(clean)) {
        runTextSearch({ isbn: clean })
      } else {
        if (q) setTitle(q)
        setError(null)
        setShowAdvanced(true)
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
      const variantParam = candidate.default_variant_id ? `?variant_id=${candidate.default_variant_id}` : ''
      navigate(`/editions/${candidate.local_edition_id}${variantParam}`)
      return
    }
    setShowCamera(false)
    setShowConfirmationImages(false)
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

  const uploadConfirmedImages = async (editionId: number) => {
    const { data } = await client.get(`/editions/${editionId}/variants`)
    const variants = Array.isArray(data) ? data : []
    const variant = variants.find((item: any) => item.is_default) || variants[0]
    if (!variant) return
    const upload = async (file: File, kind: string, position = 0) => {
      const form = new FormData()
      form.append('image', file)
      form.append('kind', kind)
      form.append('position', String(position))
      form.append('is_primary', String(kind === 'front'))
      await client.post(`/variants/${variant.id}/images`, form)
    }
    if (imageFiles.front) await upload(imageFiles.front, 'front')
    if (imageFiles.back) await upload(imageFiles.back, 'back')
    if (imageFiles.spine) await upload(imageFiles.spine, 'spine')
    for (const [index, file] of imageFiles.copyright.entries()) await upload(file, 'copyright', index)
  }

  const handleConfirmEditing = async () => {
    if (!editing) return
    setSearching(true)
    setError(null)
    try {
      const { raw, images, variants, ...base } = editing.candidate
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
      await uploadConfirmedImages(resp.data.edition_id)
      setEditing(null)
      navigate(`/editions/${resp.data.edition_id}`)
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Errore conferma edizione'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setSearching(false)
    }
  }

  const isbnQuery = (() => {
    const raw = showAdvanced ? isbn : query
    const clean = raw.trim().replace(/[\s-]/g, '').toUpperCase()
    return looksLikeIsbn(clean) ? canonicalIsbn(clean) : undefined
  })()
  const sortedResults = [...results].sort((a, b) => candidateScore(b, isbnQuery) - candidateScore(a, isbnQuery))
  const groups = groupCandidates(sortedResults)

  return (
    <div>
      <h2>{scanLabels.title}</h2>
      <form onSubmit={handleSubmit}>
        {/* --- Simple search (single field) --- */}
        {!editing && !showAdvanced && !showCamera && (
          <>
            <label htmlFor="isbn-search" style={{ fontWeight: 600 }}>ISBN</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: '0.5rem', alignItems: 'stretch' }}>
              <input id="isbn-search" type="text" inputMode="numeric" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={scanLabels.isbnPlaceholder} style={{ margin: 0 }} />
              <button type="button" onClick={() => setScanning(true)} aria-label={scanLabels.scanner} title={scanLabels.scanner} style={{ padding: '0.65rem 0.8rem' }}><Icon name="scan" size={18} /></button>
              <button type="button" onClick={() => setShowCamera(true)} aria-label={scanLabels.imageSearch} title={scanLabels.imageSearch} style={{ padding: '0.65rem 0.8rem' }}><Icon name="camera" size={18} /></button>
              <button type="submit" disabled={searching} aria-label={scanLabels.search} title={scanLabels.search} style={{ padding: '0.65rem 0.9rem' }}>{searching ? '...' : <Icon name="search" size={18} />}</button>
            </div>
          </>
        )}

        {/* --- Advanced search (separate fields) --- */}
        {!editing && showAdvanced && !showCamera && (
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Ricerca per dati bibliografici</strong><button type="button" onClick={() => setShowAdvanced(false)} style={{ background: 'transparent', color: '#555' }}>Chiudi</button></div>
            <label>ISBN<input type="text" value={isbn} onChange={(e) => setIsbn(e.target.value)} /></label>
            <label style={{ display: 'block' }}>{formLabels.title}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, margin: 0 }} />
                <SpeechInput onTranscript={(text) => setTitle((current) => current ? `${current} ${text}` : text)} />
              </div>
            </label>
            <label style={{ display: 'block' }}>{formLabels.author}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} style={{ flex: 1, margin: 0 }} />
                <SpeechInput onTranscript={(text) => setAuthor((current) => current ? `${current} ${text}` : text)} />
              </div>
            </label>
            <button type="submit" disabled={searching} aria-label={scanLabels.search} title={scanLabels.search} style={{ width: '100%', display: 'inline-flex', justifyContent: 'center' }}>{searching ? 'Ricerca in corso...' : <Icon name="search" size={18} />}</button>
            <button type="button" onClick={() => setShowCamera(true)} style={{ display: 'block', marginTop: '0.75rem', padding: 0, background: 'transparent', color: '#1769aa', textDecoration: 'underline' }}>{scanLabels.imageSearch}</button>
          </div>
        )}

        {/* --- Camera tools (collapsed) --- */}
        {!editing && showCamera && (
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}><strong>Identifica il libro dalle foto</strong><button type="button" onClick={() => setShowCamera(false)} style={{ background: 'transparent', color: '#555' }}>Indietro</button></div>
            <p style={{ color: '#666', marginTop: 0 }}>{scanLabels.coverHint}</p>
            <EditionImagesEditor onChange={setImageFiles} requireFront />
            <button type="submit" disabled={!imageFiles.front || searching} aria-label={scanLabels.analyze} title={scanLabels.analyze} style={{ width: '100%', marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {searching ? 'Analisi in corso...' : <Icon name="search" size={18} />}
            </button>
          </div>
        )}

        {notice && <div style={{ background: '#e8f4fd', color: '#174a6e', padding: '0.75rem', borderRadius: '0.5rem', marginTop: '1rem' }}>{notice}</div>}
        {error && <div className="error">{error}</div>}
      </form>

      {searching && (
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666' }}>
          <Icon name="loading" size={18} className="spinner" />
          <span>
            {pendingSources.size > 0
              ? `Ricerca in corso… in attesa di: ${[...pendingSources].map((s) => sourceLabels[s] || s).join(', ')}`
              : 'Ricerca in corso…'}
          </span>
        </div>
      )}

      {!editing && searchCompleted && sortedResults.length === 0 && !error && !searching && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ color: '#666' }}>Nessun risultato trovato.</p>
          {failedSources.size > 0 && (
            <p style={{ color: '#b00020', fontSize: '0.85rem' }}>
              Alcune fonti non hanno risposto: {[...failedSources].map((s) => sourceLabels[s] || s).join(', ')}. Riprova.
            </p>
          )}
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
            <button
              type="button"
              onClick={() => setShowConfirmationImages((current) => !current)}
              style={{ width: '100%', marginTop: '0.75rem' }}
            >
              {showConfirmationImages ? 'Nascondi immagini' : 'Immagini'}
            </button>
            {showConfirmationImages && <EditionImagesEditor initialFiles={imageFiles} onChange={setImageFiles} />}
            {editing.candidate.source && (
              <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
                Fonte: {sourceLabels[editing.candidate.source] || editing.candidate.source}
              </p>
            )}
            {error && <div className="error">{error}</div>}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
              <button onClick={handleConfirmEditing} disabled={searching || !editing.title.trim()} aria-label="Salva edizione" title="Salva edizione" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                <Icon name="save" size={16} />{searching ? 'Salvataggio...' : ''}
              </button>
              <button type="button" onClick={() => setEditing(null)} style={{ background: '#ccc', color: '#333' }}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {!editing && groups.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h3>{scanLabels.results}</h3>
          {groups.map((group) => (
            <div key={group.key} className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
              <div style={{ marginBottom: '0.75rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <EntityBadge type="edition" size="1.25rem" />
                  <strong style={{ fontSize: '1.1rem' }}>{group.title}</strong>
                </div>
                {group.subtitle && <p style={{ margin: '0.25rem 0', color: '#555' }}>{group.subtitle}</p>}
                <p style={{ margin: '0.25rem 0', color: '#666', fontSize: '0.9rem' }}>
                  {group.authors.join(', ') || 'Autore sconosciuto'}
                  {group.publisher && ` · ${group.publisher}`}
                  {group.isbn && ` · ${group.isbn}`}
                  {group.language && ` · ${group.language}`}
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {group.variants.map(({ candidate }) => (
                  <div
                    key={`${candidate.source}-${candidate.external_id || candidate.isbn || candidate.title || ''}-${candidate.year ?? ''}`}
                    style={{
                      flex: '1 1 160px',
                      minWidth: '140px',
                      maxWidth: '220px',
                      border: candidate.source === 'openai_vision' ? '2px solid #1769aa' : '1px solid #ddd',
                      borderRadius: '0.4rem',
                      padding: '0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      background: candidate.source === 'openai_vision' ? '#eef7ff' : '#fff',
                    }}
                  >
                    {candidate.source === 'openai_vision' && (
                      <strong style={{ display: 'block', color: '#1769aa', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                        Proposta POPOSTAPO
                      </strong>
                    )}
                    {candidate.covers?.[0] ? (
                      <img
                        src={candidate.covers[0]}
                        alt="Copertina"
                        onDoubleClick={() => openLightbox(candidate.covers![0], candidate.title || 'Copertina')}
                        style={{ width: '100%', height: '140px', objectFit: 'contain', borderRadius: '0.3rem', marginBottom: '0.5rem', cursor: 'pointer' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', color: '#888', borderRadius: '0.3rem', marginBottom: '0.5rem' }}>
                        {scanLabels.noCover}
                      </div>
                    )}
                    <div style={{ flex: 1, fontSize: '0.85rem', color: '#555' }}>
                      {candidate.year && <p style={{ margin: '0.15rem 0' }}><strong>Anno:</strong> {candidate.year}</p>}
                      {candidate.pages && <p style={{ margin: '0.15rem 0' }}><strong>Pagine:</strong> {candidate.pages}</p>}
                      {candidate.physical_format && <p style={{ margin: '0.15rem 0' }}><strong>Formato:</strong> {candidate.physical_format}</p>}
                      {candidate.series?.length ? <p style={{ margin: '0.15rem 0' }}><strong>Collana:</strong> {candidate.series.join(', ')}</p> : null}
                      <p style={{ margin: '0.15rem 0', color: '#888', fontSize: '0.75rem' }}>{sourceLabels[candidate.source] || candidate.source}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCandidateSelect(candidate)}
                      aria-label={buttonLabels.useThis}
                      title={buttonLabels.useThis}
                      style={{ width: '100%', marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Icon name="useThis" size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox.open && <ImageLightbox open={lightbox.open} images={[{ src: lightbox.src, alt: lightbox.alt }]} onClose={closeLightbox} />}
      {scanning && <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />}
    </div>
  )
}

export default Scan
