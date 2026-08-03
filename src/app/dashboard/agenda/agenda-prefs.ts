/**
 * Preferencias de visualización de la Agenda, persistidas por navegador/usuario
 * en localStorage (mismo patrón que src/lib/favorites.ts). Sin backend ni migración.
 */
// v2: el default pasó a día completo (0–24). Se cambia la clave para que las
// preferencias previas (rango acotado) no oculten horas y todos vean el día completo;
// quien quiera acotar el rango lo vuelve a hacer desde el config y se persiste.
const STORAGE_KEY = "neura_agenda_prefs_v2";

export type AgendaPrefs = {
  /** Hora inicial visible en las vistas Día/Semana (0–23). */
  startHour: number;
  /** Hora final visible (1–24, exclusiva). */
  endHour: number;
};

export const DEFAULT_PREFS: AgendaPrefs = { startHour: 0, endHour: 24 };

function clampRange(p: AgendaPrefs): AgendaPrefs {
  const s = Math.max(0, Math.min(23, Math.round(p.startHour)));
  let e = Math.max(1, Math.min(24, Math.round(p.endHour)));
  if (e <= s) e = Math.min(24, s + 1);
  return { startHour: s, endHour: e };
}

export function getAgendaPrefs(): AgendaPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AgendaPrefs>;
    return clampRange({
      startHour: typeof parsed.startHour === "number" ? parsed.startHour : DEFAULT_PREFS.startHour,
      endHour: typeof parsed.endHour === "number" ? parsed.endHour : DEFAULT_PREFS.endHour,
    });
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setAgendaPrefs(p: AgendaPrefs): AgendaPrefs {
  const safe = clampRange(p);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch {
      /* ignore */
    }
  }
  return safe;
}
