"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getProveedores } from "@/lib/proveedores/storage";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import type { Proveedor } from "@/lib/proveedores/types";

export default function ProveedoresPage() {
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getProveedores().then((rows) => {
      if (!cancel) {
        setLista(rows);
        setCargando(false);
      }
    });
    return () => {
      cancel = true;
    };
  }, []);

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((p) => {
      const cats = (p.categorias ?? []).map((c) => c.nombre.toLowerCase()).join(" ");
      return (
        p.nombre.toLowerCase().includes(t) ||
        (p.ruc ?? "").toLowerCase().includes(t) ||
        (p.email ?? "").toLowerCase().includes(t) ||
        cats.includes(t)
      );
    });
  }, [lista, busqueda]);

  return (
    <div className="space-y-6 pb-10">

      {/* Header tipo Dashboard */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Operaciones · Proveedores
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Proveedores</h1>
          <p className="mt-1 text-sm text-slate-500">
            Maestro de abastecimiento: categorías, condiciones de pago y vínculo con compras.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportExcelButton url="/api/proveedores/export" />
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Listado
            </h2>
          </div>
          <Link
            href="/proveedores/nuevo"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            + Nuevo proveedor
          </Link>
          <div className="relative min-w-[18rem] flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="search"
              placeholder="Buscar por nombre, RUC, email o categoría…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pl-9 text-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            />
          </div>
          <span className="ml-auto text-[11px] text-slate-400">
            {filtradas.length} de {lista.length} proveedor{lista.length === 1 ? "" : "es"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="py-3 pr-4 text-[10px] font-semibold uppercase tracking-[0.1em] first:pl-4">Proveedor</th>
                <th className="py-3 pr-4 text-[10px] font-semibold uppercase tracking-[0.1em]">RUC</th>
                <th className="py-3 pr-4 text-[10px] font-semibold uppercase tracking-[0.1em]">Contacto</th>
                <th className="py-3 pr-4 text-[10px] font-semibold uppercase tracking-[0.1em]">Categorías</th>
                <th className="py-3 pr-4 text-[10px] font-semibold uppercase tracking-[0.1em]">Estado</th>
                <th className="py-3 text-[10px] font-semibold uppercase tracking-[0.1em] w-24" />
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Cargando…
                  </td>
                </tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    {lista.length === 0 ? "No hay proveedores cargados." : "Sin resultados."}
                  </td>
                </tr>
              ) : (
                filtradas.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-800">{p.nombre}</div>
                      {p.nombre_comercial && (
                        <div className="text-xs text-slate-500">{p.nombre_comercial}</div>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-600">{p.ruc ?? "—"}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      <div>{p.contacto ?? "—"}</div>
                      <div className="text-xs text-slate-400">{p.telefono ?? ""}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {(p.categorias ?? []).length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          p.categorias!.map((c) => (
                            <span
                              key={c.id}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                            >
                              {c.nombre}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.estado === "activo"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {p.estado === "activo" ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/proveedores/${p.id}/editar`}
                        className="text-[11px] font-semibold text-[#3F8E91] underline-offset-2 hover:underline"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
