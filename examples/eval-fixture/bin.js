#!/usr/bin/env node
// Minimal Node CLI fixture used by the Superbuilder self-heal eval (Set A,
// downsized to one story). Only `node:` builtins; no third-party deps.
//
// Behavior:
//   --version | -v -> prints VERSION to stdout and exits 0
//   --help    | -h -> prints usage to stdout and exits 0
//   anything else  -> prints usage to stderr and exits 2

"use strict";

const VERSION = "1.0.0";
const USAGE = "Usage: bin.js [--version|-v] [--help|-h]";

const args = process.argv.slice(2);
if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(VERSION + "\n");
  process.exit(0);
}
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(USAGE + "\n");
  process.exit(0);
}
process.stderr.write(USAGE + "\n");
process.exit(2);
