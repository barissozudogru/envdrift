# envdrift

Detect environment variable drift across `.env` files. Compares multiple `.env` files and reports missing keys, type mismatches, and value anomalies between environments.

## Installation

```bash
npm install -g @barissozudogru/envdrift
```

Or use directly with npx:

```bash
npx @barissozudogru/envdrift .env .env.staging .env.production
```

## Usage

### Auto-detect

Run in a directory containing `.env*` files and `envdrift` will pick them all up automatically:

```bash
cd /your/project
envdrift
```

### Explicit files

```bash
envdrift .env .env.staging .env.production
```

### Options

```
-h, --help              Show help
-v, --version           Show version
    --json              Output results as JSON (useful for CI pipelines)
-i, --ignore <keys>     Comma-separated list of keys to exclude from comparison
                        Can be repeated: --ignore KEY1 --ignore KEY2
```

## What it detects

### Missing keys

A key present in some files but absent in others:

```
MISSING KEYS  (1)
──────────────────────────────────────────────────
  ✖ STRIPE_WEBHOOK_SECRET
    present in:   .env.production
    missing from: .env, .env.staging
```

### Type mismatches

The same key holds values of different inferred types across files:

```
TYPE MISMATCHES  (1)
──────────────────────────────────────────────────
  ! MAX_CONNECTIONS
    .env: number
    .env.staging: string
```

Detected types: `boolean`, `number`, `url`, `path`, `string`.

### Value anomalies

Values that look inconsistent - placeholders, empty vs set, protocol mismatches:

```
VALUE ANOMALIES  (1)
──────────────────────────────────────────────────
  ~ DATABASE_URL  Placeholder value detected in .env
    .env: your-database-url-here
    .env.production: postgres://user:pass@host:5432/db
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0`  | No drift detected |
| `1`  | Drift detected or error |

## CI integration

### GitHub Actions

```yaml
name: Check env drift

on: [pull_request]

jobs:
  env-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx @barissozudogru/envdrift .env.example .env.ci
```

### Pre-commit hook

```bash
#!/bin/sh
npx @barissozudogru/envdrift .env.example .env
if [ $? -ne 0 ]; then
  echo "Env drift detected. Fix before committing."
  exit 1
fi
```

## Programmatic API

```typescript
import { compareEnvFiles, parseEnvFile, inferType } from "@barissozudogru/envdrift";

const result = compareEnvFiles([".env", ".env.production"]);

if (!result.clean) {
  console.log("Missing keys:", result.missingKeys);
  console.log("Type mismatches:", result.typeMismatches);
  console.log("Value anomalies:", result.valueAnomalies);
}
```

### `parseEnvFile(path: string): EnvMap`

Parses a `.env` file into a key-value map. Handles comments, blank lines, quoted values, and inline comments.

### `inferType(value: string): ValueType`

Infers the semantic type of a value. Returns one of: `"boolean"`, `"number"`, `"url"`, `"path"`, `"string"`.

### `compareEnvFiles(files: string[]): DriftResult`

Compares all provided files and returns a structured result:

```typescript
interface DriftResult {
  files: string[];
  missingKeys: MissingKey[];
  typeMismatches: TypeMismatch[];
  valueAnomalies: ValueAnomaly[];
  clean: boolean;
}
```

## License

MIT - 2026 Baris Sozudogru
