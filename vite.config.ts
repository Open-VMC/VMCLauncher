import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  plugins: [react()],
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist-electron/renderer"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
});
