import { spawnSync } from "node:child_process";
const options = { stdio: "inherit", env: { ...process.env, WRANGLER_WRITE_LOGS: "false", WRANGLER_LOG_PATH: ".wrangler/logs", MINIFLARE_REGISTRY_PATH: ".wrangler/registry" } };
for (const args of [
  ["node_modules/wrangler/bin/wrangler.js", "types", "worker-configuration.d.ts", "--config", "dist/server/wrangler.json"],
  ["node_modules/typescript/bin/tsc", "--noEmit"],
]) {
  const result = spawnSync(process.execPath, args, options);
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}
