#!/usr/bin/env bun
/**
 * Generates a test URL and curl command for the humantrail tracker.
 *
 * Loads .env from the project root. Env: BASE_URL, TRACKER_SECRET, TRACKER_API_KEY, PORT
 */

import { program } from "commander";
import { config } from "@dotenvx/dotenvx";
import { encodeToken } from "../src/token";

config({ quiet: true });

program
  .name("sample")
  .description("Generate a test URL and curl command for the humantrail tracker")
  .option("-c, --click", "generate click redirect URL")
  .option("-a, --api", "generate event lookup API URL")
  .option(
    "-r, --run-id <id>",
    "run ID",
    process.env["RUN_ID"] ?? `run_${Math.random().toString(36).slice(2, 10)}`
  )
  .option("-s, --step-id <id>", "step ID", "test_step")
  .action((opts) => {
    if (opts.click && opts.api) {
      program.error("cannot use both --click and --api");
    } else if (opts.api) {
      run("api", opts);
    } else if (opts.click) {
      run("click", opts);
    } else {
      run("pixel", opts);
    }
  });

program.parse();

function run(
  mode: "pixel" | "click" | "api",
  opts: { runId: string; stepId: string },
): void {
  const baseUrl =
    process.env["BASE_URL"] ??
    `http://localhost:${process.env["PORT"] ?? 3000}`;
  const secret = process.env["TRACKER_SECRET"] ?? "dev-tracker-secret";
  const apiKey = process.env["TRACKER_API_KEY"] ?? "dev-tracker-api-key";

  const token = encodeToken({
    runId: opts.runId,
    stepId: opts.stepId,
    secret,
  });

  let url: string;
  let curlCmd: string;

  switch (mode) {
    case "pixel":
      url = `${baseUrl}/t/${token}.gif`;
      curlCmd = `curl -i "${url}"`;
      break;
    case "click":
      const targetUrl = encodeURIComponent("https://example.com/pricing");
      url = `${baseUrl}/r/${token}?url=${targetUrl}`;
      curlCmd = `curl -i "${url}"`;
      break;
    case "api":
      url = `${baseUrl}/api/events/${token}`;
      curlCmd = `curl -sS -H "Authorization: Bearer ${apiKey}" "${url}"`;
      break;
  }

  console.log(url);
  console.log("");
  console.log("# Run:");
  console.log(curlCmd);
}
