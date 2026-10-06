import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ command }) => ({
  base: "/kaka_calendar/",
  plugins: [
    ...(command === "serve" ? [basicSsl()] : []),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["*.svg", "*.png", "*.ico"],
      manifest: {
        name: "Дневник 💩",
        short_name: "Дневник",
        description: "Трекер походов в туалет",
        theme_color: "#fdf0ff",
        background_color: "#fdf0ff",
        display: "standalone",
        orientation: "portrait",
        scope: "/kaka_calendar/",
        start_url: "/kaka_calendar/",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        importScripts: ["firebase-messaging-sw.js"],
        globIgnores: ["firebase-messaging-sw.js"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("firebase")) {
              return "firebase";
            }
            return "vendor";
          }
        },
      },
    },
  },
}));
