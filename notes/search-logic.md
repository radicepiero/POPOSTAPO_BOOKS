# Logica di ricerca edizioni

Documento che descrive il funzionamento della ricerca bibliografica implementata in `Scan.tsx` (frontend) e `enrichment.py` (backend).

## Fonti interrogate

| Fonte | Tipo | Dove gira |
|---|---|---|
| **Catalogo locale** (PostgreSQL) | Full-text su `editions` | Backend (`/api/editions/search/local`) |
| **Open Library** | API pubblica | Direttamente dal browser (`fetch`) |
| **Google Books** | API con chiave | Proxy backend (`/api/editions/search/google`) |

## Flusso di ricerca

### Caso 1: ISBN valido nel campo ISBN

Un ISBN e considerato valido se supera la verifica checksum ISBN-13 (`97[89]` + 10 cifre + check) o ISBN-10 (9 cifre + check modulo 11).

```
1. Ricerca esatta ISBN nel DB locale (isbn13 / isbn10)
2. Se trovato → STOP, mostra solo il risultato locale
3. Se non trovato → lancia in parallelo:
   a. Full-text locale (usando l'ISBN come testo, fallback)
   b. Open Library (q = isbn)
   c. Google Books (q = isbn:xxxx)
```

Razionale: se l'edizione e gia nel catalogo, non serve interrogare le API esterne.

### Caso 2: testo libero (titolo, autore, o testo nel campo ISBN)

Se il campo ISBN contiene testo che non e un ISBN valido (es. "simenon"), viene trattato come testo di ricerca e concatenato con gli altri campi.

```
1. Tutti i campi (ISBN + Titolo + Autore) vengono concatenati in una stringa unica
2. Lancia in parallelo:
   a. Full-text locale con la stringa combinata
   b. Open Library (q = "titolo author:autore" oppure solo testo)
   c. Google Books (q = intitle:titolo inauthor:autore)
```

## Ricerca locale (PostgreSQL)

### Full-text search

Implementata in `backend/services/enrichment.py` → `lookup_local_editions()`.

Con ISBN: ricerca esatta su `editions.isbn13` / `editions.isbn10`.

Senza ISBN: full-text search sulla colonna **stored** `editions.search_vector` (tipo `TSVECTOR`) con `plainto_tsquery` usando la configurazione `'simple'` (no stemming linguistico, adatto a catalogo multilingua).

#### Contenuto del search_vector

La colonna `search_vector` e popolata da un trigger PostgreSQL (`trg_edition_search_vector`) e include dati da piu fonti con pesi diversi:

| Peso | Contenuto | Fonte |
|------|-----------|-------|
| **A** | Titolo edizione | `editions.title` |
| **A** | Autori (colonna ibrida) | `editions.authors TEXT[]` |
| **A** | Autori relazionali dell'opera | `editions_works → works_authors → authors` (solo ruoli author/co_author) |
| **B** | Sottotitolo | `editions.subtitle` |
| **B** | Contributori edizione | `editions_authors → authors` (traduttori, curatori, ecc.) |
| **C** | Editore | `publishers.name` (via `editions.publisher_id`) |
| **D** | Collana | `series.name` (via `editions.series_id`) |
| - | ISBN | `editions.isbn13`, `editions.isbn10` |

I pesi influenzano il ranking: una corrispondenza sul titolo/autore (A) pesa piu di una sul nome dell'editore (C).

#### Aggiornamento automatico

Il `search_vector` viene aggiornato automaticamente da trigger PostgreSQL:

1. **`trg_editions_search_vector`** (BEFORE INSERT/UPDATE su `editions`) — ricalcola il vettore completo.
2. **`trg_editions_works_search`** (AFTER INSERT/UPDATE/DELETE su `editions_works`) — aggiorna il vettore quando cambia il link edition↔work.
3. **`trg_editions_authors_search`** (AFTER INSERT/UPDATE/DELETE su `editions_authors`) — aggiorna il vettore quando cambiano i contributori.

La colonna e indicizzata con un **indice GIN** (`idx_editions_search_vector`) per ricerche veloci.

I risultati sono ordinati per **rilevanza** (`ts_rank`).

Se il full-text non produce risultati (es. parole troppo corte), scatta un **fallback** con `ILIKE` su titolo, colonna ibrida authors, e nomi autore relazionali.

### Riferimento codice

- [backend/services/enrichment.py](../backend/services/enrichment.py) → `lookup_local_editions()`
- [backend/db/schema.sql](../backend/db/schema.sql) → `edition_search_vector()`, `trg_edition_search_vector()`, trigger definitions

## Query alle API esterne

### Open Library

```
GET https://openlibrary.org/search.json?q=...&fields=...&limit=10
```

- Con ISBN: `q = isbn`
- Con titolo + autore: `q = "titolo author:autore"`
- Con solo titolo: `q = "titolo"`
- Con solo autore: `q = "author:autore"`

Cerca **works** e restituisce le edizioni annidate. Il prefisso `author:` restringe al campo autore.

Campi richiesti per le edizioni: `key, title, subtitle, publisher, publish_date, number_of_pages, isbn, cover_i, author_name`.

La chiamata viene fatta **direttamente dal browser** (no proxy backend) perche Open Library non richiede credenziali e supporta CORS.

### Google Books

```
GET https://www.googleapis.com/books/v1/volumes?q=...&maxResults=10
```

- Con ISBN: `q = isbn:xxxx`
- Con titolo + autore: `q = intitle:titolo inauthor:autore`
- Con solo titolo: `q = intitle:titolo`
- Con solo autore: `q = inauthor:autore`

Cerca **volumes** (edizioni). Usa prefissi specifici per campo.

La chiamata passa dal **proxy backend** (`/api/editions/search/google`) per proteggere la `GOOGLE_BOOKS_API_KEY` e evitare problemi CORS.

### Riferimento codice

- [frontend/src/pages/Scan.tsx](../frontend/src/pages/Scan.tsx) → `runTextSearch()`, `launchExternalSearches()`
- [backend/routers/editions.py](../backend/routers/editions.py) → `search_google_proxy()`, `search_openlibrary_proxy()`

## Deduplicazione candidati

Implementata nel frontend in `Scan.tsx` → `dedup()`.

Ogni candidato in arrivo viene scartato se:

1. **Ha un ISBN gia visto** (confronto su `isbn`, `isbn10`, `isbn13`).
2. **Ha la stessa chiave di un candidato esistente**: la chiave e composta da `title + publisher + year + pages` (lowercase, trimmed).

La deduplicazione avviene progressivamente man mano che i risultati arrivano dalle diverse fonti.

## Ordinamento per pertinenza

I candidati di tutte le fonti vengono mescolati in una **lista unica** ordinata per score di completezza:

| Criterio | Punti |
|---|---|
| Fonte locale (PostgreSQL) | +10 |
| Ha titolo | +10 |
| Ha autori | +10 |
| Ha editore | +8 |
| Ha ISBN | +8 |
| Ha anno | +5 |
| Ha copertina | +5 |
| Ha pagine | +3 |
| Ha lingua | +2 |

I candidati locali hanno un piccolo bonus (+10) a parita di completezza, ma un candidato API con piu dati puo salire sopra un locale incompleto.

### Riferimento codice

- [frontend/src/pages/Scan.tsx](../frontend/src/pages/Scan.tsx) → `candidateScore()`

## Distinzione visiva per fonte

Ogni card candidato ha un colore di sfondo che indica la provenienza:

| Fonte | Colore |
|---|---|
| Catalogo locale | Verde chiaro (`#e8f5e9`) |
| Open Library | Grigio chiaro (`#f0f0f0`) |
| Google Books | Grigio chiaro (`#f0f0f0`) |

L'etichetta della fonte ("Catalogo locale", "Open Library", "Google Books") e mostrata in fondo a ogni card.

## Conferma e salvataggio

Quando l'utente seleziona un candidato:

1. Se e un'**edizione locale** (`local_edition_id` presente) → navigazione diretta alla pagina dell'edizione.
2. Se e un candidato **esterno** → si apre un **form di conferma/modifica** dove l'utente puo correggere: titolo, sottotitolo, autori, editore, anno, ISBN, pagine.
3. Alla conferma → `POST /api/editions/confirm-candidate` → il backend salva/aggiorna l'edizione.

### Deduplicazione al salvataggio

Il backend (`find_or_create_edition` in `confirmation.py`) gestisce la deduplicazione:

1. **Con ISBN**: cerca per `isbn13` e `isbn10` (con conversione automatica `isbn10_to_isbn13` / `isbn13_to_isbn10`). Se trova, completa i dati mancanti senza sovrascrivere.
2. **Senza ISBN**: cerca edizioni senza ISBN con titolo uguale (case-insensitive). Se i dati non sono in conflitto (stessi anno, editore, pagine dove entrambi non-null), completa i dati mancanti.
3. **Nessun match**: crea nuova edizione.

### Riferimento codice

- [backend/services/confirmation.py](../backend/services/confirmation.py) → `normalize_isbn_pair()`, `find_or_create_edition()`, `confirm_edition_from_candidate()`

## Schema dati salvati

L'edizione viene salvata con:
- Colonne relazionali: `title`, `subtitle`, `isbn13`, `isbn10`, `publishing_year`, `pages`, `publisher_id`
- Colonne ibride: `authors TEXT[]`, `covers TEXT[]`, `source_data JSONB`

Il link opera↔edizione viene creato nella tabella many-to-many `editions_works` (non piu tramite `editions.work_id`). Le tabelle relazionali `works_authors` e `editions_authors` contengono gli autori. Il `search_vector` viene aggiornato automaticamente via trigger quando queste relazioni cambiano.

Per maggiori dettagli sul modello dati, vedi [candidate-model.md](./candidate-model.md).
