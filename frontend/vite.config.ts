import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    proxy: {
      "/__proxy/kma": {
        target: "https://apis.data.go.kr",
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/__proxy\/kma/, ""),
      },
      "/__proxy/air": {
        target: "https://api.odcloud.kr",
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/__proxy\/air/, ""),
      },
    },
  },
});
