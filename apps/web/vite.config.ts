import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Task 4.1 (Vite + React + PWA scaffold): `injectManifest` mode is required
 * because the app ships a hand-written service worker (push handling, the
 * sensitive-route cache denylist, and a remote-kill check per design
 * Decision 5) rather than a generated Workbox strategy. `src/sw/service-worker.ts`
 * is a minimal precache-only placeholder here; its full content (precache
 * list, denylist, kill switch) is task 4.6's scope.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "service-worker.ts",
      injectManifest: {
        injectionPoint: "self.__WB_MANIFEST",
      },
      manifest: {
        name: "Travel Hub",
        short_name: "Travel Hub",
        description: "Inca Rail passenger companion — trip, boarding pass, and travel documents.",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        // Branded icons are not yet available (open design-asset item); the
        // manifest is otherwise valid without them and installability polish
        // is deferred to a later work unit.
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
