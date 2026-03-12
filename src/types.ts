export type ValueType = "boolean" | "number" | "url" | "path" | "string";

export interface EnvMap {
  [key: string]: string;
}

export interface MissingKey {
  key: string;
  presentIn: string[];
  missingFrom: string[];
}

export interface TypeMismatch {
  key: string;
  types: Record<string, ValueType>;
}

export interface ValueAnomaly {
  key: string;
  values: Record<string, string>;
  reason: string;
}

export interface DriftResult {
  files: string[];
  missingKeys: MissingKey[];
  typeMismatches: TypeMismatch[];
  valueAnomalies: ValueAnomaly[];
  clean: boolean;
}
