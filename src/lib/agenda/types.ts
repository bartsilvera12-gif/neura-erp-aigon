/** Tipos compartidos del módulo Agenda (Fase 1A). */

export const AGENDA_ESTADOS = [
  "pendiente",
  "confirmada",
  "completada",
  "no_asistio",
  "cancelada",
  "reprogramada",
] as const;

export type AgendaEstado = (typeof AGENDA_ESTADOS)[number];

/** Estados que NO ocupan el horario del responsable (no bloquean disponibilidad). */
export const ESTADOS_NO_BLOQUEAN: ReadonlySet<string> = new Set<string>([
  "cancelada",
  "reprogramada",
]);

/** Estados terminales: no admiten más transiciones. */
export const ESTADOS_TERMINALES: ReadonlySet<string> = new Set<string>([
  "completada",
  "no_asistio",
  "cancelada",
  "reprogramada",
]);

export function isAgendaEstado(v: unknown): v is AgendaEstado {
  return typeof v === "string" && (AGENDA_ESTADOS as readonly string[]).includes(v);
}

export type AgendaCitaRow = {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  prospecto_id: string | null;
  responsable_id: string;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  titulo: string;
  tipo: string | null;
  estado: AgendaEstado;
  inicio_at: string;
  fin_at: string;
  ubicacion: string | null;
  observaciones: string | null;
  reprogramada_de_id: string | null;
  cancelada_motivo: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Cita enriquecida con datos de cliente y responsable para la UI. */
export type AgendaCitaEnriquecida = AgendaCitaRow & {
  cliente?: { id: string; nombre?: string | null; telefono?: string | null } | null;
  responsable?: { id: string; nombre?: string | null } | null;
};
