# Comandi di avvio POPOSTAPO Books

## Prerequisito: PostgreSQL da Tennis

Il backend POPOSTAPO si appoggia al PostgreSQL avviato da `TENNIS_GAME_MONOREPO` (vedi `backend/.env.example`).

```powershell
cd C:\Users\radic\Documents\Git\TENNIS_GAME_MONOREPO
docker compose up -d postgres
```

Verifica:

```powershell
docker compose ps
docker compose logs -f postgres
```

## Backend

### Setup iniziale (una tantum)

```powershell
cd C:\Users\radic\Documents\Git\POPOSTAPO_BOOKS\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Modifica JWT_SECRET in .env con una stringa lunga e casuale
```

### Avvio sviluppo

```powershell
cd C:\Users\radic\Documents\Git\POPOSTAPO_BOOKS
backend\.venv\Scripts\activate
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8002 --reload
```

Healthcheck:

```powershell
curl http://127.0.0.1:8002/health
```

## Frontend

### Setup iniziale

```powershell
cd C:\Users\radic\Documents\Git\POPOSTAPO_BOOKS\frontend
npm install
```

### Avvio sviluppo

```powershell
npm run dev
```

URL disponibili:

- `https://localhost:5173` (localhost con HTTPS)
- `https://192.168.1.125:5173` (LAN Wi-Fi, utile per Android)

### Utente test incollare token in login
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1dWlkIjoiMTExMTExMTEtMTExMS0xMTExLTExMTEtMTExMTExMTExMTExIiwidHlwIjoiYWNjZXNzIn0.HdUJP1ds4rcI0fNTt8xyLwpWycban8fZGlgUpiaAvPI


### Build e preview

```powershell
npm run build
npm run preview
```

## Tennis stack completo (opzionale)

Se serve avviare tutto il monorepo Tennis:

```powershell
cd C:\Users\radic\Documents\Git\TENNIS_GAME_MONOREPO
docker compose up -d
```

## Note

- Il proxy Vite inoltra `/api` a `http://127.0.0.1:8002`.
- Per la fotocamera del telefono serve HTTPS; Vite e i certificati `mkcert` sono già configurati in `frontend/.cert`.
- La porta FastAPI in sviluppo è `8002` per allinearsi al proxy Vite attuale.
