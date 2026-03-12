<h1 align="center">envdrift</h1>

<p align="center">
  Detect environment variable drift across your .env files before it causes production bugs.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js >= 18">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat" alt="MIT License">
  <img src="https://img.shields.io/badge/Zero_Dependencies-brightgreen?style=flat" alt="Zero Dependencies">
</p>

---

## What It Does

envdrift compares two or more `.env` files and surfaces keys that are missing in some environments, values whose inferred types differ across files, and values that look like placeholders or contain protocol mismatches. It is designed to be used as a local check, a pre-commit hook, or a CI step that fails the build when drift is detected.

---

## Quick Start

Install globally:

```bash
npm install -g @barissozudogru/envdrift
```

Or run without installing:

```bash
npx @barissozudogru/envdrift .env .env.staging .env.production
```

---

## Usage

### Auto-detect

Run in any project directory and envdrift will pick up all `.env*` files automatically:

```bash
cd /your/project
envdrift
```

### Explicit files

```bash
envdrift .env .env.staging .env.production
```

### JSON output for CI pipelines

```bash
envdrift --json .env .env.production
```

### Ignore specific keys

```bash
envdrift --ignore SECRET_KEY,INTERNAL_TOKEN .env .env.production
envdrift --ignore SECRET_KEY --ignore INTERNAL_TOKEN .env .env.production
```

---

## Options

| Flag | Short | Description |
|---|---|---|
| `--help` | `-h` | Show help message |
| `--version` | `-v` | Show version number |
| `--json` | | Output results as JSON |
| `--ignore <keys>` | `-i` | Comma-separated keys to exclude from comparison. Can be repeated. |

---

## Example Output

```
envdrift - environment drift report
──────────────────────────────────────────────────

Comparing files:
  • .env.development
  • .env.production

MISSING KEYS  (2)
──────────────────────────────────────────────────
  x STRIPE_WEBHOOK_SECRET
    present in:   .env.production
    missing from: .env.development

  x REDIS_URL
    present in:   .env.development, .env.production
    missing from: .env.staging

TYPE MISMATCHES  (1)
──────────────────────────────────────────────────
  ! MAX_CONNECTIONS
    .env.development: number
    .env.production: string

VALUE ANOMALIES  (2)
──────────────────────────────────────────────────
  ~ DATABASE_URL  Placeholder value detected in .env.development
    .env.development: your-database-url-here
    .env.production: postgres://user:pass@prod-host:5432/mydb

  ~ API_ENDPOINT  Protocol mismatch across files (http: vs https:)
    .env.development: http://api.internal.example.com
    .env.production: https://api.example.com

Summary: 2 missing  1 type mismatch  2 anomalies
```

---

## CI Integration

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
      - name: Check for environment variable drift
        run: npx @barissozudogru/envdrift .env.example .env.ci
```

### Pre-commit hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/sh
npx @barissozudogru/envdrift .env.example .env
if [ $? -ne 0 ]; then
  echo "Env drift detected. Fix before committing."
  exit 1
fi
```

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | No drift detected, all files are in sync |
| `1` | Drift detected or an error occurred |

---

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

Parses a `.env` file into a key-value map. Handles comments, blank lines, quoted values, inline comments, `export` prefixes, and multiline double-quoted values.

### `inferType(value: string): ValueType`

Infers the semantic type of a value. Returns one of: `"boolean"`, `"number"`, `"url"`, `"path"`, `"string"`.

### `compareEnvFiles(files: string[], ignoreKeys?: string[]): DriftResult`

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

---

## License

MIT - 2026 Baris Sozudogru
