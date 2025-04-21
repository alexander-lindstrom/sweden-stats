import csv
import json
from collections import defaultdict

def make_sunburst_structure(csv_path):
    data_per_year = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))

    with open(csv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            year = row["År"]
            area = row["Utgiftsområdesnamn"]
            category = row["Anslagsnamn"]
            try:
                amount = float(row["Utfall"].replace(',', '.'))
            except:
                continue
            data_per_year[year][area][category] += amount

    sunburst_per_year = {}
    for year, areas in data_per_year.items():
        children = []
        for area_name, categories in areas.items():
            area_children = [
                {"name": category_name, "value": value}
                for category_name, value in categories.items()
            ]
            children.append({
                "name": area_name,
                "children": area_children
            })
        sunburst_per_year[year] = {
            "name": f"Total Budget {year}",
            "children": children
        }

    return sunburst_per_year

output = make_sunburst_structure("data/esv/utgifter_1997_2024.csv")
with open("expenses_by_year.json", "w", encoding="utf-8") as out:
    json.dump(output, out, ensure_ascii=False, indent=2)
