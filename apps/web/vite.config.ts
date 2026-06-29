import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serverUrl = env.VITE_SERVER_URL || "http://localhost:3001";

  return {
    plugins: [
      react(),
      VitePWA({
        // "prompt" (not "autoUpdate") so a new build never silently reloads
        // mid-game — the user is shown an update banner and chooses when to
        // apply it. See src/app/PwaUpdatePrompt.tsx.
        registerType: "prompt",
        manifest: {
          name: "Varagh — بازی‌های ورق ایرانی",
          short_name: "ورق",
          lang: "fa",
          dir: "rtl",
          theme_color: "#7C3AED",
          background_color: "#0B0B16",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ],
    server: {
      host: "0.0.0.0",
      proxy: {
        "/socket.io": {
          target: serverUrl,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
