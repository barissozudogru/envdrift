import { test } from "node:test";
import assert from "node:assert/strict";
import { describeValue, fingerprint, redactResult } from "../dist/redact.js";

test("describeValue never echoes any part of the value", () => {
  const secret = "sk-or-v1-7e61d2cf7b2686c23f9eabc9093946434735d7fdc93081b3";
  const out = describeValue(secret);
  assert.ok(!out.includes("sk-or"), "leaked the key prefix");
  assert.ok(!out.includes("7e61"), "leaked the first bytes of the key");
  for (let i = 0; i + 6 <= secret.length; i += 3) {
    assert.ok(!out.includes(secret.slice(i, i + 6)), `leaked substring at ${i}`);
  }
});

test("describeValue reports length and character class", () => {
  assert.match(describeValue("3908889a422df2b376bdb2b7a72a1514"), /^32 chars, hex, #[0-9a-f]{4}$/);
  assert.match(describeValue("8080"), /^4 chars, digits, #[0-9a-f]{4}$/);
  assert.match(describeValue("true"), /^4 chars, boolean, #[0-9a-f]{4}$/);
  assert.match(describeValue("https://example.com/x"), /^21 chars, url, #[0-9a-f]{4}$/);
  assert.equal(describeValue(""), "(empty)");
});

test("a short value is not padded out to look longer", () => {
  // The old code truncated at 60 chars, so anything shorter printed in full.
  assert.equal(describeValue("CHANGE_ME").startsWith("9 chars"), true);
  assert.ok(!describeValue("CHANGE_ME").includes("CHANGE"));
});

test("fingerprint is stable and distinguishes values", () => {
  assert.equal(fingerprint("same"), fingerprint("same"));
  assert.notEqual(fingerprint("a"), fingerprint("b"));
  assert.match(fingerprint("anything"), /^[0-9a-f]{4}$/);
});

test("equal values across files share a fingerprint so drift stays readable", () => {
  const a = describeValue("shared-value");
  const b = describeValue("shared-value");
  const c = describeValue("different-value");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("redactResult strips values from every anomaly", () => {
  const result = {
    files: ["/x/.env", "/x/.env.example"],
    missingKeys: [],
    typeMismatches: [],
    valueAnomalies: [
      {
        key: "API_FOOTBALL_KEY",
        values: {
          "/x/.env": "3908889a422df2b376bdb2b7a72a1514",
          "/x/.env.example": "CHANGE_ME",
        },
        reason: "Placeholder value detected in /x/.env.example",
      },
    ],
    clean: false,
  };

  const serialized = JSON.stringify(redactResult(result));
  assert.ok(!serialized.includes("3908889a422df2b376bdb2b7a72a1514"));
  assert.ok(!serialized.includes("CHANGE_ME"));
  // The reason line is metadata about which file, not a value, and is kept.
  assert.ok(serialized.includes("Placeholder value detected"));
  assert.ok(serialized.includes("32 chars, hex"));
});

test("redactResult does not mutate the input", () => {
  const result = {
    files: [],
    missingKeys: [],
    typeMismatches: [],
    valueAnomalies: [
      { key: "K", values: { "/x/.env": "raw-secret" }, reason: "r" },
    ],
    clean: false,
  };
  redactResult(result);
  assert.equal(result.valueAnomalies[0].values["/x/.env"], "raw-secret");
});
