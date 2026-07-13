import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const browsersPath = resolve(".ms-playwright");
const playwrightCli = resolve("node_modules", "playwright", "cli.js");
mkdirSync(browsersPath, { recursive: true });

const result = spawnSync(process.execPath, [playwrightCli, "install", "chromium"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  },
});

if (result.error) {
  console.error(result.error.message);
}

if (result.status !== 0) {
  console.error(`playwright install exited with ${result.status ?? "unknown status"}`);
  process.exit(result.status ?? 1);
}
