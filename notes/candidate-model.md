# Modello Candidate per le edizioni

Il modello `Candidate` è un oggetto **di livello edizione**: non contiene dati dell'opera (`work`), che verranno creati/cercati separatamente in fase di conferma e collegati tramite una tabella di relazione.

Per gestire edizioni in arrivo da fonti non strutturate prima che vengano risolti work e autori, la tabella `editions` funziona in modo **ibrido**:

- le colonne relazionali memorizzano i dati canonici e ricercabili che già conosciamo;
- `source_data` (JSONB) memorizza uno snapshot grezzo del `Candidate` per provenance e per alimentare il processo di linking/AI in background.

## Tabella di mappatura

| Campo `Candidate` | Google Books (`volumeInfo`) | Open Library (`editions.docs[*]`) | Destinazione / Note |
|---|---|---|---|
| `source` | `"google_books"` | `"open_library"` | `editions.source` |
| `record_type` | `"volume"` | `"edition"` | metadato interno, non persistito |
| `external_id` | `item.id` | `edition.key` | non in colonna dedicata; eventualmente conservato in `editions.source_data` per provenance |
| `local_edition_id` | — | — | metadato interno locale, non persistito |
| `title` | `title` | `title` | `editions.title` |
| `subtitle` | `subtitle` | `subtitle` | `editions.subtitle` |
| `edition_name` | — | `edition_name[]` | `editions.source_data.edition_name` (es. "paperback", "3rd ed.") |
| `authors` | `authors[]` | `author_name[]` | `editions.authors` (snapshot `TEXT[]`) e, dopo risoluzione, `editions_authors` / `works_authors` con ruolo `author` |
| `contributors` | — | `contributor[]` o `by_statement` | `editions.source_data.contributors` e, dopo risoluzione ruoli, `editions_authors` (`translator`, `editor`, `illustrator`, …) |
| `translators` | — | dati `contributors` | `editions.source_data.translators` finché non risolti |
| `illustrators` | — | dati `contributors` | `editions.source_data.illustrators` finché non risolti |
| `editors` | — | dati `contributors` | `editions.source_data.editors` finché non risolti |
| `publishers` | `[publisher]` | `publisher[]` | `editions.source_data.publishers` o `publishers` + `editions.publisher_id` se risolto |
| `publisher` | `publisher` | primo di `publishers` | `editions.publisher_id` (se creato) o `editions.source_data.publisher` |
| `publish_date` | `publishedDate` | `publish_date` | usato per estrarre `year`; conservato in `editions.source_data.publish_date` |
| `year` | regex `\b(\d{4})\b` | regex `\b(\d{4})\b` | `editions.publishing_year` |
| `publish_places` | — | `publish_place[]` / `publish_places[]` | `editions.source_data.publish_places` |
| `physical_format` | — | `physical_format` | `editions.binding_id` se associato a `bindings`, altrimenti `editions.source_data.physical_format` |
| `print_type` | `printType` | — | `editions.source_data.print_type` |
| `isbn` | preferisce `ISBN_13` | preferisce 13 cifre in `isbn[]` | `editions.isbn13` o `editions.isbn10` |
| `isbn10` | `ISBN_10` | 10 cifre in `isbn[]` | `editions.isbn10` |
| `isbn13` | `ISBN_13` | 13 cifre in `isbn[]` | `editions.isbn13` |
| `issn` | `ISSN` in `industryIdentifiers` | — | `editions.source_data.other_identifiers` o `editions.source_data.issn` |
| `lccn` | — | `lccn` | `editions.source_data.other_identifiers` o `editions.source_data.lccn` |
| `oclc` | — | `oclc` | `editions.source_data.other_identifiers` o `editions.source_data.oclc` |
| `other_identifiers` | altri `industryIdentifiers` | `ia`, `ocaid`, DOI, UPC, ISMN, GTIN_14 | `editions.source_data.other_identifiers` |
| `pages` | `pageCount` | `number_of_pages` | `editions.pages` |
| `language` | `language` | `language[]` / `languages[].key` | `editions.language_id` se risolto, altrimenti `editions.source_data.language` |
| `series` | — | `series[]` | `editions.series_id` se creato, altrimenti `editions.source_data.series` |
| `description` | `description` | `description` o `notes` | non portato nel `Candidate` e non persistito |
| `covers` | `imageLinks` (varie dimensioni) | `cover_i` → URL copertina | `editions.covers` (`TEXT[]`) |
| `thumbnail` | `imageLinks.thumbnail` (http→https) | `https://covers.openlibrary.org/b/id/{cover_i}-M.jpg` | anteprima principale: `editions.covers[0]` oppure `editions.source_data.thumbnail` |
| `preview_url` | `previewLink` | — | `editions.source_data.preview_url` |
| `info_url` | `infoLink` | `https://openlibrary.org{edition.key}` | `editions.source_data.info_url` |
| `ebook_access` | `accessInfo.viewability` / `saleInfo.saleability` | `ebook_access` / `public_scan_b` | `editions.source_data.ebook_access` |
| `has_fulltext` | da `accessInfo` | `has_fulltext` | `editions.source_data.has_fulltext` |
| `average_rating` | `averageRating` | — | `editions.source_data.average_rating` |
| `ratings_count` | `ratingsCount` | — | `editions.source_data.ratings_count` |
| `dimensions` | `dimensions { height, width, thickness }` | `physical_dimensions`? | parse in `editions.height_mm`, `width_mm`, `thickness_mm` se possibile, altrimenti `editions.source_data.dimensions` |
| `weight` | — | `weight` | parse in `editions.weight_g` se possibile, altrimenti `editions.source_data.weight` |
| `raw` | `item` intero | `edition` intero | non persistito (lo snapshot normalizzato è in `editions.source_data`) |

## Colonne `editions` aggiunte per lo snapshot ibrido

| Colonna | Tipo | Contenuto |
|---|---|---|
| `authors` | `TEXT[]` | array di nomi autore così come arrivano dal `Candidate` |
| `covers` | `TEXT[]` | URL delle copertine |
| `source_data` | `JSONB` | snapshot normalizzato del `Candidate` (dati non relazionali + provenance) |

## Cosa è escluso

I campi work-level non fanno parte di `Candidate`. Verranno gestiti separatamente nella tabella `works` durante il processo di linking:

- `work_title`
- `first_publish_year`
- `edition_count`
- `subjects`
- `first_sentence`
- `table_of_contents`
- `pages_median`

## Riferimento al codice TypeScript

L'interfaccia TypeScript `Candidate` e i mapper `provider → Candidate` sono definiti in:

[frontend/src/services/bibliographicMappers.ts](../frontend/src/services/bibliographicMappers.ts)

## Collegamento al work

Alla conferma di un `Candidate`:

1. si salvano nelle colonne `editions` i dati canonici disponibili (`title`, `subtitle`, `isbn10`, `isbn13`, `publishing_year`, `pages`, `publisher_id` se noto, `language_id` se noto, ecc.);
2. si salvano `editions.authors` (array grezzo), `editions.covers` e `editions.source_data` (snapshot JSONB);
3. `work_id` rimane `NULL` finché un processo in background non crea/associa il `Work` e popola `works_authors` / `editions_authors`;
4. l'edizione è comunque immediatamente utilizzabile per `Copy` e `Reading`, perché `copies.edition_id` e `readings.edition_id` non dipendono dal work.
