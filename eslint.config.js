import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/drizzle/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Fronteira: a simulacao nao conhece rede, renderizacao nem UI.
    files: ["packages/sim/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "react-dom", "three", "ws", "@arena/protocol"],
          patterns: ["three/*", "react/*"],
        },
      ],
    },
  },
  {
    // O protocolo descreve pacotes; nao decide regras.
    files: ["packages/protocol/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: ["@dimforge/rapier3d-compat", "three", "react", "ws"] },
      ],
    },
  },
);
