import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react()],
  base: "./",
  // Версия на главном экране берётся из package.json, чтобы не разъезжаться.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  preview: {
    allowedHosts: [".trycloudflare.com"],
  },
});
