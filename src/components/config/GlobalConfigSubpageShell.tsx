"use client";

import Link from "next/link";

/**
 * Shell unificado para sub-páginas de Configuración Global.
 * Aplica el lenguaje visual del ERP: eyebrow turquesa + dot glow,
 * breadcrumb refinado, botón "Volver" outline elegante.
 */
export function GlobalConfigSubpageShell({
  title,
  description,
  /** Eyebrow opcional sobre el título. Default: "AJUSTES". */
  eyebrow = "Ajustes",
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Link
          href="/configuracion"
          className="font-medium text-slate-500 transition-colors hover:text-[#4FAEB2]"
        >
          Configuración Global
        </Link>
        <span aria-hidden className="text-slate-300">
          /
        </span>
        <span className="font-semibold text-slate-700">{title}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              {eyebrow}
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        <Link
          href="/configuracion"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Volver al centro
        </Link>
      </div>

      {children}
    </div>
  );
}
