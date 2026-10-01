import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 4200,
    strictPort: true,
    allowedHosts: [loadEnv(mode, process.cwd(), "TAILSCALE_").TAILSCALE_HOSTNAME].filter(Boolean),
    proxy: {
      "/api": {
        target: "http://localhost:4201",
        changeOrigin: true,
      },
    },
  },
}));
