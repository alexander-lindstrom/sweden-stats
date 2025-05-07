import json

def convert_to_typescript(input_file, output_file):
    # Read the input JSON file
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Extract the labels dictionary
    labels = data.get('label', {})
    
    # Generate TypeScript content
    ts_content = "export const REGION_DATA = {\n"
    
    # Add each entry with proper formatting
    for code, name in sorted(labels.items()):
        ts_content += f'  "{code}": "{name}",\n'
    
    ts_content = ts_content.rstrip(',\n') + "\n} as const;\n"
    
    # Write to output file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(ts_content)
    
    print(f"Successfully converted {len(labels)} entries to {output_file}")

# Example usage:
if __name__ == "__main__":
    input_json_file = "data/scb/regions.json"
    output_ts_file = "regions.ts"
    
    convert_to_typescript(input_json_file, output_ts_file)