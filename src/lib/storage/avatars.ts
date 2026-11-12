import "server-only";
import { signUrls } from "./signed-urls";

/** URLs firmadas (reutilizables) para avatares del bucket privado: mapa path → url. */
export function signAvatarUrls(paths: (string | null | undefined)[]) {
  return signUrls("avatars", paths);
}
