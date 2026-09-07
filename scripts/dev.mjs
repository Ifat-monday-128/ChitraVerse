import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const services = [
  { name: "API", directory: "server", cli: "nodemon/bin/nodemon.js", args: ["src/server.js"] },
  { name: "Frontend", directory: "frontend", cli: "vinext/dist/cli.js", args: ["dev", "--config", "vite.config.ts"] },
];

for (const service of services) {
  service.entry = resolve(root, service.directory, "node_modules", service.cli);
  if (!existsSync(service.entry)) {
    console.error(`${service.name} dependencies are missing. Run npm.cmd run setup first.`);
    process.exit(1);
  }
}

const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (process.platform === "win32") {
      // Nodemon owns a child process; stop its entire tree on Windows.
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore", windowsHide: true,
      });
      killer.on("error", () => child.kill());
    } else {
      try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); }
    }
  }
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

for (const service of services) {
  const child = spawn(process.execPath, [service.entry, ...service.args], {
    cwd: resolve(root, service.directory),
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  children.add(child);
  child.on("error", (error) => {
    children.delete(child);
    console.error(`${service.name} could not start: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${service.name} stopped. Shutting down the other service.`);
      stop(code || 1);
    }
  });
}
