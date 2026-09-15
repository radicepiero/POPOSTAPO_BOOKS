export const sourceLabels: Record<string, string> = {
  postgresql: 'Catalogo locale',
  open_library: 'Open Library',
  google_books: 'Google Books',
  openai_vision: 'Foto copertina',
}

export const imageRoleLabels: Record<string, string> = {
  'front cover': 'Copertina',
  'back cover': 'Retro',
  'copyright or title page': 'Dati editoriali',
  'spine': 'Spina',
  'image': 'Immagine',
}

export const readingStatusLabels: Record<string, string> = {
  active: 'In corso',
  wishlist: 'Da leggere',
  finished: 'Terminata',
  abandoned: 'Interrotta',
}

export const buttonLabels = {
  useThis: 'Usa questa edizione',
  addCopy: 'Aggiungi copia',
  addReading: 'Registra lettura',
  addWishlist: 'Aggiungi alla wishlist',
  actions: 'Azioni',
  closeActions: 'Chiudi azioni',
  startReading: 'Inizia lettura',
  continue: 'Continua',
  markFinished: 'Segna come terminata',
  markAbandoned: 'Segna come interrotta',
  addBookmark: 'Aggiungi segnalibro',
  delete: 'Elimina',
  deleteReading: 'Cancella',
  save: 'Salva',
  cancel: 'Annulla',
  back: 'Indietro',
  lend: 'Presta',
  gift: 'Regala',
  sell: 'Vendi',
  return: 'Restituisci',
  modify: 'Modifica',
  moreDetails: '+ Più dettagli',
  lessDetails: '− Meno dettagli',
  takePhoto: 'Scatta',
  usePhoto: 'Usa questa foto',
  retake: 'Riprova',
  crop: 'Ritaglia',
  search: 'Cerca',
  analyze: 'Analizza libro',
}

export const formLabels = {
  title: 'Titolo',
  subtitle: 'Sottitolo',
  authors: 'Autori',
  author: 'Autore',
  publisher: 'Editore',
  year: 'Anno di pubblicazione',
  isbn: 'ISBN',
  pages: 'Pagine',
  price: 'Prezzo',
  currency: 'Valuta',
  acquisitionDate: 'Data di acquisto',
  acquisitionType: 'Tipo di acquisizione',
  library: 'Libreria',
  shelf: 'Scaffale',
  conditionNote: 'Condizioni e note',
  fromFriend: 'Da chi',
  page: 'Pagina',
  bookmarkDate: 'Data',
  note: 'Nota',
  rating: 'Valutazione',
}

export const readingListLabels = {
  title: 'Le mie letture',
  loading: 'Caricamento letture...',
  empty: 'Nessuna lettura in questa sezione.',
  lastUpdate: 'Ultimo aggiornamento',
  bookmarkCount: 'tappe',
  addedOn: 'Aggiunto alla wishlist',
  pageOf: (page: number, pages?: number) => (pages ? `Pagina ${page} di ${pages}` : `Pagina ${page}`),
  noCover: 'No cover',
}

export const libraryLabels = {
  title: 'La mia libreria',
  pending: 'In attesa di sync',
  confirmed: 'Copie confermate',
  empty: 'Nessuna copia confermata.',
  noCover: 'No cover',
}

export const editionLabels = {
  work: 'Opera',
  edition: 'Edizione',
  title: 'Titolo',
  originalTitle: 'Titolo originale',
  authors: 'Autori',
  publisher: 'Editore',
  year: 'Anno',
  isbn: 'ISBN',
  pages: 'Pagine',
  images: "Immagini dell'edizione",
  unknownAuthor: 'Non ancora identificati',
  unknownTitle: 'Non ancora identificata',
}

export const scanLabels = {
  title: "Cerca un'edizione",
  isbnPlaceholder: 'Inserisci ISBN',
  scanner: 'Scanner',
  search: 'Cerca',
  titleAuthorSearch: 'Ricerca per titolo o autore',
  imageSearch: 'Cerca per immagini',
  analyze: 'Analizza libro',
  results: 'Risultati',
  coverHint: 'La copertina anteriore è necessaria. Le altre immagini migliorano il riconoscimento.',
  noCover: 'Nessuna immagine',
  skipBack: 'Non ho la foto del retro',
  skipSpine: 'Non ho la foto del fianco',
  skipCopyright: 'Non ho la pagina interna',
  proceedBack: 'Procedi senza foto del retro.',
  proceedSpine: 'Procedi senza foto del fianco.',
  proceedCopyright: 'Procedi senza pagina interna.',
}
