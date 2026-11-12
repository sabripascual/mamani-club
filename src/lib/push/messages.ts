/** Textos de las notificaciones (especificación en docs/FASE-5-NOTIFICACIONES.md). */

export const DEBTOR_MESSAGES = [
  { title: "Perrita deudora!", body: (j: string) => `No te olvides de transferir tu parte de la juntada: ${j}` },
  { title: "Rata inmunda, animal rastrero…", body: () => "Tu deuda te sigue esperando" },
  { title: "URA SECA PAGAAAAA!", body: () => "Estás a un día de que mandemos el sicario…" },
  { title: "DEJÁ DE MOSTRAR LA HILACHA!", body: () => "Hasta a mí me da vergüenza……" },
  { title: "SI TODAVÍA NO TENÉS VERGÜENZA", body: () => "Buscate un 8 hs!!!!!" },
] as const;

export const CREDITOR_MESSAGES = [
  { title: "Viejitaaa! Todavía te deben", body: "La plata no vuelve sola…" },
  { title: "APURÁ ESAS RATONAS!", body: "Tirá un mensajito al grupo…" },
  { title: "NOSOTRAS TE AVISAMOS!", body: "Si no les hacés acordar… ¡a llorar al campito!" },
] as const;

/** El último mensaje de cada secuencia se repite hasta que se salde. */
export function debtorMessage(step: number, juntada: string, amount: string) {
  const m = DEBTOR_MESSAGES[Math.min(step, DEBTOR_MESSAGES.length) - 1];
  // A partir del segundo mensaje agregamos la juntada y el monto para que se
  // sepa a qué deuda corresponde (llega una notificación por juntada).
  const body = step === 1 ? `${m.body(juntada)} (${amount})` : `${m.body(juntada)}\n${juntada} · ${amount}`;
  return { title: m.title, body };
}

export function creditorMessage(step: number, oldest: string, others: number, amount: string) {
  const m = CREDITOR_MESSAGES[Math.min(step, CREDITOR_MESSAGES.length) - 1];
  const detail = others > 0 ? `${oldest} y ${others} ${others === 1 ? "juntada más" : "juntadas más"}` : oldest;
  return { title: m.title, body: `${m.body}\n${detail} · te deben ${amount}` };
}
