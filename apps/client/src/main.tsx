import { initPhysics } from "@arena/sim";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

// O WASM da fisica carrega uma vez por aba, antes de qualquer tela.
initPhysics()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    root.render(
      <div className="flex h-full items-center justify-center p-8 text-center text-white">
        <div>
          <h1 className="font-display text-2xl font-bold">Não foi possível iniciar a física</h1>
          <p className="mt-2 text-white/60">{String(err)}</p>
        </div>
      </div>,
    );
  });
