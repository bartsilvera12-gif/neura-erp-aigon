/**
 * Etiquetas de estado del pipeline de ventas.
 * Un único source of truth compartido por UI mobile, desktop y panel admin.
 *
 * Los colores hex son Tailwind slate/blue/amber/orange/emerald/red 500, elegidos
 * para leerse bien tanto sobre chip claro como sobre badge oscuro.
 */

export type PipelineEstado =
  | "nuevo"
  | "seguimiento"
  | "confirmado"
  | "pagado_entregado"
  | "perdido";

export type PipelineEstadoOrNull = PipelineEstado | null;

export type PipelineEstadoInfo = {
  key: PipelineEstado;
  /** Label completo p/ menú, panel admin. */
  label: string;
  /** Label corto p/ chip en la card. */
  shortLabel: string;
  /** Emoji correspondiente al pedido del usuario. */
  emoji: string;
  /** Hex de fondo del chip (aprox pastel). */
  bg: string;
  /** Hex de texto del chip. */
  fg: string;
  /** Hex del punto/dot circular. */
  dot: string;
  /** Requiere fecha (Seguimiento). */
  needsDate?: boolean;
  /** Requiere monto (Pagado y Entregado). */
  needsAmount?: boolean;
};

export const PIPELINE_ESTADOS: Record<PipelineEstado, PipelineEstadoInfo> = {
  nuevo: {
    key: "nuevo",
    label: "Nuevo pedido",
    shortLabel: "Nuevo",
    emoji: "🔵",
    bg: "#DBEAFE", // blue-100
    fg: "#1D4ED8", // blue-700
    dot: "#3B82F6", // blue-500
  },
  seguimiento: {
    key: "seguimiento",
    label: "Seguimiento",
    shortLabel: "Seguim.",
    emoji: "🟡",
    bg: "#FEF3C7", // amber-100
    fg: "#B45309", // amber-700
    dot: "#F59E0B", // amber-500
    needsDate: true,
  },
  confirmado: {
    key: "confirmado",
    label: "Confirmado (con seña)",
    shortLabel: "Confirm.",
    emoji: "🟠",
    bg: "#FFEDD5", // orange-100
    fg: "#C2410C", // orange-700
    dot: "#F97316", // orange-500
  },
  pagado_entregado: {
    key: "pagado_entregado",
    label: "Pagado y Entregado",
    shortLabel: "Pagado",
    emoji: "🟢",
    bg: "#D1FAE5", // emerald-100
    fg: "#047857", // emerald-700
    dot: "#10B981", // emerald-500
    needsAmount: true,
  },
  perdido: {
    key: "perdido",
    label: "Perdido",
    shortLabel: "Perdido",
    emoji: "🔴",
    bg: "#FEE2E2", // red-100
    fg: "#B91C1C", // red-700
    dot: "#EF4444", // red-500
  },
};

export const PIPELINE_ESTADOS_ORDER: PipelineEstado[] = [
  "nuevo",
  "seguimiento",
  "confirmado",
  "pagado_entregado",
  "perdido",
];

export function pipelineEstadoInfo(estado: string | null | undefined): PipelineEstadoInfo | null {
  if (!estado) return null;
  return (PIPELINE_ESTADOS as Record<string, PipelineEstadoInfo>)[estado] ?? null;
}
