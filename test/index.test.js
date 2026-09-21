import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareEnvFiles, parseEnvFile } from "../dist/index.js";

function writeEnvPair(pairs) {
  const dir = mkdtempSync(join(tmpdir(), "envdrift-"));
  const files = [];
  for (const [name, body] of Object.entries(pairs)) {
    const path = join(dir, name);
    writeFileSync(path, body);
    files.push(path);
  }
  return { files, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("two host:port values are not a protocol mismatch", () => {
  // WHATWG URL parses localhost:5432 with scheme "localhost:", so the old
  // check reported a bogus mismatch and failed CI on plain database hosts.
  const { files, cleanup } = writeEnvPair({
    "a.env": "DB_HOST=localhost:5432\n",
    "b.env": "DB_HOST=staging-db.internal:5432\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.deepEqual(result.valueAnomalies, []);
    assert.equal(result.clean, true);
  } finally {
    cleanup();
  }
});

test("a URL next to a plain host is not a protocol mismatch", () => {
  // Only values inferType classifies as URLs take part in the comparison,
  // so the host contributes no protocol to differ from.
  const { files, cleanup } = writeEnvPair({
    "a.env": "API_URL=http://api.local:8080/dev\n",
    "b.env": "API_URL=localhost:8080\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.deepEqual(result.valueAnomalies, []);
  } finally {
    cleanup();
  }
});

test("http and https URLs across files are still a protocol mismatch", () => {
  const { files, cleanup } = writeEnvPair({
    "a.env": "API_ENDPOINT=http://api.example.com/v1\n",
    "b.env": "API_ENDPOINT=https://api.example.com/v1\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.equal(result.valueAnomalies.length, 1);
    assert.match(result.valueAnomalies[0].reason, /Protocol mismatch across files \(http: vs https:\)/);
  } finally {
    cleanup();
  }
});

test("a value that is only an inline comment parses as empty", () => {
  // bash and dotenv give KEY an empty value when everything after = is a
  // comment. The strip ran on the trimmed value, where no whitespace was left
  // in front of the #, so the comment text survived as the value and read as
  // drift against a file with a genuinely empty KEY.
  const { files, cleanup } = writeEnvPair({
    "a.env": "FEATURE_FLAG= # TODO enable in prod\n",
    "b.env": "FEATURE_FLAG=\n",
  });
  try {
    assert.equal(parseEnvFile(files[0]).FEATURE_FLAG, "");
    const result = compareEnvFiles(files);
    assert.deepEqual(result.valueAnomalies, []);
    assert.equal(result.clean, true);
  } finally {
    cleanup();
  }
});

test("a sentence that starts with your is not a placeholder", () => {
  // The pattern matched the bare word "your" as a prefix, so a welcome
  // message like "your account is ready" was flagged as a placeholder next
  // to a real value and failed CI. A placeholder needs the separator form,
  // as in your-api-key or your_token.
  const { files, cleanup } = writeEnvPair({
    "a.env": "WELCOME=your account is ready\n",
    "b.env": "WELCOME=account ready\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.deepEqual(result.valueAnomalies, []);
    assert.equal(result.clean, true);
  } finally {
    cleanup();
  }
});

test("example.com is a working origin, not a placeholder marker", () => {
  // "example" also matched as a bare prefix, which swallowed the reserved
  // but fully functional domain. Only a standalone "example", or one
  // followed by something other than a domain character, reads as a
  // placeholder.
  const { files, cleanup } = writeEnvPair({
    "a.env": "CORS_ORIGIN=example.com\n",
    "b.env": "CORS_ORIGIN=api.mycorp.dev\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.deepEqual(result.valueAnomalies, []);
    assert.equal(result.clean, true);
  } finally {
    cleanup();
  }
});

test("separator-form placeholders next to real values are still flagged", () => {
  // Tightening the prefixes must not stop real placeholders from being
  // reported: your-api-key-here, a standalone example, and <replace-me>
  // all stay placeholder tokens.
  const { files, cleanup } = writeEnvPair({
    "a.env": "API_KEY=your-api-key-here\nDB_NAME=example\nHOOK_URL=<replace-me>\n",
    "b.env": "API_KEY=sk-live-3f9c2a\nDB_NAME=orders_prod\nHOOK_URL=https://hooks.internal/\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.deepEqual(
      result.valueAnomalies.map((a) => a.key).sort(),
      ["API_KEY", "DB_NAME", "HOOK_URL"]
    );
    assert.match(result.valueAnomalies[0].reason, /Placeholder value detected/);
  } finally {
    cleanup();
  }
});

test("backslash n inside double quotes expands to a real newline", () => {
  // dotenv expands \n in double-quoted values, so one file writing the two
  // characters backslash and n and another writing a physical line break hold
  // the same value. Keeping the literal backslash made the pair fingerprint
  // differently and read as drift in the redacted report.
  const { files, cleanup } = writeEnvPair({
    "a.env": 'CERT="-----BEGIN-----\\nKEY\\n-----END-----"\n',
    "b.env": 'CERT="-----BEGIN-----\nKEY\n-----END-----"\n',
  });
  try {
    const escaped = parseEnvFile(files[0]).CERT;
    assert.equal(escaped, "-----BEGIN-----\nKEY\n-----END-----");
    assert.equal(parseEnvFile(files[1]).CERT, escaped);
  } finally {
    cleanup();
  }
});

test("a hash inside an unquoted value survives comment stripping", () => {
  // A comment starts at whitespace before the #, so a value that begins with
  // or contains # without preceding whitespace keeps it, as in bash.
  const { files, cleanup } = writeEnvPair({
    "a.env": "COLOR=#fff\nTOKEN=a#b\nLOG_LEVEL=debug # verbose staging builds\n",
  });
  try {
    const parsed = parseEnvFile(files[0]);
    assert.equal(parsed.COLOR, "#fff");
    assert.equal(parsed.TOKEN, "a#b");
    assert.equal(parsed.LOG_LEVEL, "debug");
  } finally {
    cleanup();
  }
});

test("missing keys across files are identified with present and missing locations", () => {
  // Drift detection requires knowing which files define a key and which
  // files omit it, so differences between deployment targets can be resolved.
  const { files, cleanup } = writeEnvPair({
    "a.env": "PORT=3000\nSHARED_KEY=secret\n",
    "b.env": "DATABASE_URL=postgres://localhost:5432/db\nSHARED_KEY=secret\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.equal(result.clean, false);
    assert.deepEqual(result.missingKeys, [
      {
        key: "PORT",
        presentIn: [files[0]],
        missingFrom: [files[1]],
      },
      {
        key: "DATABASE_URL",
        presentIn: [files[1]],
        missingFrom: [files[0]],
      },
    ]);
  } finally {
    cleanup();
  }
});

test("type mismatches across boolean, number, string, path, and url are detected", () => {
  // Inconsistent value shapes across environments indicate configuration drift
  // that can cause runtime type errors after deployment.
  const { files, cleanup } = writeEnvPair({
    "a.env": [
      "IS_ENABLED=true",
      "PORT=8080",
      "RETRY_COUNT=5",
      "CONFIG_FILE=/etc/app/config.json",
      "WEBHOOK_URL=https://hooks.example.com",
      "LOG_DIR=./logs",
    ].join("\n") + "\n",
    "b.env": [
      "IS_ENABLED=yes",
      "PORT=production",
      "RETRY_COUNT=false",
      "CONFIG_FILE=https://example.com/config.json",
      "WEBHOOK_URL=disabled",
      "LOG_DIR=console",
    ].join("\n") + "\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.equal(result.clean, false);
    const mismatches = Object.fromEntries(
      result.typeMismatches.map((m) => [m.key, m.types])
    );
    assert.deepEqual(mismatches, {
      IS_ENABLED: { [files[0]]: "boolean", [files[1]]: "string" },
      PORT: { [files[0]]: "number", [files[1]]: "string" },
      RETRY_COUNT: { [files[0]]: "number", [files[1]]: "boolean" },
      CONFIG_FILE: { [files[0]]: "path", [files[1]]: "url" },
      WEBHOOK_URL: { [files[0]]: "url", [files[1]]: "string" },
      LOG_DIR: { [files[0]]: "path", [files[1]]: "string" },
    });
  } finally {
    cleanup();
  }
});

test("ignoreKeys excludes specified keys from drift detection", () => {
  // Shared files often have intentionally unaligned keys such as local ports
  // or machine specific paths that callers exclude from CI validation.
  const { files, cleanup } = writeEnvPair({
    "a.env": "LOCAL_PORT=3000\nSHARED=production\nUNSHARED_KEY=secret\n",
    "b.env": "LOCAL_PORT=production\nSHARED=production\n",
  });
  try {
    const unignored = compareEnvFiles(files);
    assert.equal(unignored.clean, false);
    assert.equal(unignored.missingKeys.length, 1);
    assert.equal(unignored.missingKeys[0].key, "UNSHARED_KEY");
    assert.equal(unignored.typeMismatches.length, 1);
    assert.equal(unignored.typeMismatches[0].key, "LOCAL_PORT");

    const ignored = compareEnvFiles(files, ["LOCAL_PORT", "UNSHARED_KEY"]);
    assert.deepEqual(ignored.missingKeys, []);
    assert.deepEqual(ignored.typeMismatches, []);
    assert.deepEqual(ignored.valueAnomalies, []);
    assert.equal(ignored.clean, true);
  } finally {
    cleanup();
  }
});

test("keys named after Object prototype properties do not crash or report false presence", () => {
  // Using the in operator checked the prototype chain of the parsed object,
  // so keys such as constructor, toString, or valueOf looked present in files
  // that omitted them. The native prototype function was then passed to
  // inferType, which threw a TypeError when calling value.toLowerCase.
  const { files, cleanup } = writeEnvPair({
    "a.env": "constructor=service\ntoString=custom\n",
    "b.env": "PORT=3000\n",
  });
  try {
    const result = compareEnvFiles(files);
    assert.equal(result.clean, false);
    const missingKeysByName = Object.fromEntries(
      result.missingKeys.map((m) => [m.key, m])
    );
    assert.deepEqual(missingKeysByName.constructor, {
      key: "constructor",
      presentIn: [files[0]],
      missingFrom: [files[1]],
    });
    assert.deepEqual(missingKeysByName.toString, {
      key: "toString",
      presentIn: [files[0]],
      missingFrom: [files[1]],
    });
    assert.deepEqual(missingKeysByName.PORT, {
      key: "PORT",
      presentIn: [files[1]],
      missingFrom: [files[0]],
    });
  } finally {
    cleanup();
  }
});

test("a key named __proto__ is preserved as an own property and tracked for drift", () => {
  // Initializing the parsed map as a plain object invoked Object.prototype.__proto__
  // setter instead of defining an own property, silently dropping the key from
  // Object.keys and comparison.
  const { files, cleanup } = writeEnvPair({
    "a.env": "__proto__=polluted\n",
    "b.env": "PORT=3000\n",
  });
  try {
    const parsedA = parseEnvFile(files[0]);
    assert.equal(Object.hasOwn(parsedA, "__proto__"), true);
    assert.equal(parsedA["__proto__"], "polluted");

    const result = compareEnvFiles(files);
    assert.equal(result.clean, false);
    const missingKeysByName = Object.fromEntries(
      result.missingKeys.map((m) => [m.key, m])
    );
    assert.deepEqual(missingKeysByName.__proto__, {
      key: "__proto__",
      presentIn: [files[0]],
      missingFrom: [files[1]],
    });
  } finally {
    cleanup();
  }
});

