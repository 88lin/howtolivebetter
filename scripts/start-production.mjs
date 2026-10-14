import { cp, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
try {
  await access(path.join(standalone, "server.js"));
} catch {
  console.error("Run npm run build before npm start.");
  process.exit(1);
}
// Next's standalone output omits public files; preserve its directory layout.
await cp(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
await cp(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
const server = spawn(process.execPath, [path.join(standalone, "server.js")], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    HOSTNAME: process.env.HOSTNAME || "127.0.0.1",
    PORT: process.env.PORT || "3000",
    HOW_LOCAL_DATA_DIR: process.env.HOW_LOCAL_DATA_DIR || path.join(root, ".data"),
  },
});
server.on("exit", (code) => { process.exitCode = code ?? 0; });
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
