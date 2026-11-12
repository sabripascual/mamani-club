/** Traduce los mensajes de Supabase Auth a algo entendible. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Usuario o contraseña incorrectos.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Ese email ya tiene una cuenta. Probá ingresar.";
  if (m.includes("password should be")) return "La contraseña es demasiado corta.";
  if (m.includes("rate limit")) return "Demasiados intentos. Esperá un momento y probá de nuevo.";
  if (m.includes("profiles_username_key")) return "Ese username ya está en uso.";
  if (m.includes("database error saving new user")) return "No pudimos crear tu cuenta. Revisá los datos e intentá de nuevo.";
  return "Algo salió mal. Intentá de nuevo.";
}
