import csv
import json
from collections import defaultdict

def make_revenue_sunburst_structure(csv_path):
    data_per_year = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))

    with open(csv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            # Skip rows with no title — likely to be non-standard rows
            if not row["Inkomsttitelsnamn utfallsår"].strip():
                continue

            year = row["År"]
            income_type = row["Inkomsttypsnamn utfallsår"]
            main_group = row["Inkomsthuvudgruppsnamn utfallsår"]
            title = row["Inkomsttitelsnamn utfallsår"]

            try:
                amount = float(row["Utfall"].replace(',', '.'))
            except:
                continue

            data_per_year[year][income_type][(main_group, title)] += amount

    sunburst_per_year = {}
    for year, types in data_per_year.items():
        children = []
        for type_name, titles in types.items():
            type_children_dict = defaultdict(list)
            for (main_group_name, title_name), value in titles.items():
                type_children_dict[main_group_name].append({
                    "name": title_name,
                    "value": value
                })
            type_children = [
                {"name": main_group_name, "children": children}
                for main_group_name, children in type_children_dict.items()
            ]
            children.append({
                "name": type_name,
                "children": type_children
            })

        sunburst_per_year[year] = {
            "name": f"Total Revenue {year}",
            "children": children
        }

    return sunburst_per_year

output = make_revenue_sunburst_structure("data/esv/inkomster_2006_2024.csv")
with open("revenues_by_year.json", "w", encoding="utf-8") as out:
    json.dump(output, out, ensure_ascii=False, indent=2)
