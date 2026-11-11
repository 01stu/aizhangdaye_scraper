import { resolve } from "node:path";
import { run } from "./runner.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("用法：node src/cli.mjs [--config config/sources.json] [--output output] [--max-pages 100] [--include-excluded]");
  process.exit(0);
}

const results = await run({
  configPath: resolve(option("--config", "config/sources.json")),
  outputDir: resolve(option("--output", "output")),
  maxPages: Number(option("--max-pages", "100")),
  timeoutMs: Number(option("--timeout-ms", "15000")),
  retryCount: Number(option("--retry-count", "2")),
  delayMs: Number(option("--delay-ms", "300")),
  includeExcluded: process.argv.includes("--include-excluded"),
});
if (results.every((result) => result.status === "failed")) process.exitCode = 1;
