# Report pre-migrazione varianti — 2026-09-24

## Backup

- Database PostgreSQL: `backups/popostapo_books_2026-09-24_pre-varianti.dump`
- Upload immagini: `backups/uploads_2026-09-24_pre-varianti.tar.gz`

Il dump database è in formato custom PostgreSQL, compressione 9. Il backup contiene 447 oggetti.

## Dimensioni attuali

| Entità | Totale |
|---|---:|
| Edizioni | 541 |
| Opere | 543 |
| Collegamenti edizione-opera | 524 |
| Copie | 305 |
| Letture | 236 |
| Wishlist attuali (`readings.status = 'wishlist'`) | 2 |
| Collane | 93 |
| Editori | 509 |

## Edizioni e opere

- 524 edizioni hanno almeno un'opera collegata.
- 17 edizioni non hanno opere collegate.
- Ogni edizione collegata ha attualmente una sola opera.
- 484 opere hanno una sola edizione.
- 15 opere hanno 2 edizioni.
- 2 opere hanno 3 edizioni.
- 1 opera ha 4 edizioni.

Non esistono attualmente edizioni collegate a più opere. I duplicati con lo stesso ISBN potrebbero quindi rappresentare sia varianti/errori sia componenti di edizioni collettive importate come edizioni separate.

## ISBN

- 274 edizioni non hanno ISBN.
- 1 ISBN è formalmente invalido: edizione `256`, `isbn13 = 8877132787` (10 caratteri salvati nel campo ISBN-13).
- Esistono 2 gruppi di valori ISBN ripetuti.

### Valore `2147483647`

Presente su 7 edizioni:

- `142` — Asce di Guerra
- `168` — I marmocchi di Agnes
- `191` — Mai lontano da qui
- `192` — Fuga dal Natale
- `193` — Corpi freddi
- `194` — Schiava di mio marito
- `196` — Ragazzi di vita

Il valore coincide con il massimo intero a 32 bit e probabilmente deriva da un errore di importazione/conversione, non da un vero ISBN condiviso. Non deve essere usato per unire le edizioni.

### Valore `9788817133340`

Presente su 3 edizioni BUR:

- `562` — Il taglio del bosco
- `563` — Rosa Gagliardi
- `564` — Le amiche

Potrebbe trattarsi di dati errati oppure di una pubblicazione collettiva rappresentata come più edizioni. Da verificare manualmente prima di decidere se unire o collegare diversamente.

## Immagini

- 526 edizioni non hanno `covers`.
- 3 edizioni hanno una copertina.
- 12 edizioni hanno più immagini/copertine.
- Massimo attuale: 5 immagini su un'edizione.

Distribuzione URL:

- 21 immagini locali in `/uploads/`;
- 17 URL remoti.

`source_data.images` è presente su 3 edizioni con chiavi:

- `front cover`: 3
- `back cover`: 3
- `copyright or title page`: 3
- `spine`: 1

Sarà necessario mappare questi nomi nei nuovi ruoli `front`, `back`, `copyright`, `spine`.

## Caratteristiche fisiche attuali sulle edizioni

| Campo | Edizioni valorizzate |
|---|---:|
| Collana | 294 |
| Pagine | 535 |
| Rilegatura | 525 |
| Dimensioni | 8 |
| Peso | 6 |
| Colore | 342 |

La maggior parte dei dati fisici può essere trasferita alla variante predefinita. I pochi dati dimensionali/peso restano override della variante e non default di collana.

## Copie

- 305 copie totali.
- Tutte le copie sono `approved`.
- Tutte le copie hanno `edition_id`.
- 275 copie non hanno scaffale.
- 287 edizioni hanno una copia.
- 9 edizioni hanno due copie.

La migrazione può collegare tutte le copie alla variante predefinita della propria edizione.

## Letture

| Stato | Totale |
|---|---:|
| finished | 208 |
| active | 15 |
| abandoned | 11 |
| wishlist | 2 |

- 235 letture non hanno `copy_id`.
- 1 lettura ha `copy_id`.
- Nessuna lettura è senza `edition_id`.

Dopo la migrazione iniziale, quasi tutte le letture potranno puntare alla variante predefinita dell'edizione; quella con copia potrà derivarla dalla copia.

## Wishlist attuale

Ci sono 2 record `readings.status = 'wishlist'`:

- lettura `310`, edizione `570`, senza copia;
- lettura `312`, edizione `520`, senza copia.

Durante la migrazione diventeranno `wishlist_items` attive, con `work_id` se l'edizione è collegata a un'opera; altrimenti con titolo/autore derivati dall'edizione.

## Duplicati per titolo/editore/anno

Quattro gruppi richiedono revisione:

- `18` / `47` — L'ispettore Cadavre, Adelphi, 1944, stesse pagine;
- `43` / `56` — Maigret e l'uomo della panchina, Adelphi, 1953, stesse pagine;
- `42` / `61` — Maigret si confida, Adelphi, 1959, pagine diverse;
- `211` / `216` — Noi, Neri Pozza, 2014, una sola riga ha collana Meridiani.

Questi sono possibili duplicati/varianti, ma non devono essere uniti automaticamente.

## Rischi principali

1. Lo stesso ISBN non è sufficiente a stabilire che due record siano varianti.
2. Alcuni duplicati potrebbero rappresentare edizioni collettive spezzate per opera.
3. `2147483647` è quasi certamente un valore corrotto.
4. Le immagini attuali non hanno sempre ruoli affidabili: le immagini senza metadati possono essere migrate come `other` o come `front` solo dopo una regola prudente.
5. Le varianti predefinite devono essere create per ogni edizione, anche quelle senza dati fisici.

## Regola prudente per la migrazione

- Ogni edizione esistente riceve una `Variante principale`.
- I dati fisici attuali diventano dati espliciti della variante.
- Le copie puntano alla variante predefinita.
- Le letture puntano alla variante predefinita o alla variante derivata dalla copia.
- Nessuna edizione viene unita automaticamente.
- I duplicati vengono risolti in una fase successiva con interfaccia di revisione.

## Correzioni manuali applicate dopo il report

Su indicazione dell'utente sono stati rimossi i seguenti ISBN errati:

- `isbn10 = 2147483647` dalle edizioni `142`, `168`, `191`, `192`, `193`, `194`, `196`;
- `isbn13 = 9788817133340` dalle edizioni `563` e `564`.

L'ISBN `9788817133340` è stato mantenuto soltanto sull'edizione `562` — Il taglio del bosco.

Dopo la correzione non risultano più gruppi di ISBN duplicati e le edizioni senza ISBN sono 283.

## Migrazione dati applicata

È stata applicata `backend/db/migrations/20260924_002_populate_edition_variants.sql`.

Risultato:

- 541 varianti create, una per edizione;
- ogni edizione ha esattamente una variante predefinita;
- 38 immagini migrate in `edition_variant_images`;
- 305 copie collegate a una variante;
- 236 letture collegate a una variante;
- 2 wishlist migrate in `wishlist_items`;
- 2 letture legacy con stato `wishlist` rimosse dalla tabella `readings`.

Distribuzione dei ruoli immagine:

- `front`: 15
- `back`: 3
- `spine`: 1
- `copyright`: 3
- `other`: 16

Controlli post-migrazione:

- edizioni senza variante predefinita: 0;
- edizioni con più varianti predefinite: 0;
- copie senza variante: 0;
- letture senza variante: 0;
- mismatch copia/edizione-variante: 0;
- mismatch lettura/copia: 0.
