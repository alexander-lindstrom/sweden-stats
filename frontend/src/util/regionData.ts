interface RegionData {
    code: string;
    name: string;
    type: 'region' | 'municipality';
    parentRegion?: string;
  }
  
export class RegionLookup {
    private lookupTable: Map<string, RegionData>;
    private regionCache: Map<string, RegionData[]>;
  
    constructor(data: Record<string, string>) {
      this.lookupTable = new Map();
      this.regionCache = new Map();
      
      for (const [code, name] of Object.entries(data)) {
        const entry: RegionData = {
          code,
          name,
          type: code.length === 2 ? 'region' : 'municipality'
        };
        
        if (entry.type === 'municipality') {
          entry.parentRegion = code.substring(0, 2);
        }
        
        this.lookupTable.set(code, entry);
      }
    }
  
    get(code: string): RegionData | undefined {
      return this.lookupTable.get(code);
    }
  
    getMunicipalitiesInRegion(regionCode: string): RegionData[] {
      if (this.regionCache.has(regionCode)) {
        return this.regionCache.get(regionCode)!;
      }
      
      const municipalities: RegionData[] = [];
      
      this.lookupTable.forEach((entry) => {
        if (entry.type === 'municipality' && entry.parentRegion === regionCode) {
          municipalities.push(entry);
        }
      });
      
      municipalities.sort((a, b) => a.name.localeCompare(b.name));
      
      this.regionCache.set(regionCode, municipalities);
      return municipalities;
    }
  
    getAllRegions(): RegionData[] {
      const regions: RegionData[] = [];
      
      this.lookupTable.forEach((entry) => {
        if (entry.type === 'region') {
          regions.push(entry);
        }
      });
      
      regions.sort((a, b) => a.code.localeCompare(b.code));
      
      return regions;
    }
  
    // Search by name (case insensitive, partial match)
    searchByName(query: string): RegionData[] {
      const results: RegionData[] = [];
      const lowerQuery = query.toLowerCase();
      
      this.lookupTable.forEach((entry) => {
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          results.push(entry);
        }
      });
      
      return results;
    }
  }
  