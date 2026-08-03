"use client";

import Link from "next/link";
import { ArrowUpRight, BarChart3, FileText, TrendingUp, Wallet } from "lucide-react";

/**
 * Vista mobile de Reportes — menú de accesos rápidos. El detalle de cada reporte
 * (tablas con muchas columnas) se mantiene en desktop.
 */
export default function ReportesMobile() {
  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Reportes</h1>
        <p className="mt-0.5 text-xs text-slate-500">Datos clave del negocio</p>
      </header>

      <ul className="space-y-2">
        <ReporteItem
          href="/"
          icon={TrendingUp}
          tone="bg-[#0EA5E9]/10 text-[#0EA5E9]"
          title="Resumen del negocio"
          subtitle="Vista del dashboard"
        />
        <ReporteItem
          href="/dashboard/gerencia"
          icon={BarChart3}
          tone="bg-violet-100 text-violet-700"
          title="Gerencia"
          subtitle="KPIs comerciales, top clientes y categorías"
        />
        <ReporteItem
          href="/comisiones"
          icon={Wallet}
          tone="bg-emerald-100 text-emerald-700"
          title="Comisiones"
          subtitle="Preview del periodo por vendedor"
        />
      </ul>

      <p className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center text-[11px] text-slate-500">
        Los reportes con tablas detalladas y exportación a Excel se ven mejor desde la computadora.
      </p>
    </div>
  );
}

function ReporteItem({
  href,
  icon: Icon,
  tone,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  subtitle: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="truncate text-[11px] text-slate-500">{subtitle}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 text-slate-300" />
      </Link>
    </li>
  );
}
