# Architettura POPOSTAPO — Nuovo approccio all'inserimento delle opere

Questo documento descrive l'architettura proposta per il nuovo progetto POPOSTAPO, partendo dall'analisi del dump MySQL del sistema storico.

L'obiettivo e' semplificare drasticamente l'inserimento delle opere letterarie senza rinunciare al modello gerarchico a tre livelli che e' il tratto distintivo del progetto.

## 1. Principio guida: inserimento dalla copia fisica

Nel vecchio POPOSTAPO l'utente doveva inserire prima i dati dell'opera, poi dell'edizione, infine della copia. Questo flusso era logico per un catalogo, ma macchinoso per l'utente finale, che ha in mano un oggetto concreto.

Il nuovo approccio inverte il flusso:

- L'utente fotografa o inserisce il codice di una **copia fisica**.
- Il sistema identifica o propone l'**edizione** corrispondente.
- L'edizione e' collegata all'**opera** corrispondente, creandola se non esiste.

Il modello gerarchico opera / edizione / copia resta intatto, ma la copia diventa il **trigger** che popola i livelli superiori.

## 2. Modello gerarchico a tre livelli

### Opera (work)

Concetto astratto dell'opera letteraria, indipendente da lingua e formato.

- Titolo originale
- Sottotitolo
- Anno di prima pubblicazione
- Lingua originale
- Forma letteraria
- Genere
- Autori e ruoli

### Edizione (edition)

Pubblicazione concreta di un'opera: una specifica combinazione di editore, lingua, formato, anno, ISBN, rilegatura.

- Titolo dell'edizione
- Editore
- Collana
- Anno di pubblicazione
- Lingua
- ISBN-10 / ISBN-13
- Formato (pagine, dimensioni, peso)
- Rilegatura
- Autori, traduttori, curatori

### Copia (copy)

Esemplare fisico posseduto da un utente.

- Proprietario
- Scaffale / libreria
- Data di acquisto
- Prezzo
- Tipo di entrata / uscita
- Condizione
- Note personali

## 3. Flusso di inserimento (Copia First)

```
Copia fisica
    |
    v
Scatto / ISBN / foto
    |
    v
Servizi di riconoscimento
    |
    v
Dati grezzi (titolo, autore, editore, ISBN, immagine)
    |
    v
Lookup su fonti esterne (Open Library, Google Books, WorldCat, ISBNdb)
    |
    v
Arricchimento con IA (solo se dati mancanti)
    |
    v
Deduplicazione
    |
    v
Proposta all'utente
    |
    v
Conferma / correzione
    |
    v
Salvataggio: copia -> edizione -> opera
```

## 4. Componenti del sistema

### 4.1 Frontend

Il punto d'ingresso principale per l'inserimento e' **mobile-first**: l'utente fotografa la copia con telefono o tablet. PC e tablet restano utili per consultazione, gestione libreria e moderazione.

Canali previsti:

1. **PWA (Progressive Web App) mobile-first** — scelta iniziale
   - Unico codice per Android, iOS e desktop.
   - Accesso a camera e scanner codice a barre tramite browser.
   - Installabile come app sul dispositivo.
   - Nessun costo di pubblicazione sugli store.
   - Condivide le stesse API del backend.

2. **Web desktop responsive**
   - Consultazione, ricerca, gestione copie, approvazione proposte.
   - Stessa applicazione della PWA, con layout adattato.

3. **App nativa (Flutter o React Native)** — fase successiva
   - Si appoggia alle stesse API del backend.
   - Da valutare se la PWA non offre sufficiente esperienza offline, notifiche push o accesso a funzioni native avanzate.

In tutti i casi le interazioni principali sono:

- Schermata di scansione: camera o campo ISBN.
- Schermata di conferma: dati proposti raggruppati in opera, edizione, copia.
- Modalita' manuale di fallback.

### 4.2 API (Python, ad esempio FastAPI)

- `POST /copies/draft` — riceve foto/ISBN e crea una bozza di copia.
- `GET /enrichment/{draft_id}` — restituisce dati proposti.
- `POST /copies/confirm` — conferma copia, edizione e opera.
- `POST /editions/{id}/merge` — proposta di unione in caso di duplicato.

### 4.3 Servizio di enrichment

Componente asincrono che:

1. Estrae codice a barre/ISBN dalla foto (OCR / barcode).
2. Cerca l'ISBN in fonti esterne.
3. Se i dati sono incompleti, arricchisce con un LLM.
4. Restituisce una struttura JSON normalizzata.

Tecnologie possibili:

- OCR: Tesseract, Google Vision, Azure Computer Vision
- ISBN: Open Library, Google Books, ISBNdb, WorldCat
- Arricchimento: OpenAI GPT / Claude per completare campi mancanti
- Coda: Redis + Celery o RQ per non bloccare l'utente

### 4.4 Motore di deduplicazione

Prima di creare una nuova edizione o opera, il sistema confronta:

- ISBN-13 (se presente)
- Titolo normalizzato
- Autore normalizzato
- Editore
- Anno

Se il match e' certo, la copia viene collegata all'edizione esistente. Se e' incerto, viene proposta una schermata di scelta.

### 4.5 Database

Mantiene il modello a tre livelli con alcune aggiunte rispetto al vecchio schema:

- Tabelle con stato `draft` / `proposed` / `approved` per edizioni e opere.
- Tabelle di join per autori/ruoli.
- Storico modifiche su opera ed edizione.
- Tabelle di condivisione e privacy gia' presenti nello schema storico.

## 5. Stati dei dati generati

I record creati automaticamente da IA o servizi esterni non devono essere immediatamente "ufficiali".

| Entita'     | Stato iniziale | Descrizione                                      |
|-------------|----------------|--------------------------------------------------|
| Opera       | `proposed`     | Creata da IA, in attesa di conferma              |
| Edizione    | `proposed`     | Creata da IA, in attesa di conferma              |
| Copia       | `draft`        | Foto/ISBN inserito, dati non ancora confermati   |

L'utente puo':

- confermare (lo stato diventa `approved`)
- modificare
- rifiutare e passare alla modalita' manuale

## 6. Fallback e casi limite

- **Libro senza ISBN**: l'IA estrae titolo e autore dalla copertina e dalla pagina del titolo. L'utente corregge.
- **ISBN non trovato in fonti esterne**: si basa sull'OCR + LLM.
- **Foto di scarsa qualita'**: richiesta di nuova foto o inserimento manuale.
- **Edizione ambigua**: l'utente sceglie tra piu' edizioni proposte.
- **Doppioni nascosti dopo la conferma**: admin o utenti con sufficiente reputazione possono proporre il merge.

## 7. Privacy, costi e affidabilita'

- Le foto copertina non devono essere pubbliche di default: servono solo per l'enrichment.
- Le chiamate a LLM/API esterne sono costose: il servizio di enrichment deve essere asincrono, con rate limiting e caching su ISBN.
- L'IA e' un **assistente**, non una fonte primaria. I dati strutturati da Open Library o Google Books sono preferibili.
- Ogni record generato automaticamente e' tracciabile: sorgente, confidenza, timestamp.

## 8. Prossimi passi

1. Definire lo schema dati del nuovo database con campi `status` e `source`.
2. Progettare le API per il flusso Copia First.
3. Scegliere le fonti esterne e il modello LLM.
4. Realizzare un prototipo di scansione + deduplicazione.
5. Definire le regole di moderazione e merge dei duplicati.
