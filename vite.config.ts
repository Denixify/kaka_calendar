import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/kaka_calendar/",
  plugins: [
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
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
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
});
