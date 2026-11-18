import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Los tests usan las mismas rutas "@/..." que la app.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
