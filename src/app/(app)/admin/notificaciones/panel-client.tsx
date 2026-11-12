"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Plus, Send, Trash2 } from "lucide-react";
import { addMessage, broadcast, deleteMessage, toggleMessage, type NResult } from "@/lib/admin/notification-actions";
import { cn } from "@/lib/utils";

type Msg = { id: string; title: string; body: string; active: boolean };
const input = "h-11 w-full min-w-0 rounded-xl border border-graphite/10 bg-white px-3 text-sm outline-none focus:border-rose focus:ring-4 focus:ring-rose/15";

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const run = (fn: () => Promise<NResult>, okText?: (r: NResult) => string, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ tone: "error", text: r.error ?? "Error" });
      else { if (okText) setMsg({ tone: "ok", text: okText(r) }); after?.(); }
    });
  return { pending, msg, run };
}

export function MessagePool({ kind, messages, hint, placeholderTitle, placeholderBody }: {
  kind: "weekly" | "birthday" | "birthday_week"; messages: Msg[]; hint: string; placeholderTitle: string; placeholderBody: string;
}) {
  const { pending, msg, run } = useRun();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-graphite/55">{hint}</p>
      <ul className="flex flex-col gap-2">
        {messages.map((m) => (
          <li key={m.id} className={cn("flex items-start gap-2 rounded-2xl bg-white/70 p-3", !m.active && "opacity-50")}>
            <div className="min-w-0 flex-1 text-sm"><p className="font-semibold">{m.title}</p><p className="text-graphite/70">{m.body}</p></div>
            <button disabled={pending} onClick={() => run(() => toggleMessage(m.id, !m.active))} aria-label={m.active ? "Pausar" : "Activar"}
              className="inline-flex size-9 items-center justify-center rounded-full text-graphite/55 hover:bg-white">{m.active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</button>
            <button disabled={pending} onClick={() => { if (window.confirm("¿Borrar este mensaje?")) run(() => deleteMessage(m.id)); }} aria-label="Borrar"
              className="inline-flex size-9 items-center justify-center rounded-full text-graphite/55 hover:text-rose-dark"><Trash2 className="size-4" /></button>
          </li>
        ))}
        {messages.length === 0 && <li className="text-sm text-graphite/55">Todavía no hay mensajes.</li>}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); run(() => addMessage(kind, title, body), undefined, () => { setTitle(""); setBody(""); }); }}
        className="flex flex-col gap-2 rounded-2xl bg-white/50 p-3 ring-1 ring-graphite/5">
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholderTitle} maxLength={80} aria-label="Título" />
        <input className={input} value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholderBody} maxLength={200} aria-label="Texto" />
        <button disabled={pending || !title.trim() || !body.trim()} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-graphite text-sm font-semibold text-cream disabled:opacity-40">
          <Plus className="size-4" /> Agregar
        </button>
      </form>
      {msg && <p className={cn("text-sm", msg.tone === "error" ? "text-rose-dark" : "text-graphite/70")}>{msg.text}</p>}
    </div>
  );
}

export function BroadcastForm({ members }: { members: { id: string; name: string }[] }) {
  const { pending, msg, run } = useRun();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!window.confirm(`¿Mandar ahora a ${all ? "todas" : `${picked.length} integrantes`}?`)) return;
      run(() => broadcast(title, body, all ? "all" : picked, "/"), (r) => `Enviada a ${r.sent} ${r.sent === 1 ? "integrante" : "integrantes"} con notificaciones activadas.`, () => { setTitle(""); setBody(""); });
    }} className="flex flex-col gap-3">
      <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ej: ¡Asado este sábado!)" maxLength={80} aria-label="Título" />
      <textarea className={cn(input, "h-auto py-2")} rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Texto" maxLength={200} aria-label="Texto" />
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" onClick={() => setAll(true)} className={cn("h-9 rounded-full px-4 font-semibold", all ? "bg-graphite text-cream" : "bg-white/70 ring-1 ring-graphite/10")}>Todas</button>
        <button type="button" onClick={() => setAll(false)} className={cn("h-9 rounded-full px-4 font-semibold", !all ? "bg-graphite text-cream" : "bg-white/70 ring-1 ring-graphite/10")}>Elegir</button>
      </div>
      {!all && (
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <button type="button" key={m.id} onClick={() => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}
              className={cn("h-9 rounded-full px-3 text-sm font-semibold", picked.includes(m.id) ? "bg-lime ring-1 ring-graphite" : "bg-white/70 ring-1 ring-graphite/10")}>{m.name}</button>
          ))}
        </div>
      )}
      <button disabled={pending || !title.trim() || !body.trim() || (!all && picked.length === 0)}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rose font-semibold text-graphite shadow-lg shadow-rose/30 disabled:opacity-40">
        <Send className="size-4" /> Enviar ahora
      </button>
      {msg && <p className={cn("text-sm", msg.tone === "error" ? "text-rose-dark" : "text-graphite/70")}>{msg.text}</p>}
    </form>
  );
}
