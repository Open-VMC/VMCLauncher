#!/usr/bin/env node
import { execSync } from "child_process";

try {
  execSync("npx tauri build", { stdio: "inherit" });
  execSync("bash scripts/set-dmg-icon.sh", { stdio: "inherit" });
} catch (e) {
  process.exit(e.status ?? 1);
}
