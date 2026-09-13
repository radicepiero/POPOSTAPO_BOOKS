import argparse
import json
import re
import subprocess
from collections import Counter, defaultdict
from datetime import datetime
from typing import Any


ROLE_MAP = {
    "Author": "author",
    "Co-Author": "co_author",
    "Editor": "editor",
    "Translator": "translator",
}

LANGUAGE_CODE_MAP = {
    "Akan": "ak",
    "Danish": "da",
    "Dutch": "nl",
    "English": "en",
    "French": "fr",
    "German": "de",
    "Greek": "el",
    "Hebrew": "he",
    "Italian": "it",
    "Japanese": "ja",
    "Norwegian": "no",
    "Portuguese": "pt",
    "Russian": "ru",
    "Spanish": "es",
    "Swedish": "sv",
    "Turkish": "tr",
}

QUERIES = {
    "authorroles": "SELECT JSON_OBJECT('role',Authorrole,'name_ita',Authorrole_ITA) FROM authorroles",
    "bindings": "SELECT JSON_OBJECT('id',IDBinding,'name',Binding,'description',BindingDescription) FROM bindings",
    "colors": "SELECT JSON_OBJECT('id',IDColor,'name',Color) FROM colors",
    "forms": "SELECT JSON_OBJECT('id',IDForm,'name',Form,'description',FormDescription) FROM forms",
    "genres": "SELECT JSON_OBJECT('id',IDGenre,'family',FictionNonfiction,'name',Genre,'description',GenreDescription) FROM genres",
    "languages": "SELECT JSON_OBJECT('id',IDLanguage,'name',Language,'wiki_prefix',WikiPrefix) FROM languages",
    "nations": "SELECT JSON_OBJECT('id',IDNation,'name',Nation,'name_ita',Nation_ITA) FROM nations",
    "publishers": "SELECT JSON_OBJECT('id',IdPublisher,'name',Publisher,'nation_id',Nation,'website',Link,'approved',Approved) FROM publishers",
    "series": "SELECT JSON_OBJECT('id',IDSerie,'publisher_id',IDPublisher,'name',Serie,'approved',Approved) FROM series",
    "authors": "SELECT JSON_OBJECT('id',IdAuthor,'given_name',Name,'family_name',Surname,'acronym_name',AcronimusName,'acronym_family_name',AcronimusSurname,'nation_id',IDNazioneNascita,'born',CAST(Born AS CHAR),'died',CAST(Died AS CHAR),'approved',AuthorApproved) FROM authors",
    "works": "SELECT JSON_OBJECT('id',IDWork,'title',OriginalTitle,'subtitle',OriginalSubTitle,'year',PublishingYear,'language_id',OriginalLanguage,'form_id',IDForm,'genre_id',IDGenre,'approved',WorkApproved) FROM works",
    "authors_works": "SELECT JSON_OBJECT('id',IDAuthor_Works,'work_id',IDWork,'author_id',IdAuthor,'role',Authorrole) FROM authors_works",
    "editions": "SELECT JSON_OBJECT('id',IDedition,'title',Title,'subtitle',SubTitle,'year',PublishingYear,'language_id',Language,'publisher_id',Publisher,'pages',Pages,'binding_id',Binding,'isbn10',ISBN10,'isbn13',ISBN13,'series_id',IDSerie,'height_mm',Height,'width_mm',Width,'thickness_mm',Thickness,'weight_g',Weight,'color_id',IDColor,'approved',EditionApproved) FROM editions",
    "works_editions": "SELECT JSON_OBJECT('id',IDWork_Edition,'edition_id',IDEdition,'work_id',IDWork) FROM works_editions",
    "authors_editions": "SELECT JSON_OBJECT('id',IDauthors_editions,'edition_id',IDedition,'author_id',IdAuthor,'role',Authorrole) FROM authors_editions",
}


def read_table(container: str, database: str, query: str) -> list[dict[str, Any]]:
    command = [
        "docker", "exec", container, "mysql", "-uroot", "-N", "-B", "-r",
        "--default-character-set=utf8mb4", database, "-e", query,
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8")
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def positive_int(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def valid_date(value: Any) -> str | None:
    text = clean_text(value)
    if not text or text.startswith(("0000-", "1000-")):
        return None
    try:
        return datetime.strptime(text, "%Y-%m-%d").date().isoformat()
    except ValueError:
        return None


def normalize_isbn(value: Any) -> str | None:
    text = re.sub(r"[^0-9X]", "", str(value or "").upper())
    if len(text) == 13 and text.isdigit():
        checksum = sum(int(digit) * (1 if index % 2 == 0 else 3) for index, digit in enumerate(text[:12]))
        return text if (10 - checksum % 10) % 10 == int(text[-1]) else None
    if re.fullmatch(r"\d{9}[\dX]", text):
        checksum = sum((10 - index) * (10 if digit == "X" else int(digit)) for index, digit in enumerate(text))
        return text if checksum % 11 == 0 else None
    return None


def status(value: Any) -> str:
    return "approved" if clean_text(value) == "v" else "proposed"


def run(container: str, database: str, sample_size: int) -> int:
    tables = {name: read_table(container, database, query) for name, query in QUERIES.items()}
    ids = {name: {row["id"] for row in rows if "id" in row} for name, rows in tables.items()}
    warnings: list[str] = []
    errors: list[str] = []

    language_codes: dict[int, str] = {}
    for row in tables["languages"]:
        code = LANGUAGE_CODE_MAP.get(clean_text(row["name"]) or "")
        if code:
            language_codes[row["id"]] = code

    used_language_ids = {
        row["language_id"] for row in [*tables["works"], *tables["editions"]] if row.get("language_id")
    }
    unresolved_languages = sorted(used_language_ids - language_codes.keys())
    if unresolved_languages:
        warnings.append(f"Lingue non identificate trasformate in NULL: {unresolved_languages}")

    edition_to_work: dict[int, int] = {}
    for row in tables["works_editions"]:
        if row["work_id"] not in ids["works"]:
            errors.append(f"works_editions {row['id']}: opera {row['work_id']} inesistente")
        elif row["edition_id"] not in ids["editions"]:
            warnings.append(f"works_editions {row['id']}: edizione {row['edition_id']} inesistente")
        elif row["edition_id"] in edition_to_work and edition_to_work[row["edition_id"]] != row["work_id"]:
            errors.append(f"Edizione {row['edition_id']} collegata a più opere")
        else:
            edition_to_work[row["edition_id"]] = row["work_id"]

    transformed = {
        "author_roles": [
            {"role": ROLE_MAP[row["role"]], "name_ita": clean_text(row["name_ita"])}
            for row in tables["authorroles"] if row["role"] in ROLE_MAP
        ],
        "languages": [
            {"legacy_id": row["id"], "code": language_codes[row["id"]], "name": clean_text(row["name"])}
            for row in tables["languages"] if row["id"] in language_codes
        ],
        "nations": [
            {"legacy_id": row["id"], "code": None, "name": clean_text(row["name"]), "name_ita": clean_text(row["name_ita"])}
            for row in tables["nations"]
        ],
        "forms": [
            {"legacy_id": row["id"], "name": clean_text(row["name"]), "name_ita": None}
            for row in tables["forms"]
        ],
        "genres": [
            {"legacy_id": row["id"], "name": clean_text(row["name"]), "name_ita": None, "parent_id": None}
            for row in tables["genres"]
        ],
        "bindings": [
            {"legacy_id": row["id"], "name": clean_text(row["name"]), "name_ita": None}
            for row in tables["bindings"]
        ],
        "colors": [
            {"legacy_id": row["id"], "name": clean_text(row["name"])}
            for row in tables["colors"]
        ],
        "publishers": [
            {"legacy_id": row["id"], "name": clean_text(row["name"]), "nation_legacy_id": row["nation_id"], "website": clean_text(row["website"]), "status": status(row["approved"]), "source": "legacy_popostapo"}
            for row in tables["publishers"]
        ],
        "series": [
            {"legacy_id": row["id"], "publisher_legacy_id": row["publisher_id"], "name": clean_text(row["name"])}
            for row in tables["series"]
        ],
        "authors": [
            {"legacy_id": row["id"], "given_name": clean_text(row["given_name"]) or "", "family_name": clean_text(row["family_name"]) or "", "acronym_name": clean_text(row["acronym_name"]), "acronym_family_name": clean_text(row["acronym_family_name"]), "birth_nation_legacy_id": positive_int(row["nation_id"]), "birth_date": valid_date(row["born"]), "death_date": valid_date(row["died"]), "status": status(row["approved"]), "source": "legacy_popostapo"}
            for row in tables["authors"]
        ],
        "works": [
            {"legacy_id": row["id"], "original_title": clean_text(row["title"]) or "", "original_subtitle": clean_text(row["subtitle"]), "publishing_year": positive_int(row["year"]), "original_language_legacy_id": row["language_id"] if row["language_id"] in language_codes else None, "form_legacy_id": row["form_id"], "genre_legacy_id": row["genre_id"], "status": status(row["approved"]), "source": "legacy_popostapo"}
            for row in tables["works"]
        ],
        "works_authors": [
            {"work_legacy_id": row["work_id"], "author_legacy_id": row["author_id"], "role": ROLE_MAP.get(row["role"])}
            for row in tables["authors_works"]
        ],
        "editions": [
            {"legacy_id": row["id"], "work_legacy_id": edition_to_work.get(row["id"]), "title": clean_text(row["title"]) or "", "subtitle": clean_text(row["subtitle"]), "publishing_year": positive_int(row["year"]), "language_legacy_id": row["language_id"] if row["language_id"] in language_codes else None, "publisher_legacy_id": row["publisher_id"], "series_legacy_id": positive_int(row["series_id"]) if row.get("series_id") in ids["series"] else None, "isbn10": normalize_isbn(row["isbn10"]) if len(re.sub(r"[^0-9X]", "", str(row.get("isbn10") or "").upper())) == 10 else None, "isbn13": normalize_isbn(row["isbn13"]) if len(re.sub(r"\D", "", str(row.get("isbn13") or ""))) == 13 else None, "pages": positive_int(row["pages"]), "binding_legacy_id": row["binding_id"], "height_mm": positive_int(row["height_mm"]), "width_mm": positive_int(row["width_mm"]), "thickness_mm": positive_int(row["thickness_mm"]), "weight_g": positive_int(row["weight_g"]), "color_legacy_id": positive_int(row["color_id"]) if row.get("color_id") in ids["colors"] else None, "status": status(row["approved"]), "source": "legacy_popostapo"}
            for row in tables["editions"]
        ],
        "editions_authors": [
            {"edition_legacy_id": row["edition_id"], "author_legacy_id": row["author_id"], "role": ROLE_MAP.get(row["role"])}
            for row in tables["authors_editions"]
        ],
    }

    for row in transformed["works_authors"]:
        if row["work_legacy_id"] not in ids["works"] or row["author_legacy_id"] not in ids["authors"] or not row["role"]:
            errors.append(f"Relazione opera-autore non importabile: {row}")
    for row in transformed["editions_authors"]:
        if row["edition_legacy_id"] not in ids["editions"] or row["author_legacy_id"] not in ids["authors"] or not row["role"]:
            errors.append(f"Relazione edizione-autore non importabile: {row}")
    for row in transformed["editions"]:
        if not row["work_legacy_id"]:
            warnings.append(f"Edizione {row['legacy_id']} senza opera, work_id sarà NULL")

    invalid_isbn10 = sum(1 for row in tables["editions"] if clean_text(row["isbn10"]) not in (None, "0") and not normalize_isbn(row["isbn10"]))
    invalid_isbn13 = sum(1 for row in tables["editions"] if clean_text(row["isbn13"]) not in (None, "0") and not normalize_isbn(row["isbn13"]))
    warnings.extend([
        f"ISBN-10 non validi preservati solo nel legacy: {invalid_isbn10}",
        f"ISBN-13 non validi preservati solo nel legacy: {invalid_isbn13}",
        f"Lingue legacy non utilizzate e non mappate: {len(ids['languages'] - language_codes.keys())}",
    ])

    print("DRY-RUN MIGRAZIONE BIBLIOGRAFICA")
    print(f"Container: {container} | Database: {database}")
    print("\nRecord sorgente:")
    for name in QUERIES:
        print(f"  {name:20} {len(tables[name]):5}")
    print("\nRecord trasformati:")
    for name, rows in transformed.items():
        print(f"  {name:20} {len(rows):5}")
    print("\nStati trasformati:")
    for entity in ("authors", "works", "editions", "publishers"):
        print(f"  {entity:20} {dict(Counter(row['status'] for row in transformed[entity]))}")
    print(f"\nErrori bloccanti: {len(errors)}")
    for message in errors[:20]:
        print(f"  ERROR: {message}")
    print(f"\nAvvisi: {len(warnings)}")
    for message in warnings[:20]:
        print(f"  WARN: {message}")
    if sample_size:
        print("\nCampioni trasformati:")
        for entity in ("authors", "works", "editions"):
            print(f"  {entity}: {json.dumps(transformed[entity][:sample_size], ensure_ascii=False)}")
    print("\nNessuna connessione o scrittura PostgreSQL eseguita.")
    return 1 if errors else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Dry-run in sola lettura della migrazione bibliografica legacy")
    parser.add_argument("--container", default="popostapo-legacy-mysql")
    parser.add_argument("--database", default="eauy_popostapo")
    parser.add_argument("--sample-size", type=int, default=2)
    args = parser.parse_args()
    return run(args.container, args.database, max(0, args.sample_size))


if __name__ == "__main__":
    raise SystemExit(main())
