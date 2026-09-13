import argparse
from collections import defaultdict
from datetime import date
from typing import Any

from sqlalchemy import func, select, text

from backend.database import engine
from backend.legacy_dry_run import LANGUAGE_CODE_MAP, QUERIES, ROLE_MAP, clean_text, normalize_isbn, positive_int, read_table, status, valid_date
from backend.models import Author, AuthorRole, Binding, Color, Copy, CopyEnrichmentJob, Edition, EditionsAuthor, Form, Genre, Language, Nation, Publisher, Series, Work, WorksAuthor


CONFIRMATION = "REPLACE_TEST_DATA_WITH_LEGACY"


def parsed_date(value: Any) -> date | None:
    normalized = valid_date(value)
    return date.fromisoformat(normalized) if normalized else None


def prepare(container: str, database: str) -> tuple[dict[str, list[dict]], list[str]]:
    source = {name: read_table(container, database, query) for name, query in QUERIES.items()}
    warnings: list[str] = []
    source_ids = {name: {row["id"] for row in rows if "id" in row} for name, rows in source.items()}

    language_groups: dict[str, list[dict]] = defaultdict(list)
    for row in source["languages"]:
        code = LANGUAGE_CODE_MAP.get(clean_text(row["name"]) or "")
        if code:
            language_groups[code].append(row)
    language_id_map = {
        row["id"]: min(item["id"] for item in language_groups[code])
        for code, rows in language_groups.items()
        for row in rows
    }
    languages = [
        {"id": min(row["id"] for row in rows), "code": code, "name": clean_text(rows[0]["name"]) or code}
        for code, rows in sorted(language_groups.items())
    ]

    edition_to_work: dict[int, int] = {}
    for row in source["works_editions"]:
        if row["work_id"] not in source_ids["works"]:
            raise ValueError(f"Relazione {row['id']} verso opera inesistente {row['work_id']}")
        if row["edition_id"] not in source_ids["editions"]:
            warnings.append(f"Relazione {row['id']} verso edizione inesistente {row['edition_id']} ignorata")
            continue
        previous = edition_to_work.get(row["edition_id"])
        if previous is not None and previous != row["work_id"]:
            raise ValueError(f"Edizione {row['edition_id']} collegata a più opere")
        edition_to_work[row["edition_id"]] = row["work_id"]

    rows = {
        "author_roles": [
            {"role": ROLE_MAP[row["role"]], "name_ita": clean_text(row["name_ita"]) or ROLE_MAP[row["role"]]}
            for row in source["authorroles"] if row["role"] in ROLE_MAP
        ],
        "languages": languages,
        "nations": [
            {"id": row["id"], "code": None, "name": clean_text(row["name"]) or "Sconosciuta", "name_ita": clean_text(row["name_ita"]) or clean_text(row["name"]) or "Sconosciuta"}
            for row in source["nations"]
        ],
        "forms": [
            {"id": row["id"], "name": clean_text(row["name"]) or "Sconosciuta", "name_ita": None}
            for row in source["forms"]
        ],
        "genres": [
            {"id": row["id"], "name": clean_text(row["name"]) or "Sconosciuto", "name_ita": None, "parent_id": None}
            for row in source["genres"]
        ],
        "bindings": [
            {"id": row["id"], "name": clean_text(row["name"]) or "Sconosciuta", "name_ita": None}
            for row in source["bindings"]
        ],
        "colors": [
            {"id": row["id"], "name": clean_text(row["name"]) or "Sconosciuto"}
            for row in source["colors"]
        ],
        "publishers": [
            {"id": row["id"], "name": clean_text(row["name"]) or "Editore sconosciuto", "nation_id": row["nation_id"] if row["nation_id"] in source_ids["nations"] else None, "website": clean_text(row["website"]), "status": status(row["approved"]), "source": "legacy_popostapo"}
            for row in source["publishers"]
        ],
        "series": [
            {"id": row["id"], "publisher_id": row["publisher_id"] if row["publisher_id"] in source_ids["publishers"] else None, "name": clean_text(row["name"]) or "Collana sconosciuta"}
            for row in source["series"]
        ],
        "authors": [
            {"id": row["id"], "given_name": clean_text(row["given_name"]) or "", "family_name": clean_text(row["family_name"]) or "", "acronym_name": clean_text(row["acronym_name"]), "acronym_family_name": clean_text(row["acronym_family_name"]), "birth_date": parsed_date(row["born"]), "death_date": parsed_date(row["died"]), "birth_nation_id": row["nation_id"] if row["nation_id"] in source_ids["nations"] else None, "status": status(row["approved"]), "source": "legacy_popostapo"}
            for row in source["authors"]
        ],
        "works": [
            {"id": row["id"], "original_title": clean_text(row["title"]) or "Titolo sconosciuto", "original_subtitle": clean_text(row["subtitle"]), "publishing_year": positive_int(row["year"]), "original_language_id": language_id_map.get(row["language_id"]), "form_id": row["form_id"] if row["form_id"] in source_ids["forms"] else None, "genre_id": row["genre_id"] if row["genre_id"] in source_ids["genres"] else None, "status": status(row["approved"]), "source": "legacy_popostapo"}
            for row in source["works"]
        ],
        "works_authors": [
            {"work_id": row["work_id"], "author_id": row["author_id"], "role": ROLE_MAP[row["role"]]}
            for row in source["authors_works"]
            if row["work_id"] in source_ids["works"] and row["author_id"] in source_ids["authors"] and row["role"] in ROLE_MAP
        ],
        "editions": [
            {"id": row["id"], "work_id": edition_to_work.get(row["id"]), "title": clean_text(row["title"]) or "Edizione senza titolo", "subtitle": clean_text(row["subtitle"]), "publishing_year": positive_int(row["year"]), "language_id": language_id_map.get(row["language_id"]), "publisher_id": row["publisher_id"] if row["publisher_id"] in source_ids["publishers"] else None, "series_id": row["series_id"] if row.get("series_id") in source_ids["series"] else None, "isbn10": normalize_isbn(row["isbn10"]) if len(str(row.get("isbn10") or "").replace("-", "").replace(" ", "")) == 10 else None, "isbn13": normalize_isbn(row["isbn13"]) if len(str(row.get("isbn13") or "").replace("-", "").replace(" ", "")) == 13 else None, "pages": positive_int(row["pages"]), "binding_id": row["binding_id"] if row["binding_id"] in source_ids["bindings"] else None, "height_mm": positive_int(row["height_mm"]), "width_mm": positive_int(row["width_mm"]), "thickness_mm": positive_int(row["thickness_mm"]), "weight_g": positive_int(row["weight_g"]), "color_id": row["color_id"] if row.get("color_id") in source_ids["colors"] else None, "status": status(row["approved"]), "source": "legacy_popostapo"}
            for row in source["editions"]
        ],
        "editions_authors": [
            {"edition_id": row["edition_id"], "author_id": row["author_id"], "role": ROLE_MAP[row["role"]]}
            for row in source["authors_editions"]
            if row["edition_id"] in source_ids["editions"] and row["author_id"] in source_ids["authors"] and row["role"] in ROLE_MAP
        ],
    }
    if any(row["work_id"] is None for row in rows["editions"]):
        warnings.append("Le edizioni senza opera saranno importate con work_id NULL")
    if any(language_id not in language_id_map for language_id in {row["language_id"] for row in [*source["works"], *source["editions"]]}):
        warnings.append("Le lingue non identificate saranno importate come NULL")
    return rows, warnings


def apply(rows: dict[str, list[dict]]) -> None:
    tables = [
        (AuthorRole.__table__, "author_roles"),
        (Language.__table__, "languages"),
        (Nation.__table__, "nations"),
        (Form.__table__, "forms"),
        (Genre.__table__, "genres"),
        (Binding.__table__, "bindings"),
        (Color.__table__, "colors"),
        (Publisher.__table__, "publishers"),
        (Series.__table__, "series"),
        (Author.__table__, "authors"),
        (Work.__table__, "works"),
        (WorksAuthor.__table__, "works_authors"),
        (Edition.__table__, "editions"),
        (EditionsAuthor.__table__, "editions_authors"),
    ]
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE copy_enrichment_jobs, copies, editions_authors, works_authors, editions, works, authors, series, publishers, author_roles, languages, nations, forms, genres, bindings, colors RESTART IDENTITY CASCADE"))
        for table, key in tables:
            if rows[key]:
                connection.execute(table.insert(), rows[key])
        for table in (Language, Nation, Form, Genre, Binding, Color, Publisher, Series, Author, Work, Edition):
            connection.execute(text(f"SELECT setval(pg_get_serial_sequence('{table.__tablename__}', 'id'), COALESCE((SELECT MAX(id) FROM {table.__tablename__}), 1), true)"))
        expected = {"authors": len(rows["authors"]), "works": len(rows["works"]), "editions": len(rows["editions"])}
        for table_name, count in expected.items():
            actual = connection.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one()
            if actual != count:
                raise RuntimeError(f"Conteggio {table_name}: atteso {count}, ottenuto {actual}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Importazione transazionale del catalogo bibliografico legacy")
    parser.add_argument("--container", default="popostapo-legacy-mysql")
    parser.add_argument("--database", default="eauy_popostapo")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm")
    args = parser.parse_args()
    rows, warnings = prepare(args.container, args.database)
    print("Piano di importazione:")
    for name, values in rows.items():
        print(f"  {name:20} {len(values):5}")
    for warning in warnings:
        print(f"  WARN: {warning}")
    if not args.apply:
        print("Dry-run completato: PostgreSQL non modificato.")
        return 0
    if args.confirm != CONFIRMATION:
        raise SystemExit(f"Per applicare specificare --confirm {CONFIRMATION}")
    apply(rows)
    print("Importazione PostgreSQL completata e verificata nella stessa transazione.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
