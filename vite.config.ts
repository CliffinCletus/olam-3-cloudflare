import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.png", "apple-touch-icon.png", "images/olam-bg.jpg", "fonts/*.woff2", "sounds/*.wav"],
      manifest: {
        id: "/",
        name: "OLAM 3.0 – The Grand Wedding",
        short_name: "OLAM 3.0",
        description: "Register, get your entry pass and check in for OLAM 3.0 by Delta Academy.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0B192C",
        theme_color: "#0B192C",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,jpg,woff2,wav,svg}"],
        // jsPDF's optional html()/svg() helpers — never used, so don't make phones download them.
        globIgnores: ["**/html2canvas*.js", "**/purify.es*.js", "**/index.es*.js"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
