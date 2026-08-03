"use client";

import Link from "next/link";
import { ArrowUpRight, Monitor } from "lucide-react";

/**
 * Componente reusable para módulos de configuración/administración que NO tienen
 * UI mobile dedicada porque su uso real es desktop (tablas densas, formularios largos,
 * acciones administrativas). Le explica al usuario por qué y le da una salida.
 */
export default function DesktopOnlyHint({
  title,
  description,
  homeHref = "/",
  homeLabel = "Volver al inicio",
}: {
  title: string;
  description: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Monitor className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="mt-3 text-base font-semibold text-slate-900">Mejor desde la computadora</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{description}</p>
      </div>

      <Link
        href={homeHref}
        className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {homeLabel}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
