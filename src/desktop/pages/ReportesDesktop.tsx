"use client";

import { Wallet, ShoppingCart, Scale, Megaphone } from "lucide-react";
import { SettingsModuleCard } from "@/components/config/SettingsModuleCard";

type ReporteCard = {
  title: string;
  subtitle: string;
  description: string;
  icon: typeof Wallet;
  href: string;
};

const REPORTES: ReporteCard[] = [
  {
    title: "Estado de cuenta empresa",
    subtitle: "Finanzas",
    description:
      "Resumen financiero general de la empresa: saldos, movimientos, ventas, compras, gastos, cobros y pagos del período.",
    icon: Wallet,
    href: "/reportes/estado-cuenta",
  },
  {
    title: "Ventas",
    subtitle: "Comercial",
    description:
      "Reporte visual de ventas por período, cliente, producto, método de pago, tipo de precio y evolución mensual.",
    icon: ShoppingCart,
    href: "/reportes/ventas",
  },
  {
    title: "Conciliación entre cuentas",
    subtitle: "Control",
    description:
      "Comparación y control de movimientos entre caja, bancos, transferencias, efectivo y registros del ERP.",
    icon: Scale,
    href: "/reportes/conciliacion",
  },
  {
    title: "Campañas Meta",
    subtitle: "Marketing",
    description:
      "Efectividad de campañas Meta/Facebook/Instagram según mensajes de WhatsApp, leads y tipificaciones de cierre.",
    icon: Megaphone,
    href: "/reportes/campanas-meta",
  },
];

export default function ReportesPage() {
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
            Análisis
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Reportes</h1>
        <p className="mt-1 text-sm text-slate-500">Panel de análisis y reportería operativa</p>
      </div>

      {/* Cards de reportes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTES.map((r) => (
          <SettingsModuleCard
            key={r.href}
            title={r.title}
            subtitle={r.subtitle}
            description={r.description}
            icon={r.icon}
            href={r.href}
            actionLabel="Ver reporte"
          />
        ))}
      </div>
    </div>
  );
}
