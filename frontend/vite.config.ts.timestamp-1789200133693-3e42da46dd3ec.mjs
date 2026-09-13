// vite.config.ts
import { readFileSync } from "node:fs";
import { defineConfig } from "file:///C:/Users/radic/Documents/Git/POPOSTAPO_BOOKS/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/radic/Documents/Git/POPOSTAPO_BOOKS/frontend/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { VitePWA } from "file:///C:/Users/radic/Documents/Git/POPOSTAPO_BOOKS/frontend/node_modules/vite-plugin-pwa/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Popostapo Books",
        short_name: "Popostapo",
        description: "Cataloga i tuoi libri da telefono",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    https: {
      cert: readFileSync(".cert/localhost.pem"),
      key: readFileSync(".cert/localhost-key.pem")
    },
    proxy: {
      "/api": "http://127.0.0.1:8002"
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxyYWRpY1xcXFxEb2N1bWVudHNcXFxcR2l0XFxcXFBPUE9TVEFQT19CT09LU1xcXFxmcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxccmFkaWNcXFxcRG9jdW1lbnRzXFxcXEdpdFxcXFxQT1BPU1RBUE9fQk9PS1NcXFxcZnJvbnRlbmRcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL3JhZGljL0RvY3VtZW50cy9HaXQvUE9QT1NUQVBPX0JPT0tTL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgcmVhZEZpbGVTeW5jIH0gZnJvbSAnbm9kZTpmcydcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnXG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJ1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICBWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxuICAgICAgbWFuaWZlc3Q6IHtcbiAgICAgICAgbmFtZTogJ1BvcG9zdGFwbyBCb29rcycsXG4gICAgICAgIHNob3J0X25hbWU6ICdQb3Bvc3RhcG8nLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0NhdGFsb2dhIGkgdHVvaSBsaWJyaSBkYSB0ZWxlZm9ubycsXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnI2ZmZmZmZicsXG4gICAgICAgIGJhY2tncm91bmRfY29sb3I6ICcjZmZmZmZmJyxcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxuICAgICAgICBzdGFydF91cmw6ICcvJyxcbiAgICAgICAgaWNvbnM6IFtcbiAgICAgICAgICB7IHNyYzogJy9pY29uLTE5Mi5wbmcnLCBzaXplczogJzE5MngxOTInLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxuICAgICAgICAgIHsgc3JjOiAnL2ljb24tNTEyLnBuZycsIHNpemVzOiAnNTEyeDUxMicsIHR5cGU6ICdpbWFnZS9wbmcnIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgZGV2T3B0aW9uczoge1xuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KSxcbiAgXSxcbiAgc2VydmVyOiB7XG4gICAgaG9zdDogJzAuMC4wLjAnLFxuICAgIHBvcnQ6IDUxNzMsXG4gICAgc3RyaWN0UG9ydDogdHJ1ZSxcbiAgICBodHRwczoge1xuICAgICAgY2VydDogcmVhZEZpbGVTeW5jKCcuY2VydC9sb2NhbGhvc3QucGVtJyksXG4gICAgICBrZXk6IHJlYWRGaWxlU3luYygnLmNlcnQvbG9jYWxob3N0LWtleS5wZW0nKSxcbiAgICB9LFxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6ICdodHRwOi8vMTI3LjAuMC4xOjgwMDInLFxuICAgIH0sXG4gIH0sXG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUErVixTQUFTLG9CQUFvQjtBQUM1WCxTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFdBQVc7QUFDbEIsU0FBUyxlQUFlO0FBRXhCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFFBQVE7QUFBQSxNQUNOLGNBQWM7QUFBQSxNQUNkLFVBQVU7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLGFBQWE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLGtCQUFrQjtBQUFBLFFBQ2xCLFNBQVM7QUFBQSxRQUNULFdBQVc7QUFBQSxRQUNYLE9BQU87QUFBQSxVQUNMLEVBQUUsS0FBSyxpQkFBaUIsT0FBTyxXQUFXLE1BQU0sWUFBWTtBQUFBLFVBQzVELEVBQUUsS0FBSyxpQkFBaUIsT0FBTyxXQUFXLE1BQU0sWUFBWTtBQUFBLFFBQzlEO0FBQUEsTUFDRjtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1YsU0FBUztBQUFBLE1BQ1g7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsTUFDTCxNQUFNLGFBQWEscUJBQXFCO0FBQUEsTUFDeEMsS0FBSyxhQUFhLHlCQUF5QjtBQUFBLElBQzdDO0FBQUEsSUFDQSxPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsSUFDVjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
