import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const endpoint = process.env.SATURN_AFFIRMATION_URL || "";
if (endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/affirmation") {
    throw new Error("SATURN_AFFIRMATION_URL must be an HTTPS Worker URL ending in /api/affirmation, without credentials or query parameters.");
  }
}
const base = process.env.PAGES_BASE_PATH || "/saturn/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error("Invalid PAGES_BASE_PATH.");

export default defineConfig({
  base,
  // No environment variables are implicitly exposed to the static client.
  envPrefix: [],
  define: { __SATURN_AFFIRMATION_URL__: JSON.stringify(endpoint) },
  plugins: [react(), {
    name: "reject-server-code-in-pages",
    resolveId(source) {
      if (source === "cloudflare:workers" || /(?:^|\/)server\//.test(source) || /\/api\/.*\/route/.test(source)) {
        throw new Error(`Server module cannot enter the Pages bundle: ${source}`);
      }
      return null;
    },
  }],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  build: { outDir: "pages-dist", emptyOutDir: true, sourcemap: false },
});
