import Link from "next/link";

/**
 * Pantalla placeholder elegante para reportes aún sin lógica real.
 * Mantiene la paleta del ERP (blanco + turquesa #4FAEB2) y reserva el espacio
 * visual del reporte. La lógica/cálculos reales se implementan por separado.
 */
export function ReportePlaceholder({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {/* Header */}
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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      {/* Estado: en preparación */}
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[#4FAEB2]/45 bg-white px-6 py-20 text-center shadow-sm">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#4FAEB2]/25 bg-[#4FAEB2]/8 text-[#4FAEB2]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
            aria-hidden="true"
          >
            <path d="M3 3v18h18" />
            <rect x="7" y="12" width="3" height="6" rx="0.5" />
            <rect x="12" y="8" width="3" height="10" rx="0.5" />
            <rect x="17" y="5" width="3" height="13" rx="0.5" />
          </svg>
        </span>
        <div className="space-y-1">
          <p className="text-base font-semibold tracking-tight text-slate-900">
            Reporte en preparación
          </p>
          <p className="mx-auto max-w-md text-sm text-slate-500">
            Estamos preparando este reporte. Pronto vas a poder ver el detalle y los indicadores
            aquí.
          </p>
        </div>
        <Link
          href="/reportes"
          className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
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
          Volver a Reportes
        </Link>
      </div>
    </div>
  );
}
