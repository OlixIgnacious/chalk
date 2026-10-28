#!/usr/bin/env node
// chalk-core — one entry point for the scripts and shared references the chalk skills build on.
//
//   chalk-core <command> [args...]       run a script (see COMMANDS)
//   chalk-core path [relative/path]      print the install directory, or a file inside it
//
// The skills read references/ in place, through a references/core symlink in each skill.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const COMMANDS = {
  ingest: "ingest.mjs",
  "check-readability": "check-readability.mjs",
  "build-tokens": "build-tokens.mjs",
  "align-captions": "align-captions.mjs",
  "apply-display": "apply-display.mjs",
  narrate: "narrate.mjs",
  "check-spoken": "check-spoken.mjs",
  "emit-vtt": "emit-vtt.mjs",
  "fix-index": "fix-index.mjs",
  "manim-render": "manim-render.mjs",
};

const [cmd, ...args] = process.argv.slice(2);
const die = (m, code = 2) => {
  console.error("chalk-core:", m);
  process.exit(code);
};

if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(
    `chalk-core ${pkg.version}\n\ncommands:\n  ${Object.keys(COMMANDS).join("\n  ")}\n  path [relative/path]\n`,
  );
  process.exit(cmd ? 0 : 2);
}
if (cmd === "--version" || cmd === "-v") {
  console.log(pkg.version);
  process.exit(0);
}

if (cmd === "path") {
  console.log(args[0] ? join(root, args[0]) : root);
  process.exit(0);
}

const script = COMMANDS[cmd];
if (!script) die(`unknown command "${cmd}". Try: chalk-core --help`);
const r = spawnSync(process.execPath, [join(root, "scripts", script), ...args], { stdio: "inherit" });
process.exit(r.status ?? 1);
