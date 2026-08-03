"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type ComisionLinea = {
  tipo: string;
  cliente_label: string;
  factura_id: string | null;
  numero_factura?: string | null;
  pago_id: string | null;
  fecha: string | null;
  monto_base: number;
  comision_estimada_linea: number;
  cobrado_periodo: number;
  saldo_pendiente: number;
  pendiente_por_comisionar: number;
  comisiona?: boolean;
  origen?: "auto" | "factura" | "override_incluir" | "override_excluir";
  override_motivo?: string | null;
  override_por?: string | null;
  override_at?: string | null;
  cliente_alta?: string | null;
  factura_monto_total?: number | null;
};

export type ComisionVendedorRow = {
  vendedor_usuario_id: string;
  vendedor_nombre: string;
  cantidad_movimientos: number;
  revenue_base: number;
  cobrado_periodo_total: number;
  saldo_pendiente_total: number;
  pendiente_por_comisionar_total: number;
  revenue_cobrado_total?: number;
  lineas_excluidas?: number;
  lineas_incluidas_manual?: number;
  escala_aplicada: string;
  porcentaje_tramo: number;
  premio_fijo_tramo: number;
  progreso_hacia_siguiente_pct: number | null;
  max_escala_alcanzada: boolean;
  comision_variable?: number;
  premio_fijo_aplicado?: number;
  comision_estimada: number;
  lineas: ComisionLinea[];
};

export type ComisionKpis = {
  revenue_base_total: number;
  revenue_comisionable_total?: number;
  revenue_cobrado_total?: number;
  comision_variable_total?: number;
  premio_fijo_total?: number;
  comision_estimada_total: number;
  cobrado_periodo_total: number;
  saldo_pendiente_total: number;
  vendedores_con_comision: number;
  lineas_excluidas?: number;
  lineas_incluidas_manual?: number;
};

export type ComisionPreviewPayload = {
  estado: string;
  mensaje?: string;
  meta: {
    periodo_mes?: string;
    politica_nombre?: string;
    viewer_scope?: "admin" | "vendedor";
    is_vendedor_view?: boolean;
  } | null;
  kpis: ComisionKpis | null;
  por_vendedor: ComisionVendedorRow[];
};

/** Hook compartido para el preview de comisiones del periodo (opcionalmente del mes especificado YYYY-MM). */
export function useComisionesPreview(mes?: string) {
  const qs = mes ? `?mes=${encodeURIComponent(mes)}` : "";
  const key = `comisiones:preview:${mes ?? "current"}`;
  const swr = useSWR<ComisionPreviewPayload>(
    key,
    async () => {
      const res = await fetchWithSupabaseSession(`/api/comisiones/preview${qs}`, { cache: "no-store" });
      const j = (await res.json()) as { success?: boolean; data?: ComisionPreviewPayload; error?: string };
      if (!res.ok || j.success !== true || !j.data) throw new Error(j.error ?? `Error ${res.status}`);
      return j.data;
    },
    { revalidateOnFocus: false, dedupingInterval: 2 * 60_000, keepPreviousData: true }
  );

  return {
    data: swr.data,
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
