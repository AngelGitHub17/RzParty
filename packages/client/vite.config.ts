import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

/** Même port que le serveur : RZ_PORT, sinon celui enregistré dans rzparty.config.json, sinon 5555. */
function serverPort(): number {
  const env = Number(process.env.RZ_PORT);
  if (Number.isInteger(env) && env > 0) return env;
  const file = resolve(__dirname, "../../rzparty.config.json");
  try {
    if (existsSync(file)) {
      const port = (JSON.parse(readFileSync(file, "utf8")) as { port?: unknown }).port;
      if (typeof port === "number" && Number.isInteger(port) && port > 0) return port;
    }
  } catch {
    /* fichier illisible : port par défaut */
  }
  return 5555;
}

const port = serverPort();

export default defineConfig({
  server: {
    // Accessible depuis les téléphones du réseau local pendant le développement.
    host: true,
    port: 5173,
    proxy: {
      "/api": `http://localhost:${port}`,
      "/socket.io": { target: `http://localhost:${port}`, ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    // Three.js pèse ~500 ko : il est chargé à part, seulement quand la 3D s'affiche.
    chunkSizeWarningLimit: 800,
  },
});
