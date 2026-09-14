"""
Migrate data from legacy MySQL (popostapo_legacy_ii) to new PostgreSQL schema.

Usage:
    cd POPOSTAPO_BOOKS
    backend\\.venv\\Scripts\\python.exe -m backend.migrate_legacy

Requires: psycopg2, subprocess access to docker.
"""
import json
import re
import subprocess
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MYSQL_CONTAINER = "popostapo-legacy-mysql"
MYSQL_DB = "popostapo_legacy_ii"
PG_DSN = "postgresql://postgres:6a6db5c2ecb2@localhost:5432/popostapo_books"

# UUID for Piero Radice (mapped from legacy membre)
PIERO_UUID = None  # will be read from the DB or set to a new UUID

# legacy Condiviso flags: 'v' = shared, 'f' = not shared
def is_shared(val) -> bool:
    return str(val).strip().lower() == "v"

def status_from_approved(val) -> str:
    v = str(val).strip().lower()
    if v == "v":
        return "approved"
    if v == "f":
        return "proposed"
    return "draft"

def positive_int(val):
    try:
        n = int(val)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None

def clean_text(val):
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None

def safe_date(val):
    if val is None:
        return None
    s = str(val).strip()
    if not s or s == "0000-00-00" or s == "None":
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None

def safe_datetime(val):
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.startswith("0000") or s == "None":
        return None
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None

def normalize_isbn(val):
    if val is None:
        return None
    s = re.sub(r"[^0-9Xx]", "", str(val))
    if len(s) in (10, 13):
        return s.upper()
    return None

# ---------------------------------------------------------------------------
# MySQL helper: run a query via docker exec and return JSON rows
# ---------------------------------------------------------------------------
def mysql_query(sql: str) -> list[dict]:
    """Run a SELECT on legacy MySQL, return list of dicts via JSON."""
    # Wrap each row in JSON_OBJECT via a subquery approach
    # Simpler: use --batch --raw and parse TSV
    cmd = [
        "docker", "exec", MYSQL_CONTAINER,
        "mysql", "-u", "root", "--batch", "--raw",
        "-e", f"USE {MYSQL_DB}; {sql}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        print(f"MySQL ERROR: {result.stderr}", file=sys.stderr)
        return []
    lines = result.stdout.strip().split("\n")
    if len(lines) < 2:
        return []
    headers = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        values = line.split("\t")
        row = {}
        for i, h in enumerate(headers):
            val = values[i] if i < len(values) else None
            if val == "NULL":
                val = None
            row[h] = val
        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Mapping: legacy authorrole -> our role names (lowercase)
# ---------------------------------------------------------------------------
ROLE_MAP = {
    "Author": "author",
    "author": "author",
    "co-author": "co_author",
    "Co-author": "co_author",
    "Co-Author": "co_author",
    "editor": "editor",
    "Editor": "editor",
    "translator": "translator",
    "Translator": "translator",
    "illustrator": "illustrator",
    "Illustrator": "illustrator",
}


def main():
    print("=== POPOSTAPO Legacy Migration ===")
    print()

    # -- Connect to PostgreSQL --
    pg = psycopg2.connect(PG_DSN)
    pg.autocommit = False
    cur = pg.cursor()

    # -- Drop and recreate schema --
    print("[1/20] Recreating PostgreSQL schema...")
    schema_path = Path(__file__).parent / "db" / "schema.sql"
    schema_sql = schema_path.read_text(encoding="utf-8")

    # Drop all tables first (in correct dependency order)
    cur.execute("""
        DO $$ DECLARE r RECORD;
        BEGIN
            FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
            END LOOP;
        END $$;
    """)
    # Drop types
    cur.execute("DROP TYPE IF EXISTS entity_status CASCADE;")
    cur.execute("DROP TYPE IF EXISTS data_source CASCADE;")
    pg.commit()

    # Execute schema
    cur.execute(schema_sql)
    pg.commit()
    print("  Schema created.")

    # =========================================================================
    # PHASE 1: Lookup tables
    # =========================================================================

    # --- Languages ---
    print("[2/20] Migrating languages...")
    rows = mysql_query("SELECT IDLanguage, Language FROM languages")
    if rows:
        lang_values = []
        seen_codes = set()
        for r in rows:
            lid = int(r["IDLanguage"])
            name = clean_text(r["Language"]) or "unknown"
            # Generate unique code: try 3-char prefix, fallback to id-based
            code = name[:3].lower()
            if code in seen_codes:
                code = f"l{lid}"
            seen_codes.add(code)
            lang_values.append((lid, code, name))
        execute_values(cur, "INSERT INTO languages (id, code, name) VALUES %s ON CONFLICT DO NOTHING", lang_values)
        # Update sequence
        cur.execute("SELECT setval('languages_id_seq', (SELECT COALESCE(MAX(id),0) FROM languages))")
    pg.commit()
    print(f"  {len(rows)} languages.")

    # --- Nations ---
    print("[3/20] Migrating nations...")
    rows = mysql_query("SELECT IDNation, Nation, Nation_ITA, Continent FROM nations")
    if rows:
        vals = []
        for r in rows:
            vals.append((int(r["IDNation"]), None, clean_text(r["Nation"]) or "", clean_text(r["Nation_ITA"]) or "", clean_text(r.get("Continent"))))
        execute_values(cur, "INSERT INTO nations (id, code, name, name_ita, continent) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('nations_id_seq', (SELECT COALESCE(MAX(id),0) FROM nations))")
    pg.commit()
    print(f"  {len(rows)} nations.")

    # --- Bindings ---
    print("[4/20] Migrating bindings...")
    rows = mysql_query("SELECT IDbinding, binding, binding_ita FROM bindings")
    if rows:
        vals = [(int(r["IDbinding"]), clean_text(r["binding"]) or "?", clean_text(r.get("binding_ita"))) for r in rows]
        execute_values(cur, "INSERT INTO bindings (id, name, name_ita) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('bindings_id_seq', (SELECT COALESCE(MAX(id),0) FROM bindings))")
    pg.commit()
    print(f"  {len(rows)} bindings.")

    # --- Colors ---
    print("[5/20] Migrating colors...")
    rows = mysql_query("SELECT IDColor, Color FROM colors")
    if rows:
        vals = [(int(r["IDColor"]), clean_text(r["Color"]) or "?") for r in rows]
        execute_values(cur, "INSERT INTO colors (id, name) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('colors_id_seq', (SELECT COALESCE(MAX(id),0) FROM colors))")
    pg.commit()
    print(f"  {len(rows)} colors.")

    # --- Currencies ---
    print("[6/20] Migrating currencies...")
    rows = mysql_query("SELECT Currency FROM currencies")
    if rows:
        vals = [(clean_text(r["Currency"]),) for r in rows if clean_text(r["Currency"])]
        execute_values(cur, "INSERT INTO currencies (code) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()
    print(f"  {len(rows)} currencies.")

    # --- Author roles ---
    print("[7/20] Migrating author roles...")
    rows = mysql_query("SELECT Authorrole, Authorrole_ITA, WE FROM authorroles")
    if rows:
        vals = []
        for r in rows:
            role = ROLE_MAP.get(r["Authorrole"], r["Authorrole"].lower())
            name_ita = clean_text(r["Authorrole_ITA"]) or role
            applies_to = clean_text(r.get("WE"))
            vals.append((role, name_ita, applies_to))
        execute_values(cur, "INSERT INTO author_roles (role, name_ita, applies_to) VALUES %s ON CONFLICT DO NOTHING", vals)
    # Ensure 'co_author' exists
    cur.execute("INSERT INTO author_roles (role, name_ita, applies_to) VALUES ('co_author', 'co_autore', 'W') ON CONFLICT DO NOTHING")
    pg.commit()
    print(f"  {len(rows)} author roles.")

    # --- Relationships ---
    print("[8/20] Migrating relationships...")
    rows = mysql_query("SELECT IDRelation, Relationship, Relationship_ITA FROM relationships")
    if rows:
        vals = [(int(r["IDRelation"]), clean_text(r["Relationship"]) or "?", clean_text(r.get("Relationship_ITA"))) for r in rows]
        execute_values(cur, "INSERT INTO relationships (id, name, name_ita) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('relationships_id_seq', (SELECT COALESCE(MAX(id),0) FROM relationships))")
    pg.commit()
    print(f"  {len(rows)} relationships.")

    # --- Acquisition types (tipiacquisto) ---
    print("[9/20] Migrating acquisition types...")
    rows = mysql_query("SELECT IDtipoAcquisto, TipoAcquisto, TipoAcquisto_ITA, Direction FROM tipiacquisto")
    if rows:
        vals = [(int(r["IDtipoAcquisto"]), clean_text(r["TipoAcquisto"]) or "?", clean_text(r.get("TipoAcquisto_ITA")), clean_text(r.get("Direction"))) for r in rows]
        execute_values(cur, "INSERT INTO acquisition_types (id, name, name_ita, direction) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('acquisition_types_id_seq', (SELECT COALESCE(MAX(id),0) FROM acquisition_types))")
    pg.commit()
    print(f"  {len(rows)} acquisition types.")

    # --- Art types ---
    print("[10/20] Migrating art types...")
    rows = mysql_query("SELECT IDArttype, Arttype, Arttype_ITA FROM arttypes")
    if rows:
        vals = [(int(r["IDArttype"]), clean_text(r["Arttype"]) or "?", clean_text(r.get("Arttype_ITA"))) for r in rows]
        execute_values(cur, "INSERT INTO art_types (id, name, name_ita) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('art_types_id_seq', (SELECT COALESCE(MAX(id),0) FROM art_types))")
    pg.commit()
    print(f"  {len(rows)} art types.")

    # --- Genres ---
    print("[11/20] Migrating genres...")
    rows = mysql_query("SELECT IDGenere, IDPadre, Genere, Genere_ITA, Livello FROM generi")
    if rows:
        # First pass: insert without parent_id to avoid FK issues
        vals = [(int(r["IDGenere"]), clean_text(r["Genere"]) or "?", clean_text(r.get("Genere_ITA")), None, positive_int(r.get("Livello")) or 0) for r in rows]
        execute_values(cur, "INSERT INTO genres (id, name, name_ita, parent_id, level) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('genres_id_seq', (SELECT COALESCE(MAX(id),0) FROM genres))")
        pg.commit()
        # Second pass: update parent_id
        for r in rows:
            pid = positive_int(r.get("IDPadre"))
            if pid:
                cur.execute("UPDATE genres SET parent_id = %s WHERE id = %s AND EXISTS (SELECT 1 FROM genres WHERE id = %s)", (pid, int(r["IDGenere"]), pid))
        pg.commit()
    print(f"  {len(rows)} genres.")

    # --- Permissions (diritti) ---
    rows = mysql_query("SELECT IDDiritti, Diritti, Diritti_ITA FROM diritti")
    if rows:
        vals = [(int(r["IDDiritti"]), clean_text(r["Diritti"]) or "?", clean_text(r.get("Diritti_ITA"))) for r in rows]
        execute_values(cur, "INSERT INTO permissions (id, name, name_ita) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('permissions_id_seq', (SELECT COALESCE(MAX(id),0) FROM permissions))")
    pg.commit()

    # --- Periods ---
    rows = mysql_query("SELECT IDPeriodo, inizio, fine, durata, libelleITA, libelleING FROM periodi")
    if rows:
        vals = [(clean_text(r["IDPeriodo"]), safe_date(r.get("inizio")), safe_date(r.get("fine")), positive_int(r.get("durata")), clean_text(r.get("libelleITA")), clean_text(r.get("libelleING"))) for r in rows]
        execute_values(cur, "INSERT INTO periods (id, start_date, end_date, duration, name_ita, name_eng) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # =========================================================================
    # PHASE 2: Membres & Friends
    # =========================================================================

    print("[12/20] Migrating membres...")
    rows = mysql_query("SELECT IDMembre, Pseudo, Email, Name, Surname, IsAdmin, IDLanguage FROM membre")
    if rows:
        vals = []
        for r in rows:
            mid = int(r["IDMembre"])
            email = clean_text(r.get("Email"))
            # Map Piero Radice to a UUID placeholder (will be set later)
            vals.append((mid, None, clean_text(r.get("Pseudo")), email, clean_text(r.get("Name")), clean_text(r.get("Surname")), str(r.get("IsAdmin", "0")) == "1", positive_int(r.get("IDLanguage"))))
        execute_values(cur, "INSERT INTO membres (id, uuid, pseudo, email, name, surname, is_admin, language_id) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('membres_id_seq', (SELECT COALESCE(MAX(id),0) FROM membres))")
    pg.commit()
    print(f"  {len(rows)} membres.")

    # --- Friends ---
    print("[13/20] Migrating friends...")
    rows = mysql_query("SELECT IDFriend, IDMembre, Name, Surname, Pseudo, IDMembreLink, email, Relationship, ShareReadings FROM friends")
    if rows:
        vals = []
        for r in rows:
            rel_id = positive_int(r.get("Relationship"))
            vals.append((
                int(r["IDFriend"]),
                int(r["IDMembre"]),
                clean_text(r.get("Name")),
                clean_text(r.get("Surname")),
                clean_text(r.get("Pseudo")),
                positive_int(r.get("IDMembreLink")),
                clean_text(r.get("email")),
                rel_id,
                str(r.get("ShareReadings", "0")) == "1",
            ))
        execute_values(cur, """INSERT INTO friends (id, owner_id, name, surname, pseudo, linked_membre_id, email, relationship_id, share_readings)
            VALUES %s ON CONFLICT DO NOTHING""", vals)
        cur.execute("SELECT setval('friends_id_seq', (SELECT COALESCE(MAX(id),0) FROM friends))")
    pg.commit()
    print(f"  {len(rows)} friends.")

    # =========================================================================
    # PHASE 3: Publishers, Series, Authors
    # =========================================================================

    print("[14/20] Migrating publishers...")
    rows = mysql_query("SELECT IDPublisher, Publisher, IDNation, Approved, Link FROM publishers")
    if rows:
        vals = []
        for r in rows:
            nid = positive_int(r.get("IDNation"))
            if nid == 0:
                nid = None
            vals.append((int(r["IDPublisher"]), clean_text(r["Publisher"]) or "?", nid, clean_text(r.get("Link")), status_from_approved(r.get("Approved")), "manual"))
        execute_values(cur, "INSERT INTO publishers (id, name, nation_id, website, status, source) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('publishers_id_seq', (SELECT COALESCE(MAX(id),0) FROM publishers))")
    pg.commit()
    print(f"  {len(rows)} publishers.")

    print("  Migrating series...")
    rows = mysql_query("SELECT IDSerie, IDPublisher, Serie FROM series")
    if rows:
        vals = []
        for r in rows:
            pid = positive_int(r.get("IDPublisher"))
            vals.append((int(r["IDSerie"]), pid, clean_text(r["Serie"]) or "?"))
        execute_values(cur, "INSERT INTO series (id, publisher_id, name) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('series_id_seq', (SELECT COALESCE(MAX(id),0) FROM series))")
    pg.commit()
    print(f"  {len(rows)} series.")

    print("[15/20] Migrating authors...")
    rows = mysql_query("""SELECT IDAuthor, Gendre, Name, Surname, AcronimusName, AcronimusSurname,
        IDNation, PenName, ACDCnascita, NascitaAnno, NascitaMese, NascitaGiorno,
        morto, ACDCmorte, MorteAnno, MorteMese, MorteGiorno, IDNazioneNascita,
        AuthorApproved FROM authors""")
    if rows:
        vals = []
        for r in rows:
            nation_id = positive_int(r.get("IDNation"))
            if nation_id == 0:
                nation_id = None
            pen_name = positive_int(r.get("PenName"))
            if pen_name == 0:
                pen_name = None
            birth_nation = positive_int(r.get("IDNazioneNascita"))
            if birth_nation == 0:
                birth_nation = None
            vals.append((
                int(r["IDAuthor"]),
                clean_text(r.get("Gendre")),
                clean_text(r["Name"]) or "",
                clean_text(r["Surname"]) or "",
                clean_text(r.get("AcronimusName")),
                clean_text(r.get("AcronimusSurname")),
                nation_id,
                pen_name,
                positive_int(r.get("NascitaAnno")),
                positive_int(r.get("NascitaMese")),
                positive_int(r.get("NascitaGiorno")),
                int(r.get("ACDCnascita") or 1),
                positive_int(r.get("MorteAnno")),
                positive_int(r.get("MorteMese")),
                positive_int(r.get("MorteGiorno")),
                int(r.get("ACDCmorte") or 1),
                str(r.get("morto", "0")) == "1",
                birth_nation,
                status_from_approved(r.get("AuthorApproved")),
                "manual",
            ))
        execute_values(cur, """INSERT INTO authors (id, gender, given_name, family_name, acronym_name, acronym_family_name,
            nation_id, pen_name_of, birth_year, birth_month, birth_day, birth_era,
            death_year, death_month, death_day, death_era, is_dead, birth_nation_id,
            status, source) VALUES %s ON CONFLICT DO NOTHING""", vals)
        cur.execute("SELECT setval('authors_id_seq', (SELECT COALESCE(MAX(id),0) FROM authors))")
    pg.commit()
    print(f"  {len(rows)} authors.")

    # =========================================================================
    # PHASE 4: Works
    # =========================================================================

    print("[16/20] Migrating works...")
    rows = mysql_query("SELECT IDWork, OriginalTitle, OriginalSubTitle, PublishingYear, ACDC, IDLanguage, Approved FROM works")
    if rows:
        vals = []
        for r in rows:
            lang_id = positive_int(r.get("IDLanguage"))
            if lang_id == 0:
                lang_id = None
            vals.append((
                int(r["IDWork"]),
                clean_text(r["OriginalTitle"]) or "Titolo sconosciuto",
                clean_text(r.get("OriginalSubTitle")),
                positive_int(r.get("PublishingYear")),
                int(r.get("ACDC") or 1),
                lang_id,
                status_from_approved(r.get("Approved")),
                "manual",
            ))
        execute_values(cur, """INSERT INTO works (id, original_title, original_subtitle, publishing_year, publishing_era,
            original_language_id, status, source) VALUES %s ON CONFLICT DO NOTHING""", vals)
        cur.execute("SELECT setval('works_id_seq', (SELECT COALESCE(MAX(id),0) FROM works))")
    pg.commit()
    print(f"  {len(rows)} works.")

    # --- authors_works ---
    print("  Migrating authors_works...")
    rows = mysql_query("SELECT IDWork, IDAuthor, Authorrole FROM authors_works")
    if rows:
        vals = []
        for r in rows:
            raw_role = (r["Authorrole"] or "author").strip()
            role = ROLE_MAP.get(raw_role)
            if not role:
                # Case-insensitive lookup
                role = ROLE_MAP.get(raw_role.lower(), raw_role.lower().replace("-", "_"))
            # Ensure the role exists in author_roles
            cur.execute("INSERT INTO author_roles (role, name_ita) VALUES (%s, %s) ON CONFLICT DO NOTHING", (role, role))
            vals.append((int(r["IDWork"]), int(r["IDAuthor"]), role))
        execute_values(cur, "INSERT INTO works_authors (work_id, author_id, role) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()
    print(f"  {len(rows)} authors_works.")

    # --- works_genres (idwork_idgenere) ---
    rows = mysql_query("SELECT IDWork, IDGenere, Livello FROM idwork_idgenere")
    if rows:
        vals = [(int(r["IDWork"]), int(r["IDGenere"]), positive_int(r.get("Livello")) or 0) for r in rows
                if int(r["IDWork"]) > 0 and int(r["IDGenere"]) > 0]
        if vals:
            execute_values(cur, "INSERT INTO works_genres (work_id, genre_id, level) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # --- work_works ---
    rows = mysql_query("SELECT IDWorkR, IDWork, Posizione FROM work_works")
    if rows:
        vals = [(int(r["IDWorkR"]), int(r["IDWork"]), positive_int(r.get("Posizione")) or 0) for r in rows]
        execute_values(cur, "INSERT INTO work_works (parent_work_id, child_work_id, position) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()
    print(f"  {len(rows)} work_works.")

    # =========================================================================
    # PHASE 5: Editions
    # =========================================================================

    print("[17/20] Migrating editions...")
    # Build sets of valid FK targets for editions
    cur.execute("SELECT id FROM languages")
    valid_lang_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT id FROM publishers")
    valid_pub_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT id FROM series")
    valid_ser_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT id FROM bindings")
    valid_bind_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT id FROM colors")
    valid_color_ids = {r[0] for r in cur.fetchall()}

    rows = mysql_query("""SELECT IDEdition, Title, SubTitle, PublishingYear, ACDC, IDLanguage, IDPublisher,
        IDSerie, nSerie, ISBN10, ISBN13, Pages, IDBinding, Height, Width, Thickness, Weight,
        IDColor, EditionApproved FROM editions""")
    if rows:
        vals = []
        for r in rows:
            lang_id = positive_int(r.get("IDLanguage"))
            if not lang_id or lang_id not in valid_lang_ids:
                lang_id = None
            pub_id = positive_int(r.get("IDPublisher"))
            if not pub_id or pub_id not in valid_pub_ids:
                pub_id = None
            ser_id = positive_int(r.get("IDSerie"))
            if not ser_id or ser_id not in valid_ser_ids:
                ser_id = None
            bind_id = positive_int(r.get("IDBinding"))
            if not bind_id or bind_id not in valid_bind_ids:
                bind_id = None
            color_id = positive_int(r.get("IDColor"))
            if color_id and color_id not in valid_color_ids:
                color_id = None
            vals.append((
                int(r["IDEdition"]),
                clean_text(r["Title"]) or "Edizione senza titolo",
                clean_text(r.get("SubTitle")),
                positive_int(r.get("PublishingYear")),
                int(r.get("ACDC") or 1),
                lang_id,
                pub_id,
                ser_id,
                positive_int(r.get("nSerie")),
                normalize_isbn(r.get("ISBN10")),
                normalize_isbn(r.get("ISBN13")),
                positive_int(r.get("Pages")),
                bind_id,
                positive_int(r.get("Height")),
                positive_int(r.get("Width")),
                positive_int(r.get("Thickness")),
                positive_int(r.get("Weight")),
                color_id,
                status_from_approved(r.get("EditionApproved")),
                "manual",
            ))
        execute_values(cur, """INSERT INTO editions (id, title, subtitle, publishing_year, publishing_era,
            language_id, publisher_id, series_id, series_number, isbn10, isbn13, pages,
            binding_id, height_mm, width_mm, thickness_mm, weight_g, color_id, status, source)
            VALUES %s ON CONFLICT DO NOTHING""", vals)
        cur.execute("SELECT setval('editions_id_seq', (SELECT COALESCE(MAX(id),0) FROM editions))")
    pg.commit()
    print(f"  {len(rows)} editions.")

    # --- editions_works (was works_editions) ---
    # Build valid ID sets
    cur.execute("SELECT id FROM editions")
    valid_edition_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT id FROM works")
    valid_work_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT id FROM authors")
    valid_author_ids = {r[0] for r in cur.fetchall()}

    print("  Migrating editions_works...")
    rows = mysql_query("SELECT IDEdition, IDWork FROM works_editions")
    if rows:
        vals = [(int(r["IDEdition"]), int(r["IDWork"]), 0) for r in rows
                if int(r["IDEdition"]) in valid_edition_ids and int(r["IDWork"]) in valid_work_ids]
        if vals:
            execute_values(cur, "INSERT INTO editions_works (edition_id, work_id, position) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()
    print(f"  {len(rows)} editions_works.")

    # --- editions_authors (authors_editions) ---
    rows = mysql_query("SELECT IDedition, IDAuthor, Authorrole FROM authors_editions")
    if rows:
        vals = []
        for r in rows:
            raw_role = (r["Authorrole"] or "translator").strip()
            role = ROLE_MAP.get(raw_role)
            if not role:
                role = ROLE_MAP.get(raw_role.lower(), raw_role.lower().replace("-", "_"))
            cur.execute("INSERT INTO author_roles (role, name_ita) VALUES (%s, %s) ON CONFLICT DO NOTHING", (role, role))
            eid = int(r["IDedition"])
            aid = int(r["IDAuthor"])
            if eid in valid_edition_ids and aid in valid_author_ids:
                vals.append((eid, aid, role))
        if vals:
            execute_values(cur, "INSERT INTO editions_authors (edition_id, author_id, role) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()
    print(f"  {len(rows)} editions_authors.")

    # =========================================================================
    # PHASE 6: Libraries, Shelves, Copies, Readings, Bookmarks
    # =========================================================================

    print("[18/20] Migrating libraries, shelves, copies, readings, bookmarks...")

    # --- Libraries ---
    rows = mysql_query("SELECT IDLibrary, IDMembre, Library, Location FROM libraries")
    if rows:
        vals = []
        for r in rows:
            vals.append((int(r["IDLibrary"]), None, clean_text(r.get("Library")) or "Library", clean_text(r.get("Location"))))
        execute_values(cur, "INSERT INTO libraries (id, owner_uuid, name, location) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('libraries_id_seq', (SELECT COALESCE(MAX(id),0) FROM libraries))")
    pg.commit()
    print(f"  {len(rows)} libraries.")

    # --- Shelves ---
    rows = mysql_query("""SELECT IDShelf, Shelf, Location, Share, Lunghezza, Width, Heigth,
        IDLibrary, ShelfOrdine, nLibri, IDMembre FROM shelves""")
    if rows:
        vals = []
        for r in rows:
            lib_id = positive_int(r.get("IDLibrary"))
            if not lib_id:
                continue
            vals.append((
                int(r["IDShelf"]),
                lib_id,
                clean_text(r.get("Shelf")) or "Shelf",
                clean_text(r.get("Location")),
                positive_int(r.get("ShelfOrdine")),
                positive_int(r.get("Lunghezza")),
                positive_int(r.get("Width")),
                positive_int(r.get("Heigth")),
                positive_int(r.get("nLibri")) or 0,
                is_shared(r.get("Share")),
            ))
        if vals:
            execute_values(cur, """INSERT INTO shelves (id, library_id, name, location, sort_order, length_mm, width_mm, height_mm, book_count, is_shared)
                VALUES %s ON CONFLICT DO NOTHING""", vals)
            cur.execute("SELECT setval('shelves_id_seq', (SELECT COALESCE(MAX(id),0) FROM shelves))")
    pg.commit()
    print(f"  {len(rows)} shelves.")

    # --- Copies ---
    rows = mysql_query("""SELECT IDCopy, ShareCopy, IDMembre, IDEdition, IDShelf, CodeCopy,
        dataAcquisto, IDTipoAcquisto, IDFriendEntrata, prezzo, commento, indice,
        dataUscita, IDTipoUscita, IDFriendUscita, commentoUscita, prezzoVendita FROM copies""")
    # Build valid FK sets for copies
    cur.execute("SELECT id FROM shelves")
    valid_shelf_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT id FROM friends")
    valid_friend_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT id FROM acquisition_types")
    valid_acq_type_ids = {r[0] for r in cur.fetchall()}

    if rows:
        vals = []
        for r in rows:
            shelf_id = positive_int(r.get("IDShelf"))
            if not shelf_id or shelf_id not in valid_shelf_ids:
                shelf_id = None
            edition_id = positive_int(r.get("IDEdition"))
            if edition_id and edition_id not in valid_edition_ids:
                edition_id = None
            vals.append((
                int(r["IDCopy"]),
                None,  # owner_uuid - will be set later
                edition_id,
                shelf_id,
                positive_int(r.get("CodeCopy")),
                safe_date(r.get("dataAcquisto")),
                positive_int(r.get("IDTipoAcquisto")) if positive_int(r.get("IDTipoAcquisto")) in valid_acq_type_ids else None,
                positive_int(r.get("IDFriendEntrata")) if positive_int(r.get("IDFriendEntrata")) in valid_friend_ids else None,
                float(r["prezzo"]) if r.get("prezzo") and r["prezzo"] != "NULL" else None,
                clean_text(r.get("commento")),
                positive_int(r.get("indice")),
                safe_date(r.get("dataUscita")),
                positive_int(r.get("IDTipoUscita")) if positive_int(r.get("IDTipoUscita")) in valid_acq_type_ids else None,
                positive_int(r.get("IDFriendUscita")) if positive_int(r.get("IDFriendUscita")) in valid_friend_ids else None,
                clean_text(r.get("commentoUscita")),
                float(r["prezzoVendita"]) if r.get("prezzoVendita") and r["prezzoVendita"] != "NULL" else None,
                is_shared(r.get("ShareCopy")),
                "approved",
                "manual",
            ))
        execute_values(cur, """INSERT INTO copies (id, owner_uuid, edition_id, shelf_id, barcode,
            acquisition_date, acquisition_type_id, acquisition_friend_id, price, condition_note, sort_index,
            disposal_date, disposal_type_id, disposal_friend_id, disposal_note, disposal_price,
            is_shared, status, source) VALUES %s ON CONFLICT DO NOTHING""", vals)
        cur.execute("SELECT setval('copies_id_seq', (SELECT COALESCE(MAX(id),0) FROM copies))")
    pg.commit()
    print(f"  {len(rows)} copies.")

    # --- Readings ---
    rows = mysql_query("""SELECT IDReading, ShareReading, IDEdition, IDMembre,
        StartDate, LastDate, PageBookmark, Finito, GradimentoMedio, IDFriend FROM readings""")
    if rows:
        vals = []
        for r in rows:
            eid = int(r["IDEdition"])
            if eid not in valid_edition_ids:
                continue
            friend_id = positive_int(r.get("IDFriend"))
            if friend_id and friend_id not in valid_friend_ids:
                friend_id = None
            vals.append((
                int(r["IDReading"]),
                None,  # owner_uuid
                int(r["IDMembre"]),
                eid,
                None,  # copy_id
                friend_id,
                safe_date(r.get("StartDate")),
                safe_date(r.get("LastDate")),
                positive_int(r.get("PageBookmark")) or 0,
                str(r.get("Finito", "f")).lower() == "v",
                "finished" if str(r.get("Finito", "f")).lower() == "v" else "active",
                safe_date(r.get("LastDate")) if str(r.get("Finito", "f")).lower() == "v" else None,
                float(r["GradimentoMedio"]) if r.get("GradimentoMedio") and float(r.get("GradimentoMedio", 0)) > 0 else None,
                is_shared(r.get("ShareReading")),
            ))
        execute_values(cur, """INSERT INTO readings (id, owner_uuid, owner_membre_id, edition_id, copy_id, friend_id,
            start_date, end_date, current_page, finished, status, status_changed_at, rating, is_shared) VALUES %s ON CONFLICT DO NOTHING""", vals)
        cur.execute("SELECT setval('readings_id_seq', (SELECT COALESCE(MAX(id),0) FROM readings))")
    pg.commit()
    print(f"  {len(rows)} readings.")

    # --- Bookmarks ---
    # Build valid reading IDs
    cur.execute("SELECT id FROM readings")
    valid_reading_ids = {r[0] for r in cur.fetchall()}

    rows = mysql_query("""SELECT IDBookmark, IDReading, BookmarkDate, Bookmark, BookmarkComment,
        ShareComment, Gradimento, UseGradimento FROM bookmarks""")
    if rows:
        vals = []
        for r in rows:
            rid = int(r["IDReading"])
            if rid not in valid_reading_ids:
                continue
            vals.append((
                int(r["IDBookmark"]),
                int(r["IDReading"]),
                positive_int(r.get("Bookmark")) or 0,
                safe_date(r.get("BookmarkDate")),
                clean_text(r.get("BookmarkComment")),
                float(r["Gradimento"]) if r.get("Gradimento") and float(r.get("Gradimento", 0)) > 0 else None,
                str(r.get("UseGradimento", "v")).lower() == "v",
                is_shared(r.get("ShareComment")),
            ))
        execute_values(cur, """INSERT INTO bookmarks (id, reading_id, page, bookmark_date, note, rating, use_rating, is_public)
            VALUES %s ON CONFLICT DO NOTHING""", vals)
        cur.execute("SELECT setval('bookmarks_id_seq', (SELECT COALESCE(MAX(id),0) FROM bookmarks))")
    pg.commit()
    print(f"  {len(rows)} bookmarks.")

    # =========================================================================
    # PHASE 7: Tags, Links, Sharing, Messages, Extracts, QuoteReferences
    # =========================================================================

    print("[19/20] Migrating tags, links, sharing, messages...")

    # --- Tags ---
    rows = mysql_query("SELECT IDTag, Tag, IDLanguage FROM tags")
    if rows:
        vals = [(int(r["IDTag"]), clean_text(r["Tag"]) or "?", positive_int(r.get("IDLanguage")), "00000000-0000-0000-0000-000000000000") for r in rows]
        execute_values(cur, "INSERT INTO tags (id, name, language_id, created_by_uuid) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('tags_id_seq', (SELECT COALESCE(MAX(id),0) FROM tags))")
    pg.commit()

    # Build valid tag/link IDs
    cur.execute("SELECT id FROM tags")
    valid_tag_ids = {r[0] for r in cur.fetchall()}

    # --- works_tags ---
    rows = mysql_query("SELECT IDWork, IDTag FROM works_tags")
    if rows:
        vals = [(int(r["IDWork"]), int(r["IDTag"]), "00000000-0000-0000-0000-000000000000") for r in rows
                if int(r["IDWork"]) in valid_work_ids and int(r["IDTag"]) in valid_tag_ids]
        if vals:
            execute_values(cur, "INSERT INTO works_tags (work_id, tag_id, created_by_uuid) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # --- editions_tags ---
    rows = mysql_query("SELECT IDEdition, IDTag FROM editions_tags")
    if rows:
        vals = [(int(r["IDEdition"]), int(r["IDTag"]), "00000000-0000-0000-0000-000000000000") for r in rows
                if int(r["IDEdition"]) in valid_edition_ids and int(r["IDTag"]) in valid_tag_ids]
        if vals:
            execute_values(cur, "INSERT INTO editions_tags (edition_id, tag_id, created_by_uuid) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # --- authors_tags ---
    rows = mysql_query("SELECT IDAuthor, IDTag FROM authors_tags")
    if rows:
        vals = [(int(r["IDAuthor"]), int(r["IDTag"]), "00000000-0000-0000-0000-000000000000") for r in rows
                if int(r["IDAuthor"]) in valid_author_ids and int(r["IDTag"]) in valid_tag_ids]
        if vals:
            execute_values(cur, "INSERT INTO authors_tags (author_id, tag_id, created_by_uuid) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # --- Links ---
    rows = mysql_query("SELECT IDLink, Url, IDLanguage, IDMembre FROM links")
    if rows:
        vals = [(int(r["IDLink"]), clean_text(r["Url"]) or "?", positive_int(r.get("IDLanguage")), "00000000-0000-0000-0000-000000000000") for r in rows]
        execute_values(cur, "INSERT INTO links (id, url, language_id, created_by_uuid) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('links_id_seq', (SELECT COALESCE(MAX(id),0) FROM links))")
    pg.commit()

    cur.execute("SELECT id FROM links")
    valid_link_ids = {r[0] for r in cur.fetchall()}

    # --- works_links ---
    rows = mysql_query("SELECT IDWork, IDLink FROM works_links")
    if rows:
        vals = [(int(r["IDWork"]), int(r["IDLink"])) for r in rows
                if int(r["IDWork"]) in valid_work_ids and int(r["IDLink"]) in valid_link_ids]
        if vals:
            execute_values(cur, "INSERT INTO works_links (work_id, link_id) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # --- editions_links ---
    rows = mysql_query("SELECT IDEdition, IDLink FROM editions_links")
    if rows:
        vals = [(int(r["IDEdition"]), int(r["IDLink"])) for r in rows
                if int(r["IDEdition"]) in valid_edition_ids and int(r["IDLink"]) in valid_link_ids]
        if vals:
            execute_values(cur, "INSERT INTO editions_links (edition_id, link_id) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # --- authors_links ---
    rows = mysql_query("SELECT IDAuthor, IDLink FROM authors_links")
    if rows:
        vals = [(int(r["IDAuthor"]), int(r["IDLink"])) for r in rows
                if int(r["IDAuthor"]) in valid_author_ids and int(r["IDLink"]) in valid_link_ids]
        if vals:
            execute_values(cur, "INSERT INTO authors_links (author_id, link_id) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # --- Sharing tables ---
    cur.execute("SELECT id FROM libraries")
    valid_library_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT id FROM membres")
    valid_membre_ids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT id FROM permissions")
    valid_perm_ids = {r[0] for r in cur.fetchall()}

    rows = mysql_query("SELECT IDLibrary, IDMembre, IDDiritti FROM share_libraries")
    if rows:
        vals = [(int(r["IDLibrary"]), int(r["IDMembre"]), positive_int(r.get("IDDiritti"))) for r in rows
                if int(r["IDLibrary"]) in valid_library_ids and int(r["IDMembre"]) in valid_membre_ids]
        if vals:
            execute_values(cur, "INSERT INTO share_libraries (library_id, membre_id, permission_id) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # Valid FK sets for sharing
    valid_fk_sets = {
        "author_id": valid_author_ids,
        "edition_id": valid_edition_ids,
        "publisher_id": valid_pub_ids,
        "serie_id": valid_ser_ids,
        "work_id": valid_work_ids,
    }

    for table_legacy, table_new, col1, col2 in [
        ("sharing_membre_author", "sharing_membre_author", "Author", "author_id"),
        ("sharing_membre_edition", "sharing_membre_edition", "IDEdition", "edition_id"),
        ("sharing_membre_publisher", "sharing_membre_publisher", "IDPublisher", "publisher_id"),
        ("sharing_membre_serie", "sharing_membre_serie", "IDSerie", "serie_id"),
        ("sharing_membre_work", "sharing_membre_work", "IDWork", "work_id"),
    ]:
        membre_col = "Membre" if table_legacy == "sharing_membre_author" else "IDMembre"
        rows = mysql_query(f"SELECT {col1}, {membre_col} FROM {table_legacy}")
        if rows:
            fk_valid = valid_fk_sets.get(col2, set())
            vals = [(int(r[col1]), int(r[membre_col])) for r in rows
                    if int(r[col1]) in fk_valid and int(r[membre_col]) in valid_membre_ids]
            if vals:
                execute_values(cur, f"INSERT INTO {table_new} ({col2}, membre_id) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # --- Messages (import row by row to handle HTML content with tabs/newlines) ---
    # First get message IDs and metadata without body
    msg_meta = mysql_query("SELECT IDMessaggio, IDMembreInvio, IDMembreDestinatario, Oggetto, Letto, MittenteVisibile, DestinatarioVisibile FROM messages")
    msg_count = 0
    if msg_meta:
        for m in msg_meta:
            try:
                mid = int(m["IDMessaggio"])
                sender = positive_int(m.get("IDMembreInvio"))
                recipient = positive_int(m.get("IDMembreDestinatario"))
                if not sender or not recipient:
                    continue
                if sender not in valid_membre_ids or recipient not in valid_membre_ids:
                    continue
                # Fetch body separately via hex encoding to avoid tab/newline issues
                body_cmd = [
                    "docker", "exec", MYSQL_CONTAINER,
                    "mysql", "-u", "root", "--batch", "--raw",
                    "-e", f"USE {MYSQL_DB}; SELECT HEX(Messaggio) FROM messages WHERE IDMessaggio = {mid};",
                ]
                body_result = subprocess.run(body_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
                body = None
                if body_result.returncode == 0:
                    blines = body_result.stdout.strip().split("\n")
                    if len(blines) > 1 and blines[1] != "NULL":
                        try:
                            body = bytes.fromhex(blines[1]).decode("utf-8", errors="replace")
                        except (ValueError, UnicodeDecodeError):
                            body = None

                cur.execute(
                    """INSERT INTO messages (id, sender_id, recipient_id, subject, body, is_read, sender_visible, recipient_visible)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
                    (mid, sender, recipient, clean_text(m.get("Oggetto")), body,
                     str(m.get("Letto", "0")) == "1",
                     str(m.get("MittenteVisibile", "1")) == "1",
                     str(m.get("DestinatarioVisibile", "1")) == "1")
                )
                msg_count += 1
            except (ValueError, TypeError):
                continue
        if msg_count > 0:
            cur.execute("SELECT setval('messages_id_seq', (SELECT COALESCE(MAX(id),0) FROM messages))")
    pg.commit()
    print(f"  {msg_count} messages.")

    # --- Quote references ---
    rows = mysql_query("SELECT IDQuoteReference, IDWork, Arttype, Artist, Artwork, Condividi, Approved FROM quotereferences")
    if rows:
        vals = []
        for r in rows:
            wid = int(r["IDWork"])
            if wid not in valid_work_ids:
                continue
            vals.append((
                int(r["IDQuoteReference"]),
                wid,
                positive_int(r.get("Arttype")),
                clean_text(r.get("Artist")),
                clean_text(r.get("Artwork")),
                is_shared(r.get("Condividi")),
                status_from_approved(r.get("Approved")),
            ))
        if vals:
            execute_values(cur, """INSERT INTO quote_references (id, work_id, art_type_id, artist, artwork, is_shared, status)
                VALUES %s ON CONFLICT DO NOTHING""", vals)
        cur.execute("SELECT setval('quote_references_id_seq', (SELECT COALESCE(MAX(id),0) FROM quote_references))")
    pg.commit()
    print(f"  {len(rows)} quote_references.")

    # --- Arguments ---
    rows = mysql_query("SELECT IDArgument, Argument, Descrizione FROM arguments")
    if rows:
        vals = [(int(r["IDArgument"]), clean_text(r.get("Argument")), clean_text(r.get("Descrizione"))) for r in rows]
        execute_values(cur, "INSERT INTO arguments (id, name, description) VALUES %s ON CONFLICT DO NOTHING", vals)
        cur.execute("SELECT setval('arguments_id_seq', (SELECT COALESCE(MAX(id),0) FROM arguments))")
    pg.commit()

    rows = mysql_query("SELECT IDArgument, IDLanguage, Argument, Descrizione FROM argument_traduzione")
    if rows:
        vals = [(int(r["IDArgument"]), int(r["IDLanguage"]), clean_text(r["Argument"]) or "?", clean_text(r.get("Descrizione"))) for r in rows]
        execute_values(cur, "INSERT INTO argument_translations (argument_id, language_id, name, description) VALUES %s ON CONFLICT DO NOTHING", vals)
    pg.commit()

    # =========================================================================
    # PHASE 8: Summary & verification
    # =========================================================================

    print()
    print("[20/20] Verifying migration...")
    tables_to_check = [
        "languages", "nations", "bindings", "colors", "currencies", "author_roles",
        "genres", "membres", "friends", "publishers", "series", "authors",
        "works", "works_authors", "works_genres", "work_works",
        "editions", "editions_works", "editions_authors",
        "libraries", "shelves", "copies", "readings", "bookmarks",
        "tags", "links", "messages", "quote_references", "arguments",
        "sharing_membre_author", "sharing_membre_edition", "sharing_membre_publisher",
        "sharing_membre_serie", "sharing_membre_work", "share_libraries",
    ]
    print()
    print(f"{'Table':<30} {'Rows':>8}")
    print("-" * 40)
    for t in tables_to_check:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        count = cur.fetchone()[0]
        print(f"{t:<30} {count:>8}")

    pg.commit()

    # =========================================================================
    # PHASE 9: UUID mapping for Piero Radice (IDMembre = 1)
    # =========================================================================

    print()
    piero_uuid = None
    if len(sys.argv) > 1:
        piero_uuid = sys.argv[1]
        print(f"[UUID] Mapping Piero Radice (IDMembre=1) to UUID: {piero_uuid}")
    else:
        # Generate a deterministic UUID from email
        import uuid as uuid_mod
        piero_uuid = str(uuid_mod.uuid5(uuid_mod.NAMESPACE_URL, "radice.p@gmail.com"))
        print(f"[UUID] Generated UUID for Piero Radice: {piero_uuid}")

    # Update membre.uuid
    cur.execute("UPDATE membres SET uuid = %s WHERE id = 1", (piero_uuid,))

    # Map copies owned by membre 1 (IDMembre in legacy) to UUID
    # Legacy copies had IDMembre - we need to find which copies belong to membre 1
    # Re-query legacy to get the membre mapping
    copy_membre_rows = mysql_query("SELECT IDCopy, IDMembre FROM copies")
    piero_copy_ids = [int(r["IDCopy"]) for r in copy_membre_rows if int(r.get("IDMembre", 0)) == 1]
    if piero_copy_ids:
        cur.execute(f"UPDATE copies SET owner_uuid = %s WHERE id = ANY(%s)", (piero_uuid, piero_copy_ids))
        print(f"  Updated {len(piero_copy_ids)} copies with Piero's UUID")

    # Map readings owned by membre 1
    reading_membre_rows = mysql_query("SELECT IDReading, IDMembre FROM readings")
    piero_reading_ids = [int(r["IDReading"]) for r in reading_membre_rows if int(r.get("IDMembre", 0)) == 1]
    if piero_reading_ids:
        cur.execute(f"UPDATE readings SET owner_uuid = %s WHERE id = ANY(%s)", (piero_uuid, piero_reading_ids))
        print(f"  Updated {len(piero_reading_ids)} readings with Piero's UUID")

    # Map libraries owned by membre 1
    lib_membre_rows = mysql_query("SELECT IDLibrary, IDMembre FROM libraries")
    piero_lib_ids = [int(r["IDLibrary"]) for r in lib_membre_rows if int(r.get("IDMembre", 0)) == 1]
    if piero_lib_ids:
        cur.execute(f"UPDATE libraries SET owner_uuid = %s WHERE id = ANY(%s)", (piero_uuid, piero_lib_ids))
        print(f"  Updated {len(piero_lib_ids)} libraries with Piero's UUID")

    pg.commit()

    # =========================================================================
    # PHASE 10: Refresh search_vector for all editions
    # =========================================================================

    print()
    print("[SEARCH] Refreshing search_vector for all editions...")
    # Touch every edition to re-fire the BEFORE UPDATE trigger with relational data now in place
    cur.execute("UPDATE editions SET updated_at = NOW()")
    pg.commit()
    cur.execute("SELECT COUNT(*) FROM editions WHERE search_vector IS NOT NULL")
    sv_count = cur.fetchone()[0]
    print(f"  {sv_count} editions with search_vector populated.")

    # Final count
    print()
    print("=== Migration complete! ===")
    print()
    cur.execute("SELECT COUNT(*) FROM copies WHERE owner_uuid IS NOT NULL")
    print(f"Copies with UUID: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM copies WHERE owner_uuid IS NULL")
    print(f"Copies without UUID: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM readings WHERE owner_uuid IS NOT NULL")
    print(f"Readings with UUID: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM readings WHERE owner_uuid IS NULL")
    print(f"Readings without UUID: {cur.fetchone()[0]}")

    cur.close()
    pg.close()


if __name__ == "__main__":
    main()
