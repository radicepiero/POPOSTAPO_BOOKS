export interface Contributor {
  name: string
  role?: string
}

export interface Candidate {
  source: 'google_books' | 'open_library' | 'postgresql' | 'openai_vision'
  record_type: 'volume' | 'edition'
  external_id?: string
  local_edition_id?: number

  title?: string
  subtitle?: string
  edition_name?: string[]

  authors?: string[]
  contributors?: Contributor[]
  translators?: string[]
  illustrators?: string[]
  editors?: string[]

  publishers?: string[]
  publisher?: string
  publish_date?: string
  year?: number
  publish_places?: string[]
  physical_format?: string
  print_type?: string

  isbn?: string
  isbn10?: string
  isbn13?: string
  issn?: string
  lccn?: string
  oclc?: string
  other_identifiers?: Record<string, string | string[]>

  pages?: number
  language?: string

  series?: string[]
  covers?: string[]
  images?: Record<string, string>
  thumbnail?: string
  preview_url?: string
  info_url?: string

  ebook_access?: string
  has_fulltext?: boolean
  average_rating?: number
  ratings_count?: number

  dimensions?: { height?: string; width?: string; thickness?: string }
  weight?: string
  warnings?: string[]

  raw?: any
}

function asString(value: any): string | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) return asString(value[0])
  if (typeof value === 'number') return String(value)
  return value
}

function toNumber(value: any): number | undefined {
  if (value === undefined || value === null) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function extractYear(publishDate: any): number | undefined {
  const raw = asString(publishDate)
  if (!raw) return undefined
  const match = raw.match(/\b(\d{4})\b/)
  return match ? Number(match[1]) : undefined
}

function ensureStringArray(value: any): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.map((v: any) => String(v ?? ''))
  return [String(value)]
}

function normalizeCoverUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  return url.replace(/^http:/, 'https:')
}

function collectGoogleCovers(imageLinks: Record<string, string> | undefined): string[] {
  if (!imageLinks) return []
  const covers: string[] = []
  for (const size of ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail']) {
    const url = imageLinks[size]
    if (url) covers.push(normalizeCoverUrl(url) as string)
  }
  return covers
}

function parseIsbns(values: string[]): { isbn?: string; isbn10?: string; isbn13?: string } {
  if (!values || values.length === 0) return {}
  const cleaned = values.map((value) => value?.replace(/-/g, '')).filter(Boolean)
  const isbn13 = cleaned.find((value) => value.length === 13)
  const isbn10 = cleaned.find((value) => value.length === 10)
  return {
    isbn: isbn13 || isbn10,
    isbn13,
    isbn10,
  }
}

function mapIndustryIdentifiers(
  identifiers: { type?: string; identifier?: string }[] | undefined,
): { mapped: Record<string, string>; isbn10?: string; isbn13?: string } {
  const mapped: Record<string, string> = {}
  let isbn10: string | undefined
  let isbn13: string | undefined
  for (const ident of identifiers || []) {
    if (!ident?.type) continue
    mapped[ident.type] = ident.identifier || ''
    if (ident.type === 'ISBN_13') isbn13 = ident.identifier
    else if (ident.type === 'ISBN_10') isbn10 = ident.identifier
  }
  return { mapped, isbn10, isbn13 }
}

function resolveLanguage(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return asString(value[0])
  return asString(value)
}

export function mapOpenLibrarySearchResponse(data: any): Candidate[] {
  const docs = data?.docs || []
  const candidates: Candidate[] = []
  for (const work of docs) {
    const editions = work?.editions?.docs || []
    for (const edition of editions) {
      const { isbn, isbn10, isbn13 } = parseIsbns(ensureStringArray(edition?.isbn))
      const coverId = edition?.cover_i
      const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined
      const language = resolveLanguage(edition?.language)
      const publishers = ensureStringArray(edition?.publisher)
      const publishPlaces = ensureStringArray(edition?.publish_place || edition?.publish_places)
      candidates.push({
        source: 'open_library',
        record_type: 'edition',
        external_id: asString(edition?.key),
        title: asString(edition?.title),
        subtitle: asString(edition?.subtitle),
        edition_name: ensureStringArray(edition?.edition_name),
        authors: ensureStringArray(edition?.author_name),
        publishers,
        publisher: publishers[0],
        publish_date: asString(edition?.publish_date),
        year: extractYear(edition?.publish_date),
        publish_places: publishPlaces,
        physical_format: asString(edition?.physical_format),
        isbn,
        isbn10,
        isbn13,
        pages: toNumber(edition?.number_of_pages),
        language,
        series: ensureStringArray(edition?.series),
        covers: coverUrl ? [coverUrl] : [],
        thumbnail: coverUrl,
        info_url: edition?.key ? `https://openlibrary.org${edition.key}` : undefined,
        ebook_access: asString(edition?.ebook_access),
        has_fulltext: Boolean(edition?.has_fulltext),
        raw: edition,
      })
    }
  }
  return candidates.slice(0, 10)
}

export function mapGoogleBooksResponse(data: any): Candidate[] {
  const items = data?.items || []
  const candidates: Candidate[] = []
  for (const item of items) {
    const volumeInfo = item?.volumeInfo || {}
    const { mapped: otherIds, isbn10: gIsbn10, isbn13: gIsbn13 } = mapIndustryIdentifiers(volumeInfo?.industryIdentifiers)
    const isbn = gIsbn13 || gIsbn10
    const covers = collectGoogleCovers(volumeInfo?.imageLinks)
    const thumbnail = normalizeCoverUrl(
      volumeInfo?.imageLinks?.thumbnail || volumeInfo?.imageLinks?.smallThumbnail,
    )
    const language = resolveLanguage(volumeInfo?.language)
    const publishers = ensureStringArray(volumeInfo?.publisher)
    candidates.push({
      source: 'google_books',
      record_type: 'volume',
      external_id: asString(item?.id),
      title: asString(volumeInfo?.title),
      subtitle: asString(volumeInfo?.subtitle),
      authors: ensureStringArray(volumeInfo?.authors),
      publishers,
      publisher: publishers[0],
      publish_date: asString(volumeInfo?.publishedDate),
      year: extractYear(volumeInfo?.publishedDate),
      print_type: asString(volumeInfo?.printType),
      isbn,
      isbn10: gIsbn10,
      isbn13: gIsbn13,
      other_identifiers: otherIds,
      pages: toNumber(volumeInfo?.pageCount),
      language,
      covers,
      thumbnail,
      preview_url: normalizeCoverUrl(volumeInfo?.previewLink),
      info_url: normalizeCoverUrl(volumeInfo?.canonicalVolumeLink || volumeInfo?.infoLink),
      average_rating: toNumber(volumeInfo?.averageRating),
      ratings_count: toNumber(volumeInfo?.ratingsCount),
      dimensions: volumeInfo?.dimensions,
      raw: item,
    })
  }
  const titlesByIsbn = new Map<string, Set<string>>()
  for (const candidate of candidates) {
    const identifier = candidate.isbn13 || candidate.isbn10
    const title = candidate.title?.trim().toLocaleLowerCase()
    if (!identifier || !title) continue
    const titles = titlesByIsbn.get(identifier) || new Set<string>()
    titles.add(title)
    titlesByIsbn.set(identifier, titles)
  }
  for (const candidate of candidates) {
    const identifier = candidate.isbn13 || candidate.isbn10
    if (identifier && (titlesByIsbn.get(identifier)?.size || 0) > 1) {
      candidate.warnings = ['Google Books associa questo ISBN a titoli diversi: verifica il libro prima di selezionarlo.']
    }
  }
  return candidates.slice(0, 10)
}

export function mapOpenAIVisionResponse(data: any): Candidate {
  const authors = ensureStringArray(data?.authors)
  const contributors: Contributor[] = (data?.contributors || [])
    .map((c: any) => ({
      name: c?.name ? String(c.name) : '',
      role: c?.role ? String(c.role) : undefined,
    }))
    .filter((c: Contributor) => c.name)
  const rawIsbn = asString(data?.isbn)?.replace(/[-\s]/g, '')
  let isbn10: string | undefined
  let isbn13: string | undefined
  if (rawIsbn) {
    if (rawIsbn.length === 13 && /^97[89]\d{10}$/.test(rawIsbn)) {
      isbn13 = rawIsbn
    } else if (/^\d{9}[\dX]$/i.test(rawIsbn)) {
      isbn10 = rawIsbn.toUpperCase()
    }
  }
  return {
    source: 'openai_vision',
    record_type: 'edition',
    title: asString(data?.title),
    subtitle: asString(data?.subtitle),
    authors,
    contributors,
    publisher: asString(data?.publisher),
    year: toNumber(data?.year),
    isbn: isbn13 || isbn10,
    isbn10,
    isbn13,
    language: asString(data?.language),
    series: data?.series ? [String(data.series)] : undefined,
    pages: toNumber(data?.pages),
    covers: ensureStringArray(data?.covers),
    images: data?.images || undefined,
    raw: data,
  }
}
