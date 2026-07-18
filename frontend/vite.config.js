import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const trackingTarget =
    process.env.VITE_TRACKING_DEV_TARGET ||
    env.VITE_TRACKING_DEV_TARGET ||
    "http://127.0.0.1:3000";

  return {
    plugins: [vue()],
    base: "/",
    server: {
      proxy: {
        "/tracking": {
          target: trackingTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/tracking/, "") || "/"
        },
        "/api": {
          target: "http://127.0.0.1:8080",
          changeOrigin: true
        },
        "/actuator": {
          target: "http://127.0.0.1:8080",
          changeOrigin: true
        }
      }
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1200
    }
  };
});
