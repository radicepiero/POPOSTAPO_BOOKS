import re, json, sys, os

DUMP = r"C:\Users\radic\Downloads\eauy_popostapo_dump_sql_2023-04-27_16-16-05.sql\eauy_popostapo_dump_sql_2023-04-27_16-16-05.sql"


def split_top_level(s):
    items = []
    level = 0
    start = 0
    in_string = False
    string_char = None
    i = 0
    while i < len(s):
        ch = s[i]
        if in_string:
            if ch == '\\' and i + 1 < len(s):
                i += 1
            elif ch == string_char:
                in_string = False
        else:
            if ch in ("'", '"'):
                in_string = True
                string_char = ch
            elif ch == '(':
                level += 1
            elif ch == ')':
                level -= 1
            elif ch == ',' and level == 0:
                item = s[start:i].strip()
                if item:
                    items.append(item)
                start = i + 1
        i += 1
    tail = s[start:].strip()
    if tail:
        items.append(tail)
    return items


def parse_table(body):
    items = split_top_level(body)
    columns = []
    constraints = []
    for it in items:
        it = it.strip()
        if not it:
            continue
        m = re.match(r'^`([^`]+)`\s+(.+)$', it)
        if m and not it.upper().startswith(('PRIMARY KEY', 'UNIQUE KEY', 'KEY ', 'INDEX ', 'CONSTRAINT ', 'FULLTEXT KEY', 'SPATIAL KEY')):
            col_name = m.group(1)
            rest = m.group(2)
            col = {'name': col_name, 'type': ''}
            # tipo fino a spazio o parentesi?
            tm = re.match(r'([A-Za-z]+(?:\([^\)]+\))?)\s*(.*)', rest)
            if tm:
                col['type'] = tm.group(1)
                rest2 = tm.group(2)
                col['nullable'] = not ('NOT NULL' in rest2.upper())
                col['auto_increment'] = 'AUTO_INCREMENT' in rest2.upper()
                col['unsigned'] = 'UNSIGNED' in rest2.upper()
                defm = re.search(r"DEFAULT\s+('[^']*'|\"[^\"]*\"|[^\s,]+)", rest2, re.IGNORECASE)
                col['default'] = defm.group(1) if defm else None
                if 'DEFAULT CURRENT_TIMESTAMP' in rest2.upper():
                    col['default'] = 'CURRENT_TIMESTAMP'
                colm = re.search(r"COMMENT\s+'([^']*)'", rest2)
                col['comment'] = colm.group(1) if colm else None
            columns.append(col)
        else:
            constraints.append(it)
    return columns, constraints


def main():
    with open(DUMP, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()

    # Estrae CREATE TABLE ... ;
    pattern = re.compile(
        r'CREATE TABLE(?:\s+IF NOT EXISTS)?\s+`?([^`\s(]+)`?\s*\((.*?)\)\s*'
        r'(?:ENGINE|DEFAULT CHARSET|CHARSET|COLLATE|COMMENT|;|$)',
        re.IGNORECASE | re.DOTALL
    )
    tables = []
    for m in re.finditer(pattern, text):
        name = m.group(1)
        body = m.group(2)
        cols, constraints = parse_table(body)
        tables.append({
            'name': name,
            'columns': cols,
            'constraints': constraints
        })

    # Stampo un riepilogo in formato testo compatto
    for t in tables:
        print(f"\n## TABLE: {t['name']}")
        for c in t['columns']:
            flags = []
            if not c.get('nullable'): flags.append('NOT NULL')
            if c.get('auto_increment'): flags.append('AUTO_INCREMENT')
            if c.get('unsigned'): flags.append('UNSIGNED')
            if c.get('default') is not None: flags.append(f"DEFAULT {c['default']}")
            if c.get('comment'): flags.append(f"COMMENT '{c['comment']}'")
            print(f"  - {c['name']}: {c['type']} {' '.join(flags)}")
        if t['constraints']:
            print("  CONSTRAINTS:")
            for cn in t['constraints']:
                print(f"    {cn}")

    # Salva JSON per uso futuro
    out = os.path.join(os.path.dirname(__file__), 'schema_summary.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(tables, f, ensure_ascii=False, indent=2)
    print(f"\n[Schema JSON salvato in {out}]")


if __name__ == '__main__':
    main()
