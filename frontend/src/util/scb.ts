export interface PopulationQueryArgs {
  regionCodes?: string[];
  ages?: string[];
  sexes?: string[];
  contentCodes?: string[];
  month?: string;
}

export interface JsonStatCategory {
  index: Record<string, number>;
  label: Record<string, string>;
  unit?: Record<string, { decimals?: number; label?: string; position?: string; }>;
}
export interface JsonStatDimension {
  label: string; category: JsonStatCategory; link?: { describedby?: Array<{ href: string }>; };
}
export interface JsonStatRole { time?: string[]; geo?: string[]; metric?: string[]; }
export interface JsonStat2Response {
  class: "dataset"; version: "2.0"; label?: string; source?: string; updated?: string;
  href?: string; id: string[]; size: number[]; dimension: Record<string, JsonStatDimension>;
  value: (number | null | string)[]; role?: JsonStatRole; extension?: Record<string, any>;
  note?: string[];
}

// --- Helper function to build the SCB API query body (ALTERNATIVE STRUCTURE) ---
const LATEST_KNOWN_MONTH = "2024M12";

// Variable mapping from our args to SCB API's expected variableCode aliases
const VARIABLE_CODE_MAP = {
  region: "Region",
  ages: "Alder",
  sexes: "Kon",
  contents: "ContentsCode", // Assuming contentCodes maps to ContentsCode
  month: "Tid"
};

// Default values from the /defaultselection endpoint, to be used when "all" is intended
const DEFAULT_SELECTIONS = {
  [VARIABLE_CODE_MAP.contents]: { valueCodes: ["000003O5"] }, // Default for "Folkmängd"
  [VARIABLE_CODE_MAP.month]: { valueCodes: [LATEST_KNOWN_MONTH] },
  [VARIABLE_CODE_MAP.sexes]: { valueCodes: ["1", "2"] }, // Default for men and women
  [VARIABLE_CODE_MAP.region]: { codeList: "vs_HelaRiket", valueCodes: ["00"] }, // Default "Hela Riket"
  [VARIABLE_CODE_MAP.ages]: { codeList: "vs_Ålder1årA", valueCodes: [] } // Default all ages from this value set
};

export function buildScbApiRequestBody(args: PopulationQueryArgs) {
  const selections: any[] = [];

  // Region
  if (args.regionCodes && args.regionCodes.length > 0) {
    selections.push({ variableCode: VARIABLE_CODE_MAP.region, valueCodes: args.regionCodes });
  } else {
    selections.push({ variableCode: VARIABLE_CODE_MAP.region, ...DEFAULT_SELECTIONS[VARIABLE_CODE_MAP.region] });
  }

  // Ages
  if (args.ages && args.ages.length > 0) {
    selections.push({ variableCode: VARIABLE_CODE_MAP.ages, valueCodes: args.ages });
  } else {
    // For "all ages", we use the default which implies all from vs_Ålder1årA
    selections.push({ variableCode: VARIABLE_CODE_MAP.ages, ...DEFAULT_SELECTIONS[VARIABLE_CODE_MAP.ages] });
  }

  // Sexes
  if (args.sexes && args.sexes.length > 0) {
    selections.push({ variableCode: VARIABLE_CODE_MAP.sexes, valueCodes: args.sexes });
  } else {
    selections.push({ variableCode: VARIABLE_CODE_MAP.sexes, ...DEFAULT_SELECTIONS[VARIABLE_CODE_MAP.sexes] });
  }

  // ContentsCode (tabellinnehåll)
  if (args.contentCodes && args.contentCodes.length > 0) {
    selections.push({ variableCode: VARIABLE_CODE_MAP.contents, valueCodes: args.contentCodes });
  } else {
    selections.push({ variableCode: VARIABLE_CODE_MAP.contents, ...DEFAULT_SELECTIONS[VARIABLE_CODE_MAP.contents] });
  }

  // Month (Tid)
  selections.push({
    variableCode: VARIABLE_CODE_MAP.month,
    valueCodes: [args.month || LATEST_KNOWN_MONTH]
  });

  return {
    selection: selections
    // No "response" object here, as outputFormat will be in URL
    // No "placement" object, as it's usually optional for data retrieval
  };
}