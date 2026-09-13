# POPOSTAPO Books — Avvio locale

Questo progetto e' il backend Python/FastAPI per la gestione del catalogo librario.

Si appoggia al server Postgres gia' presente in `TENNIS_GAME_MONOREPO`.

## Prerequisiti

- Python 3.12+
- Docker con il compose di `TENNIS_GAME_MONOREPO`
- `pip` o `venv`

## 1. Avviare Postgres

Dal repository `TENNIS_GAME_MONOREPO`:

```bash
cd C:\Users\radic\Documents\Git\TENNIS_GAME_MONOREPO
docker compose up postgres -d
```

## 2. Creare il database

```bash
docker exec -it tennis-postgres psql -U postgres -c "CREATE DATABASE popostapo_books;"
```

## 3. Configurare l'ambiente

```bash
cd C:\Users\radic\Documents\Git\POPOSTAPO_BOOKS\backend
copy .env.example .env
```

Modifica `JWT_SECRET` in `.env` con una stringa lunga e casuale.

## 4. Installare le dipendenze

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## 5. Avviare il server

```bash
uvicorn backend.main:app --reload --app-dir backend
```

Il server sara' disponibile su `http://localhost:8000`.

## 6. Testare

Healthcheck:

```bash
curl http://localhost:8000/health
```

Per testare l'inserimento di una copia serve un token JWT valido, generato dal servizio `identity` in `TENNIS_GAME_MONOREPO`.
