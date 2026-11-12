"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { addCategory, deleteCategory, renameCategory, setCategoryArchived, type CatResult } from "@/lib/admin/category-actions";

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<CatResult>) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? "Error");
  });
  return { pending, error, run };
}

const iconBtn = "inline-flex size-8 items-center justify-center rounded-full text-graphite/55 hover:bg-white hover:text-graphite disabled:opacity-40";

export function CategoryItemActions({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const { pending, error, run } = useRun();
  return (
    <span className="flex items-center gap-0.5">
      {error && <span className="mr-2 max-w-48 text-right text-xs text-rose-dark">{error}</span>}
      <button className={iconBtn} disabled={pending} aria-label={`Renombrar ${name}`}
        onClick={() => { const n = window.prompt("Nuevo nombre", name); if (n && n.trim() !== name) run(() => renameCategory(id, n)); }}>
        <Pencil className="size-4" />
      </button>
      <button className={iconBtn} disabled={pending} aria-label={archived ? `Restaurar ${name}` : `Archivar ${name}`}
        onClick={() => run(() => setCategoryArchived(id, !archived))}>
        {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
      </button>
      <button className={iconBtn} disabled={pending} aria-label={`Borrar ${name}`}
        onClick={() => { if (window.confirm(`¿Borrar “${name}”? Solo se puede si nunca se usó.`)) run(() => deleteCategory(id)); }}>
        <Trash2 className="size-4" />
      </button>
    </span>
  );
}

export function AddCategory({ parentId, label, kind = "gasto" }: { parentId: string | null; label: string; kind?: "gasto" | "juntada" }) {
  const { pending, error, run } = useRun();
  return (
    <span className="flex items-center gap-2">
      <button disabled={pending} className="inline-flex items-center gap-1 text-sm font-semibold text-rose-dark disabled:opacity-50"
        onClick={() => { const n = window.prompt(label); if (n?.trim()) run(() => addCategory(parentId, n, kind)); }}>
        <Plus className="size-4" /> {label}
      </button>
      {error && <span className="text-xs text-rose-dark">{error}</span>}
    </span>
  );
}
