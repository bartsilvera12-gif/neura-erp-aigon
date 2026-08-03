"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getProspectos, moveProspecto } from "@/lib/crm/storage";
import { getEtapas, getEtapaClasses, normalizeEtapaCodigo, type EtapaCrm } from "@/lib/crm/etapas";
import { cleanTelefono, formatTelefonoDisplay } from "@/lib/telefono";
import { FancySelect } from "@/app/dashboard/proyectos/components/FancySelect";
import type { Prospecto } from "@/lib/crm/types";
import ProspectoNuevoModal from "@/app/crm/components/ProspectoNuevoModal";
import ProspectoDetalleModal from "@/app/crm/components/ProspectoDetalleModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGs(valor: number) {
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `${(valor / 1_000).toFixed(0)}k`;
  return valor.toLocaleString("es-PY");
}

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function esHoy(isoStr: string): boolean {
  const d = new Date(isoStr);
  const hoy = new Date();
  return (
    d.getFullYear() === hoy.getFullYear() &&
    d.getMonth() === hoy.getMonth() &&
    d.getDate() === hoy.getDate()
  );
}

function esMesActual(isoStr: string): boolean {
  const d = new Date(isoStr);
  const hoy = new Date();
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth();
}

/** Top 5 productos/planes en negociación por valor. servicio = "Plan A, Plan B", valor_estimado se reparte. */
function topProductosEnNegociacion(prospectos: Prospecto[]): { nombre: string; valor: number }[] {
  const enNeg = prospectos.filter((p) => normalizeEtapaCodigo(p.etapa) === "NEGOCIACION");
  const map: Record<string, number> = {};
  for (const p of enNeg) {
    const productos = p.servicio.split(",").map((s) => s.trim()).filter(Boolean);
    const n = productos.length || 1;
    const valorPorUno = p.valor_estimado / n;
    for (const nom of productos) {
      const key = nom || "Otros";
      map[key] = (map[key] ?? 0) + valorPorUno;
    }
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nombre, valor]) => ({ nombre, valor }));
}

// ── Iconografía ───────────────────────────────────────────────────────────────

type IconProps = { className?: string };

const IconUsers = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconCalendar = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconBoxes = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M12.89 1.45 19 4.47a2 2 0 0 1 1.11 1.78v9.42a2 2 0 0 1-1.11 1.78l-6.11 3.02a2 2 0 0 1-1.78 0L4.99 17.45a2 2 0 0 1-1.11-1.78V6.25a2 2 0 0 1 1.11-1.78l6.11-3.02a2 2 0 0 1 1.79 0z" />
    <path d="M3.27 6.96 12 12.01l8.73-5.05" />
    <path d="M12 22.08V12" />
  </svg>
);

const IconCoins = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const IconTrophy = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const IconPlus = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const IconKanban = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="3" width="5" height="15" rx="1" />
    <rect x="9.5" y="3" width="5" height="10" rx="1" />
    <rect x="16" y="3" width="5" height="13" rx="1" />
  </svg>
);

const IconList = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconEdit = ({ className = "h-3.5 w-3.5" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const IconCheck = ({ className = "h-3 w-3" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconX = ({ className = "h-3 w-3" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconClock = ({ className = "h-3 w-3" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconChat = ({ className = "h-3 w-3" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconPhone = ({ className = "h-3 w-3" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const IconCopy = ({ className = "h-3 w-3" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-[#4FAEB2] text-white",
  "bg-violet-500 text-white",
  "bg-amber-500 text-white",
  "bg-emerald-600 text-white",
  "bg-rose-500 text-white",
  "bg-sky-600 text-white",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "xs" }) {
  const sizeClass = size === "xs" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full ${sizeClass} ${getAvatarColor(name)} font-semibold shrink-0 ring-2 ring-white`}
    >
      {getInitials(name)}
    </span>
  );
}

// ── Mapeo de colores de etapa → tonos para card / borde ──────────────────────

type EtapaTone = {
  borderLeft: string;
  dot: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  columnHeaderBg: string;
  columnHeaderBorder: string;
  columnHeaderDot: string;
  columnRing: string;
};

function getEtapaTone(color: string): EtapaTone {
  switch (color) {
    case "blue":
      return {
        borderLeft: "border-l-sky-500",
        dot: "bg-sky-500",
        badgeBg: "bg-sky-50",
        badgeText: "text-sky-700",
        badgeBorder: "border-sky-200",
        columnHeaderBg: "bg-sky-50/70",
        columnHeaderBorder: "border-sky-200",
        columnHeaderDot: "bg-sky-500",
        columnRing: "ring-sky-300/40",
      };
    case "amber":
      return {
        borderLeft: "border-l-amber-500",
        dot: "bg-amber-500",
        badgeBg: "bg-amber-50",
        badgeText: "text-amber-700",
        badgeBorder: "border-amber-200",
        columnHeaderBg: "bg-amber-50/70",
        columnHeaderBorder: "border-amber-200",
        columnHeaderDot: "bg-amber-500",
        columnRing: "ring-amber-300/40",
      };
    case "green":
      return {
        borderLeft: "border-l-emerald-500",
        dot: "bg-emerald-500",
        badgeBg: "bg-emerald-50",
        badgeText: "text-emerald-700",
        badgeBorder: "border-emerald-200",
        columnHeaderBg: "bg-emerald-50/70",
        columnHeaderBorder: "border-emerald-200",
        columnHeaderDot: "bg-emerald-500",
        columnRing: "ring-emerald-300/40",
      };
    case "red":
      return {
        borderLeft: "border-l-rose-500",
        dot: "bg-rose-500",
        badgeBg: "bg-rose-50",
        badgeText: "text-rose-700",
        badgeBorder: "border-rose-200",
        columnHeaderBg: "bg-rose-50/70",
        columnHeaderBorder: "border-rose-200",
        columnHeaderDot: "bg-rose-500",
        columnRing: "ring-rose-300/40",
      };
    case "violet":
      return {
        borderLeft: "border-l-violet-500",
        dot: "bg-violet-500",
        badgeBg: "bg-violet-50",
        badgeText: "text-violet-700",
        badgeBorder: "border-violet-200",
        columnHeaderBg: "bg-violet-50/70",
        columnHeaderBorder: "border-violet-200",
        columnHeaderDot: "bg-violet-500",
        columnRing: "ring-violet-300/40",
      };
    case "cyan":
      return {
        borderLeft: "border-l-cyan-500",
        dot: "bg-cyan-500",
        badgeBg: "bg-cyan-50",
        badgeText: "text-cyan-700",
        badgeBorder: "border-cyan-200",
        columnHeaderBg: "bg-cyan-50/70",
        columnHeaderBorder: "border-cyan-200",
        columnHeaderDot: "bg-cyan-500",
        columnRing: "ring-cyan-300/40",
      };
    case "pink":
      return {
        borderLeft: "border-l-pink-500",
        dot: "bg-pink-500",
        badgeBg: "bg-pink-50",
        badgeText: "text-pink-700",
        badgeBorder: "border-pink-200",
        columnHeaderBg: "bg-pink-50/70",
        columnHeaderBorder: "border-pink-200",
        columnHeaderDot: "bg-pink-500",
        columnRing: "ring-pink-300/40",
      };
    default:
      return {
        borderLeft: "border-l-slate-400",
        dot: "bg-slate-400",
        badgeBg: "bg-slate-50",
        badgeText: "text-slate-600",
        badgeBorder: "border-slate-200",
        columnHeaderBg: "bg-slate-50/70",
        columnHeaderBorder: "border-slate-200",
        columnHeaderDot: "bg-slate-400",
        columnRing: "ring-slate-300/40",
      };
  }
}

// ── ProspectoCard (estilo Proyectos) ──────────────────────────────────────────

function ProspectoCard({
  prospecto,
  etapas,
  onDragStart,
  onMoverEtapa,
  onEdit,
}: {
  prospecto: Prospecto;
  etapas: EtapaCrm[];
  onDragStart: (id: string) => void;
  onMoverEtapa: (id: string, etapaCodigo: string) => void;
  onEdit: (id: string) => void;
}) {
  const [phoneCopied, setPhoneCopied] = useState(false);

  const codigoProspecto = normalizeEtapaCodigo(prospecto.etapa);
  const esGanado = codigoProspecto === "GANADO";
  const esPerdido = codigoProspecto === "PERDIDO";
  const hayGanado = etapas.some((e) => normalizeEtapaCodigo(e.codigo) === "GANADO");
  const hayPerdido = etapas.some((e) => normalizeEtapaCodigo(e.codigo) === "PERDIDO");

  const etapaActual = etapas.find((e) => normalizeEtapaCodigo(e.codigo) === codigoProspecto);
  const tone = getEtapaTone(etapaActual?.color ?? "gray");

  const telefonoRaw = (prospecto.telefono ?? "").trim();
  const telefonoLimpio = cleanTelefono(telefonoRaw);
  const telefonoDisplay = telefonoRaw
    ? telefonoLimpio.length >= 6
      ? formatTelefonoDisplay(telefonoLimpio)
      : telefonoRaw
    : "";

  async function copiarTelefono(e: React.MouseEvent) {
    e.stopPropagation();
    if (!telefonoRaw) return;
    const valor = telefonoLimpio.length >= 6 ? telefonoLimpio : telefonoRaw;
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      // Fallback navegadores antiguos sin Clipboard API
      const ta = document.createElement("textarea");
      ta.value = valor;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* noop */
      }
      document.body.removeChild(ta);
    }
    setPhoneCopied(true);
    window.setTimeout(() => setPhoneCopied(false), 1500);
  }

  const etapaSelectOptions = etapas.map((e) => ({ value: e.codigo, label: e.nombre }));

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(prospecto.id));
        e.dataTransfer.effectAllowed = "move";
        onDragStart(prospecto.id);
      }}
      className={`group cursor-grab select-none rounded-2xl border border-l-4 border-slate-200 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${tone.borderLeft}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">
            {prospecto.empresa}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">
            {prospecto.numero_control}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(prospecto.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 rounded-md p-1 text-slate-300 opacity-0 transition-all hover:bg-[#4FAEB2]/10 hover:text-[#4FAEB2] group-hover:opacity-100"
          title="Editar"
          aria-label="Editar prospecto"
        >
          <IconEdit />
        </button>
      </div>

      <p className="mt-1.5 line-clamp-1 text-[11px] text-slate-500">{prospecto.servicio}</p>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Valor</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          Gs. {prospecto.valor_estimado.toLocaleString("es-PY")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {prospecto.origen_creacion === "whatsapp" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-emerald-500" />
            WhatsApp
          </span>
        ) : null}
        {prospecto.notas.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            <IconChat />
            {prospecto.notas.length}
          </span>
        ) : null}
      </div>

      <div className="mt-2 rounded-xl bg-slate-50/80 px-2.5 py-1.5">
        <div className="flex items-baseline justify-between gap-2 text-[11px] text-slate-700">
          <span className="truncate">
            <span className="font-medium text-slate-500">Contacto: </span>
            {prospecto.contacto}
          </span>
        </div>
      </div>

      {telefonoRaw ? (
        <button
          type="button"
          onClick={copiarTelefono}
          onPointerDown={(e) => e.stopPropagation()}
          title={phoneCopied ? "Copiado" : "Hacé click para copiar el número"}
          aria-label={`Copiar teléfono ${telefonoDisplay}`}
          className={`mt-2 flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
            phoneCopied
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-[#4FAEB2]/30 bg-[#4FAEB2]/8 text-[#3F8E91] hover:border-[#4FAEB2]/50 hover:bg-[#4FAEB2]/12"
          }`}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={`shrink-0 ${phoneCopied ? "text-emerald-600" : "text-[#4FAEB2]"}`}>
              <IconPhone />
            </span>
            <span className="min-w-0 flex-1 break-all font-mono font-medium tabular-nums">
              {telefonoDisplay}
            </span>
          </span>
          <span
            className={`shrink-0 ${phoneCopied ? "text-emerald-600" : "text-[#4FAEB2]/70"}`}
            aria-hidden="true"
          >
            {phoneCopied ? <IconCheck /> : <IconCopy />}
          </span>
        </button>
      ) : null}

      {prospecto.proxima_accion ? (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-100 bg-amber-50/70 px-2 py-1.5">
          <span className="mt-0.5 text-amber-500">
            <IconClock />
          </span>
          <p className="line-clamp-2 text-[10px] leading-tight text-amber-800">
            {prospecto.proxima_accion}
          </p>
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        {prospecto.responsable ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <Avatar name={prospecto.responsable} size="xs" />
            <span className="truncate text-[10px] text-slate-600">{prospecto.responsable}</span>
          </div>
        ) : (
          <span className="text-[10px] italic text-slate-300">Sin responsable</span>
        )}
        <span className="shrink-0 text-[10px] text-slate-400">
          {formatFecha(prospecto.fecha_creacion)}
        </span>
      </div>

      {/* Selector de etapa: siempre disponible para cambio rápido.
          draggable=false + handlers stopPropagation impiden que el HTML5 drag
          de la card padre intercepte el click en las opciones del listbox. */}
      <div
        className="mt-2 rounded-xl border border-slate-100 bg-slate-50/70 px-2 py-1.5"
        draggable={false}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <label className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          Mover a etapa
        </label>
        <FancySelect
          size="sm"
          ariaLabel="Cambiar etapa del prospecto"
          value={prospecto.etapa}
          onChange={(v) => onMoverEtapa(prospecto.id, v)}
          options={etapaSelectOptions}
        />
      </div>

      {!esGanado && !esPerdido && hayGanado && hayPerdido ? (
        <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoverEtapa(prospecto.id, "GANADO");
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-[10px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
          >
            <IconCheck />
            Ganado
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoverEtapa(prospecto.id, "PERDIDO");
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-semibold text-rose-700 transition-colors hover:bg-rose-50"
          >
            <IconX />
            Perdido
          </button>
        </div>
      ) : null}

      {esGanado ? (
        <div className="mt-2 flex items-center justify-between gap-1 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2 py-1">
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
            <IconCheck />
            {prospecto.cliente_creado ? "Cliente creado" : "Ganado"}
          </span>
          {!prospecto.cliente_creado ? (
            <Link
              href={`/clientes/nuevo?from_crm=${prospecto.id}`}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-[10px] font-semibold text-emerald-700 underline-offset-2 hover:underline"
            >
              Crear cliente →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Columna Kanban (estética premium) ─────────────────────────────────────────

function Columna({
  etapa,
  prospectos,
  etapas,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onMoverEtapa,
  onEdit,
}: {
  etapa: EtapaCrm;
  prospectos: Prospecto[];
  etapas: EtapaCrm[];
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStart: (id: string) => void;
  onMoverEtapa: (id: string, etapaCodigo: string) => void;
  onEdit: (id: string) => void;
}) {
  const tone = getEtapaTone(etapa.color);
  const total = prospectos.reduce((s, p) => s + p.valor_estimado, 0);

  return (
    <div
      className={`flex w-64 min-w-64 flex-col rounded-2xl border bg-white/60 backdrop-blur-sm transition-all duration-150 ${
        isDragOver
          ? `border-[#4FAEB2] ring-2 ring-[#4FAEB2]/30 bg-[#4FAEB2]/[0.04]`
          : `${tone.columnHeaderBorder}`
      }`}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave();
      }}
      onDrop={onDrop}
    >
      <div
        className={`sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-2xl border-b ${tone.columnHeaderBorder} ${tone.columnHeaderBg} px-3 py-2.5`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${tone.columnHeaderDot}`}
          />
          <span className="truncate text-[13px] font-semibold text-slate-800">
            {etapa.nombre}
          </span>
          <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
            {prospectos.length}
          </span>
        </div>
        {total > 0 ? (
          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-500">
            Gs. {formatGs(total)}
          </span>
        ) : null}
      </div>

      <div className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto p-2 max-h-[calc(100vh-260px)]">
        {prospectos.length === 0 ? (
          <div
            className={`flex h-16 items-center justify-center rounded-xl border-2 border-dashed text-[11px] transition-colors ${
              isDragOver
                ? "border-[#4FAEB2]/60 bg-[#4FAEB2]/5 text-[#3F8E91]"
                : "border-slate-200 text-slate-300"
            }`}
          >
            Soltá tarjetas aquí
          </div>
        ) : (
          prospectos.map((p) => (
            <ProspectoCard
              key={p.id}
              prospecto={p}
              etapas={etapas}
              onDragStart={onDragStart}
              onMoverEtapa={onMoverEtapa}
              onEdit={onEdit}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── MetricCard premium ────────────────────────────────────────────────────────

type MetricAccent = "neutral" | "featured" | "warning" | "success";

function MetricCard({
  label,
  value,
  sub,
  icon,
  accent = "neutral",
  onClick,
  active = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  accent?: MetricAccent;
  onClick?: () => void;
  active?: boolean;
}) {
  const chipCls =
    accent === "featured"
      ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/12 text-[#4FAEB2]"
      : accent === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-600"
        : accent === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : "border-slate-200 bg-slate-50 text-slate-500";

  const cardCls =
    accent === "featured"
      ? "relative overflow-hidden rounded-2xl border border-[#4FAEB2]/55 bg-gradient-to-br from-white via-white to-[#4FAEB2]/8 p-4 shadow-[0_4px_18px_rgba(79,174,178,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(79,174,178,0.14)]"
      : "relative overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md";

  const interactiveCls = onClick
    ? ` cursor-pointer text-left ${active ? "ring-2 ring-[#4FAEB2] border-[#4FAEB2]" : "hover:border-[#4FAEB2]/70"}`
    : "";

  const inner = (
    <>
      {accent === "featured" ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/70 to-[#4FAEB2]/30"
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        {icon ? (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${chipCls}`}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums leading-tight tracking-tight text-slate-900">
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-slate-500">{sub}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={`${cardCls}${interactiveCls}`}>
        {inner}
      </button>
    );
  }
  return <div className={cardCls}>{inner}</div>;
}

// ── Top Productos Widget premium ──────────────────────────────────────────────

function TopProductosWidget({
  items,
}: {
  items: { nombre: string; valor: number }[];
  total: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#4FAEB2]/30 bg-[#4FAEB2]/12 text-[#4FAEB2]">
          <IconBoxes />
        </span>
      </div>
      <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Top en negociación
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs italic text-slate-400">Sin datos</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="min-w-0 truncate font-medium text-slate-700">{it.nombre}</span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {formatGs(it.valor)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

// ── Vista Lista (tabla de filas, estilo módulo Clientes) ──────────────────────

/** Celda de teléfono: número clickeable (abre la conversación filtrada por ese número) + botón copiar. */
function PhoneCell({ telefono }: { telefono?: string }) {
  const [copied, setCopied] = useState(false);
  const raw = (telefono ?? "").trim();
  if (!raw) return <span className="text-slate-400">—</span>;
  const digits = raw.replace(/\D/g, "");
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Link
        href={`/dashboard/conversaciones?buscar=${encodeURIComponent(digits || raw)}`}
        className="font-mono text-slate-600 tabular-nums underline-offset-2 hover:text-[#3F8E91] hover:underline"
        title="Abrir conversación de este contacto"
      >
        {raw}
      </Link>
      <button
        type="button"
        title={copied ? "Copiado" : "Copiar número"}
        aria-label="Copiar número"
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(raw);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            /* ignore */
          }
        }}
        className={`shrink-0 transition-colors ${copied ? "text-emerald-600" : "text-slate-400 hover:text-[#3F8E91]"}`}
      >
        {copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

type ListPageSize = 25 | 50 | 100 | "todos";

function ProspectoLista({
  prospectos,
  etapas,
  onMoverEtapa,
  onEdit,
}: {
  prospectos: Prospecto[];
  etapas: EtapaCrm[];
  onMoverEtapa: (id: string, etapaCodigo: string) => void;
  onEdit: (id: string) => void;
}) {
  const [pageSize, setPageSize] = useState<ListPageSize>(25);
  const [filtroEtapa, setFiltroEtapa] = useState<string>("");
  const etapaSelectOptions = etapas.map((e) => ({ value: e.codigo, label: e.nombre }));
  const base = filtroEtapa
    ? prospectos.filter((p) => normalizeEtapaCodigo(p.etapa) === normalizeEtapaCodigo(filtroEtapa))
    : prospectos;
  const ordered = base
    .slice()
    .sort((a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());
  const rows = pageSize === "todos" ? ordered : ordered.slice(0, pageSize);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-3">
          <span>
            Mostrando <strong className="text-slate-700">{rows.length}</strong> de {ordered.length}
          </span>
          <label className="flex items-center gap-1.5">
            <span>Etapa:</span>
            <select
              value={filtroEtapa}
              onChange={(e) => setFiltroEtapa(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
              aria-label="Filtrar por etapa"
            >
              <option value="">Todas</option>
              {etapas.map((e) => (
                <option key={e.id} value={e.codigo}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-1.5">
          <span>Registros:</span>
          <select
            value={String(pageSize)}
            onChange={(e) =>
              setPageSize(e.target.value === "todos" ? "todos" : (Number(e.target.value) as ListPageSize))
            }
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
            aria-label="Cantidad de registros a mostrar"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="todos">Todos</option>
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Contacto</th>
              <th className="px-4 py-3 font-semibold">Teléfono</th>
              <th className="px-4 py-3 font-semibold">Servicio</th>
              <th className="px-4 py-3 text-right font-semibold">Valor</th>
              <th className="px-4 py-3 font-semibold">Etapa</th>
              <th className="px-4 py-3 font-semibold">Responsable</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  Sin prospectos
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onEdit(p.id)}
                  className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50/70"
                >
                  <td className="px-4 py-2.5">
                    <div className="max-w-[14rem] truncate font-semibold text-slate-900">
                      {p.contacto || p.empresa || "—"}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">{p.numero_control}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <PhoneCell telefono={p.telefono} />
                  </td>
                  <td className="max-w-[14rem] truncate px-4 py-2.5 text-slate-600">{p.servicio || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-800 tabular-nums">
                    Gs. {p.valor_estimado.toLocaleString("es-PY")}
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="min-w-[9rem]">
                      <FancySelect
                        size="sm"
                        ariaLabel="Cambiar etapa del prospecto"
                        value={p.etapa}
                        onChange={(v) => onMoverEtapa(p.id, v)}
                        options={etapaSelectOptions}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.responsable ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar name={p.responsable} size="xs" />
                        <span className="max-w-[8rem] truncate text-[11px] text-slate-600">{p.responsable}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] italic text-slate-400">Sin responsable</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-slate-500 tabular-nums">
                    {formatFecha(p.fecha_creacion)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Scroll horizontal del Kanban con flechas al pasar el cursor por los costados ──
function KanbanScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const dirRef = useRef<-1 | 0 | 1>(0);
  const rafRef = useRef<number | null>(null);
  const [hint, setHint] = useState<-1 | 0 | 1>(0);

  const loop = () => {
    const el = ref.current;
    if (el && dirRef.current !== 0) {
      el.scrollLeft += dirRef.current * 16;
      rafRef.current = requestAnimationFrame(loop);
    } else {
      rafRef.current = null;
    }
  };
  const setDir = (d: -1 | 0 | 1) => {
    if (d === dirRef.current) return;
    dirRef.current = d;
    setHint(d);
    if (d !== 0 && rafRef.current == null) rafRef.current = requestAnimationFrame(loop);
  };
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const band = 72;
    const canL = el.scrollLeft > 2;
    const canR = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
    if (x < band && canL) setDir(-1);
    else if (x > r.width - band && canR) setDir(1);
    else setDir(0);
  };
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  const arrow = (dir: "left" | "right") => (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/75 text-[#3F8E91] shadow-lg ring-1 ring-[#4FAEB2]/30 backdrop-blur">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
        {dir === "left" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </span>
  );

  return (
    <div className="relative -mx-1 min-h-0 flex-1 px-1 pb-2">
      <div ref={ref} onMouseMove={onMove} onMouseLeave={() => setDir(0)} className="h-full overflow-x-auto">
        {children}
      </div>
      <div className={`pointer-events-none absolute inset-y-0 left-0 flex w-16 items-center justify-start pl-1 transition-opacity duration-150 ${hint === -1 ? "opacity-100" : "opacity-0"}`}>
        {arrow("left")}
      </div>
      <div className={`pointer-events-none absolute inset-y-0 right-0 flex w-16 items-center justify-end pr-1 transition-opacity duration-150 ${hint === 1 ? "opacity-100" : "opacity-0"}`}>
        {arrow("right")}
      </div>
    </div>
  );
}

export default function CrmPage() {
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [etapas, setEtapas] = useState<EtapaCrm[]>([]);
  const [dragOverEtapa, setDragOverEtapa] = useState<string | null>(null);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  /** Vista del pipeline: "kanban" (cards por etapa) | "lista" (tabla de filas). Persiste por navegador. */
  const [vista, setVista] = useState<"kanban" | "lista">(() => {
    if (typeof window === "undefined") return "kanban";
    return window.localStorage.getItem("crm:vista") === "lista" ? "lista" : "kanban";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("crm:vista", vista);
    } catch {
      /* ignore */
    }
  }, [vista]);
  /** Filtro rápido: solo leads creados hoy (toggle desde la card "Leads Hoy"). */
  const [filtroHoy, setFiltroHoy] = useState(false);
  const dragIdRef = useRef<string | null>(null);

  function recargar() {
    getProspectos().then(setProspectos);
    getEtapas().then(setEtapas);
  }

  useEffect(() => {
    recargar();
  }, []);

  useEffect(() => {
    console.info("[crm-funnel][board-data]", {
      context: "client",
      etapas_count: etapas.length,
      prospectos_count: prospectos.length,
      codigos_columnas: etapas.map((e) => e.codigo),
    });
  }, [etapas, prospectos]);

  function handleDragStart(id: string) {
    dragIdRef.current = id;
  }

  async function handleDrop(e: React.DragEvent, etapaCodigo: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) {
      await moveProspecto(id, etapaCodigo);
      recargar();
    }
    setDragOverEtapa(null);
    dragIdRef.current = null;
  }

  async function handleMoverEtapa(id: string, etapaCodigo: string) {
    // Optimistic update: la carta se mueve al instante a la nueva etapa.
    // Si el servidor falla, recargar() abajo restaura el estado real.
    const previo = prospectos;
    setProspectos((prev) =>
      prev.map((p) =>
        String(p.id) === String(id) ? { ...p, etapa: etapaCodigo } : p,
      ),
    );

    try {
      await moveProspecto(id, etapaCodigo);
      recargar();
    } catch (err) {
      console.error("[crm-funnel] handleMoverEtapa:", err);
      setProspectos(previo); // rollback inmediato
      recargar(); // y resync con el servidor
    }
  }

  /**
   * Cartas del Kanban ordenadas por fecha_creacion ASC (más antiguos primero,
   * más nuevos al final). Decisión de UX local — la API sigue devolviendo
   * DESC para el resto de consumidores.
   */
  /** Base de la vista: aplica el filtro "solo hoy" (afecta Kanban y Lista). */
  const prospectosVista = filtroHoy
    ? prospectos.filter((p) => esHoy(p.fecha_creacion))
    : prospectos;

  const porEtapa = (codigo: string) =>
    prospectosVista
      .filter((p) => normalizeEtapaCodigo(p.etapa) === normalizeEtapaCodigo(codigo))
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.fecha_creacion).getTime();
        const tb = new Date(b.fecha_creacion).getTime();
        const sa = Number.isFinite(ta) ? ta : 0;
        const sb = Number.isFinite(tb) ? tb : 0;
        return sa - sb;
      });

  // Mantenemos getEtapaClasses como import para no romper otros usos.
  void getEtapaClasses;
  // Top productos en negociación se removió de la UI; se conservan helpers por compatibilidad.
  void topProductosEnNegociacion;
  void TopProductosWidget;

  const leadsHoy = prospectos.filter((p) => esHoy(p.fecha_creacion)).length;
  const leadsMes = prospectos.filter((p) => esMesActual(p.fecha_creacion)).length;
  const enNegociacion = prospectos.filter(
    (p) => normalizeEtapaCodigo(p.etapa) === "NEGOCIACION",
  );
  const valorNegociacion = enNegociacion.reduce((s, p) => s + p.valor_estimado, 0);
  const ganadosHoy = prospectos.filter(
    (p) =>
      normalizeEtapaCodigo(p.etapa) === "GANADO" && esHoy(p.fecha_actualizacion),
  ).length;
  const ganadosMes = prospectos.filter(
    (p) =>
      normalizeEtapaCodigo(p.etapa) === "GANADO" && esMesActual(p.fecha_actualizacion),
  ).length;

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Pipeline
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            CRM Funnel
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pipeline comercial · {prospectos.length} oportunidades
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Toggle de vista: Kanban (cards) | Lista (tabla de filas) */}
          <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100/80 p-0.5">
            <button
              type="button"
              onClick={() => setVista("kanban")}
              aria-pressed={vista === "kanban"}
              title="Vista Kanban (cards por etapa)"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                vista === "kanban" ? "bg-white text-[#3F8E91] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <IconKanban className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setVista("lista")}
              aria-pressed={vista === "lista"}
              title="Vista Lista (tabla de filas)"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                vista === "lista" ? "bg-white text-[#3F8E91] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <IconList className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNuevoOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91]"
          >
            <IconPlus className="h-4 w-4" />
            Nuevo prospecto
          </button>
        </div>
      </div>

      {/* KPIs premium */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Leads Hoy"
          value={leadsHoy}
          sub={filtroHoy ? "filtrando · clic para quitar" : "creados hoy · clic para filtrar"}
          icon={<IconUsers />}
          onClick={() => setFiltroHoy((v) => !v)}
          active={filtroHoy}
        />
        <MetricCard
          label="Leads del Mes"
          value={leadsMes}
          sub="creados en el mes"
          icon={<IconCalendar />}
        />
        <MetricCard
          label="Valor en Negociación"
          value={`Gs. ${formatGs(valorNegociacion)}`}
          sub="pipeline activo"
          icon={<IconCoins />}
          accent="featured"
        />
        <MetricCard
          label="Ganados Hoy"
          value={ganadosHoy}
          sub="cierres del día"
          icon={<IconTrophy />}
          accent="success"
        />
        <MetricCard
          label="Ganados del Mes"
          value={ganadosMes}
          sub="cierres del mes"
          icon={<IconTrophy />}
          accent="success"
        />
      </div>

      {/* Pipeline: Kanban (cards) o Lista (tabla) según la vista elegida */}
      {vista === "kanban" ? (
        <KanbanScroller>
          <div className="flex h-full min-w-max items-start gap-3">
            {etapas.map((etapa) => (
              <Columna
                key={etapa.id}
                etapa={etapa}
                prospectos={porEtapa(etapa.codigo)}
                etapas={etapas}
                isDragOver={dragOverEtapa === etapa.codigo}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverEtapa(etapa.codigo);
                }}
                onDragLeave={() => setDragOverEtapa(null)}
                onDrop={(e) => handleDrop(e, etapa.codigo)}
                onDragStart={handleDragStart}
                onMoverEtapa={handleMoverEtapa}
                onEdit={(id) => setEditandoId(id)}
              />
            ))}
          </div>
        </KanbanScroller>
      ) : (
        <ProspectoLista
          prospectos={prospectosVista}
          etapas={etapas}
          onMoverEtapa={handleMoverEtapa}
          onEdit={(id) => setEditandoId(id)}
        />
      )}

      <ProspectoNuevoModal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onCreated={() => {
          setNuevoOpen(false);
          recargar();
        }}
      />

      <ProspectoDetalleModal
        id={editandoId}
        open={editandoId != null}
        onClose={() => setEditandoId(null)}
        onUpdated={() => recargar()}
      />
    </div>
  );
}
