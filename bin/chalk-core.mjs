#!/usr/bin/env node
// chalk-core — one entry point for the scripts and shared references the chalk skills build on.
//
//   chalk-core <command> [args...]       run a script (see COMMANDS)
//   chalk-core path [relative/path]      print the install directory, or a file inside it
//   chalk-core sync <skill-dir> [--check]  copy references/ into <skill-dir>/references/core/
//
// A skill is markdown that the model reads, so it cannot import references from a package. `sync`
// vendors them mechanically, and `--check` fails when the copy has drifted, so a skill's tests can
// pin that it matches the core version it declares.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
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
    `chalk-core ${pkg.version}\n\ncommands:\n  ${Object.keys(COMMANDS).join("\n  ")}\n  path [relative/path]\n` +
      "  sync <skill-dir> [--check]",
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

if (cmd === "sync") {
  const check = args.includes("--check");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) die("usage: chalk-core sync <skill-dir> [--check]");
  const dest = join(resolve(target), "references", "core");
  const src = join(root, "references");
  const stamp = `chalk-core@${pkg.version}\n`;
  const names = readdirSync(src).filter((f) => f.endsWith(".md")).sort();

  if (check) {
    const problems = [];
    const have = existsSync(dest) ? readdirSync(dest).filter((f) => f.endsWith(".md")).sort() : [];
    for (const n of names) {
      if (!have.includes(n)) problems.push(`missing ${n}`);
      else if (readFileSync(join(dest, n), "utf8") !== readFileSync(join(src, n), "utf8")) {
        problems.push(`${n} differs from core`);
      }
    }
    for (const n of have) if (!names.includes(n)) problems.push(`${n} is not in core any more`);
    const synced = existsSync(join(dest, ".synced-from")) ? readFileSync(join(dest, ".synced-from"), "utf8") : null;
    if (synced !== stamp) problems.push(`.synced-from is ${JSON.stringify(synced?.trim())}, core is ${pkg.version}`);
    if (problems.length) {
      console.error(`chalk-core: ${dest} has drifted from core:\n  ${problems.join("\n  ")}\n  Run: chalk-core sync ${target}`);
      process.exit(1);
    }
    console.log(`chalk-core: ${dest} matches core ${pkg.version}`);
    process.exit(0);
  }

  // Replace, not merge: a reference deleted from core must not linger in a skill.
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const n of names) writeFileSync(join(dest, n), readFileSync(join(src, n)));
  writeFileSync(join(dest, ".synced-from"), stamp);
  console.log(`chalk-core: synced ${names.length} reference(s) into ${dest}`);
  process.exit(0);
}

const script = COMMANDS[cmd];
if (!script) die(`unknown command "${cmd}". Try: chalk-core --help`);
const r = spawnSync(process.execPath, [join(root, "scripts", script), ...args], { stdio: "inherit" });
process.exit(r.status ?? 1);
