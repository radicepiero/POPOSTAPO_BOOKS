import json

SRC = r"C:\Users\radic\Documents\Git\POPOSTAPO_BOOKS\schema_summary.json"
TABLES = ['works', 'editions', 'authors', 'copies', 'series', 'publishers', 'readings', 'bookmarks', 'tags', 'libraries', 'membre', 'links']

data = {t['name']: t for t in json.load(open(SRC, encoding='utf-8'))}

for name in TABLES:
    t = data[name]
    print(f"\n=== {name} ({len(t['columns'])} colonne) ===")
    for c in t['columns']:
        parts = [c['name'], c['type']]
        if not c.get('nullable'): parts.append('NOT NULL')
        if c.get('auto_increment'): parts.append('AUTO_INCREMENT')
        if c.get('default') is not None: parts.append(f"DEFAULT {c['default']}")
        if c.get('comment'): parts.append(f"COMMENT {c['comment']}")
        print('  ' + ' '.join(parts))
