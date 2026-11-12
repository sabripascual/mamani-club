import { z } from "zod";

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export const signUpSchema = z.object({
  first_name: z.string().trim().min(1, "Contanos tu nombre").max(60),
  last_name: z.string().trim().min(1, "Contanos tu apellido").max(60),
  nickname: z.string().trim().max(40).optional().transform((v) => v || undefined),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, "Entre 3 y 20 caracteres: letras minúsculas, números, punto o guion bajo"),
  email: z.string().trim().toLowerCase().email("Ese email no parece válido"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

export const signInSchema = z.object({
  identifier: z.string().trim().min(1, "Ingresá tu email o username"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Mínimo 8 caracteres").max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

export type FieldErrors = Partial<Record<string, string>>;

export function flattenErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
