import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Expõe GAME_SERVER_URL no cliente (além do prefixo VITE_ padrão).
  envPrefix: ["VITE_", "GAME_SERVER_"],
  server: { port: 5173 },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Função (não array): com pnpm o Rapier só existe em @arena/sim;
        // o formato array tenta resolver o pacote a partir do client e quebra no CI.
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("rapier3d-compat")) return "rapier";
        },
      },
    },
  },
});
