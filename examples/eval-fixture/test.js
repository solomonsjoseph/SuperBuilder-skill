// Deterministic acceptance test for US-001 (CLI prints version flag).
// node:test + node:assert + child_process.spawnSync — no third-party deps.

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const BIN = path.join(__dirname, "bin.js");

test("US-001: --version prints the hardcoded version string and exits 0", () => {
  const r = spawnSync(process.execPath, [BIN, "--version"], { encoding: "utf8" });
  assert.equal(r.status, 0, "exit code should be 0");
  assert.equal(r.stdout.trim(), "1.0.0", "stdout should be the version");
  assert.equal(r.stderr, "", "stderr should be empty");
});

test("US-001: -v alias also prints the version", () => {
  const r = spawnSync(process.execPath, [BIN, "-v"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "1.0.0");
});
