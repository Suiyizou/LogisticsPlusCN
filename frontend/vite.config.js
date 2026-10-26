import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const trackingTarget =
    process.env.VITE_TRACKING_DEV_TARGET || env.VITE_TRACKING_DEV_TARGET || "http://127.0.0.1:3000";

  const backendTarget =
    process.env.VITE_BACKEND_DEV_TARGET || env.VITE_BACKEND_DEV_TARGET || "http://127.0.0.1:8080";
  return {
    plugins: [
      vue(),
      Components({
        dirs: [],
        dts: false,
        resolvers: [ElementPlusResolver({ directives: true })]
      })
    ],
    base: "/",
    cacheDir: process.env.VITE_CACHE_DIR || "node_modules/.vite",
    server: {
      proxy: {
        "/tracking": {
          target: trackingTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/tracking/, "") || "/"
        },
        "/api": {
          target: backendTarget,
          changeOrigin: true
        },
        "/actuator": {
          target: backendTarget,
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
