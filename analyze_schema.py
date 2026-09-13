import json

SRC = r"C:\Users\radic\Documents\Git\POPOSTAPO_BOOKS\schema_summary.json"

data = json.load(open(SRC, encoding='utf-8'))
print(f"Totale tabelle: {len(data)}\n")
for t in data:
    print(f"{t['name']:30} {len(t['columns']):2} colonne")
