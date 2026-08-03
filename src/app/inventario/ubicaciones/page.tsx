"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Ubicacion {
  id: string;
  nombre: string;
  codigo: string | null;
  tipo: string;
  parent_id: string | null;
  activo: boolean;
}

const TIPOS = ["deposito", "salon", "pasillo", "gondola", "estante", "zona", "otro"] as const;

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2]/40 focus:border-[#4FAEB2] focus:outline-none";
const labelCls =
  "block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-1";

export default function UbicacionesPage() {
  const [items, setItems] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<string>("deposito");
  const [parentId, setParentId] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/ubicaciones?todas=1", { credentials: "include" });
      const j = await r.json();
      if (r.ok && j?.success) setItems(j.data.ubicaciones as Ubicacion[]);
      else setError(j?.error ?? "No se pudo cargar.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/ubicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nombre: nombre.trim(),
          tipo,
          parent_id: parentId || null,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo crear.");
      } else {
        setNombre(""); setTipo("deposito"); setParentId("");
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActivo(u: Ubicacion) {
    const r = await fetch(`/api/inventario/ubicaciones/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ activo: !u.activo }),
    });
    const j = await r.json();
    if (r.ok && j?.success) load();
    else setError(j?.error ?? "No se pudo actualizar.");
  }

  // Ordenar: padres primero (alfabético) y debajo sus hijos. Sub-ubicaciones indentadas.
  const itemsOrdenados = useMemo(() => {
    const byParent = new Map<string | null, Ubicacion[]>();
    for (const u of items) {
      const arr = byParent.get(u.parent_id) ?? [];
      arr.push(u);
      byParent.set(u.parent_id, arr);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
    const out: Array<Ubicacion & { nivel: 0 | 1 }> = [];
    const padres = byParent.get(null) ?? [];
    for (const p of padres) {
      out.push({ ...p, nivel: 0 });
      const hijos = byParent.get(p.id) ?? [];
      for (const h of hijos) out.push({ ...h, nivel: 1 });
    }
    // huerfanos (parent_id apunta a algo que no esta en items)
    const idsIncluidos = new Set(out.map((u) => u.id));
    for (const u of items) {
      if (!idsIncluidos.has(u.id)) out.push({ ...u, nivel: 0 });
    }
    return out;
  }, [items]);

  // Padres disponibles para el select: nivel 0 activos (jerarquia de 2 niveles maximo)
  const padresDisponibles = useMemo(
    () => items.filter((i) => i.activo && i.parent_id == null),
    [items],
  );

  return (
    <div className="space-y-6 pb-10">

      {/* Breadcrumb / volver */}
      <div>
        <Link
          href="/inventario"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3F8E91] transition-colors hover:text-[#2f6c6f]"
        >
          ← Volver a Inventario
        </Link>
      </div>

      {/* Header tipo Dashboard */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Operaciones · Depósitos
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Depósitos y ubicaciones
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Donde se almacena físicamente cada producto: depósitos, salones, pasillos, góndolas, estantes, zonas.
          Cada ubicación puede tener sub-ubicaciones eligiendo una{" "}
          <span className="font-medium text-slate-600">Ubicación padre</span>.
        </p>
      </div>

      {/* Alta */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Nueva ubicación
          </h2>
        </div>
        <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className={labelCls}>Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Depósito central"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className={inputCls}
            >
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Ubicación padre{" "}
              <span className="font-normal normal-case tracking-normal text-slate-400">
                — opcional, para crear una sub-ubicación
              </span>
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={inputCls}
            >
              <option value="">— ninguna (ubicación principal) —</option>
              {padresDisponibles.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre} ({i.tipo})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={creating || !nombre.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creando..." : "+ Crear ubicación"}
            </button>
          </div>
        </form>
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}
      </section>

      {/* Lista */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Ubicaciones existentes
          </h2>
          <span className="ml-auto text-[11px] text-slate-400">
            {items.length} {items.length === 1 ? "ubicación" : "ubicaciones"}
          </span>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-slate-400">Cargando...</p>
        ) : itemsOrdenados.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Todavía no cargaste ubicaciones.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Nombre
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Tipo
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Ubicación padre
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Estado
                </th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itemsOrdenados.map((u) => {
                const parent = items.find((i) => i.id === u.parent_id);
                return (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-800">
                      {u.nivel === 1 ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-slate-300" aria-hidden="true">└─</span>
                          <span className="text-slate-700">{u.nombre}</span>
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            sub
                          </span>
                        </span>
                      ) : (
                        u.nombre
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.tipo}</td>
                    <td className="px-4 py-3 text-slate-500">{parent?.nombre ?? "—"}</td>
                    <td className="px-4 py-3">
                      {u.activo ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActivo(u)}
                        className="text-[11px] font-semibold text-[#3F8E91] underline-offset-2 hover:underline"
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
