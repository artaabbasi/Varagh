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
        registerType: "autoUpdate",
        manifest: {
          name: "Varagh — بازی‌های ورق ایرانی",
          short_name: "ورق",
          lang: "fa",
          dir: "rtl",
          theme_color: "#6750A4",
          background_color: "#FFFBFE",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
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
