/**
 * Cliente API para crear registros vía endpoints REST.
 * Envía JWT de Supabase (localStorage) en Authorization.
 */

import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

async function apiPost<T>(path: string, data: Record<string, unknown>): Promise<{ success: true; data: T } | { success: false; error: string }> {
  const res = await fetchWithSupabaseSession(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { success: false, error: res.ok ? "Respuesta inválida del servidor" : `Error ${res.status}` };
  }
  const body = json as { success?: boolean; data?: T; error?: string };
  if (!res.ok) {
    return { success: false, error: body?.error ?? `Error ${res.status}` };
  }
  if (body?.success !== true || body.data === undefined || body.data === null) {
    return { success: false, error: body?.error ?? "Respuesta inválida del servidor" };
  }
  return { success: true, data: body.data };
}

async function apiPatch<T>(path: string, data: Record<string, unknown>): Promise<{ success: true; data: T } | { success: false; error: string }> {
  const res = await fetchWithSupabaseSession(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { success: false, error: res.ok ? "Respuesta inválida del servidor" : `Error ${res.status}` };
  }
  const body = json as { success?: boolean; data?: T; error?: string };
  if (!res.ok) {
    return { success: false, error: body?.error ?? `Error ${res.status}` };
  }
  if (body?.success !== true || body.data === undefined || body.data === null) {
    return { success: false, error: body?.error ?? "Respuesta inválida del servidor" };
  }
  return { success: true, data: body.data };
}

async function apiPut<T>(path: string, data: Record<string, unknown>): Promise<{ success: true; data: T } | { success: false; error: string }> {
  const res = await fetchWithSupabaseSession(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { success: false, error: res.ok ? "Respuesta inválida del servidor" : `Error ${res.status}` };
  }
  const body = json as { success?: boolean; data?: T; error?: string };
  if (!res.ok) {
    return { success: false, error: body?.error ?? `Error ${res.status}` };
  }
  if (body?.success !== true || body.data === undefined || body.data === null) {
    return { success: false, error: body?.error ?? "Respuesta inválida del servidor" };
  }
  return { success: true, data: body.data };
}

export type DuplicadoMatchClient = {
  cliente_id: string;
  nombre: string;
  documento: string | null;
  estado: string;
  activo: boolean;
  tipo_servicio: string | null;
  match_type: "documento" | "nombre" | "ambos";
  display_url: string;
};

export async function apiCreateCliente(data: {
  tipo_cliente?: string;
  tipo_servicio_cliente?: string;
  empresa?: string;
  nombre_contacto: string;
  ruc?: string;
  documento?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  ciudad?: string;
  pais?: string;
  condicion_pago?: string;
  moneda_preferida?: string;
  estado?: string;
  plan_comercial_id?: string | null;
  vendedor_asignado?: string;
  vendedor_usuario_id?: string | null;
  sifen_receptor_extranjero?: boolean;
  sifen_codigo_pais?: string | null;
  sifen_tipo_doc_receptor?: number | null;
  sifen_receptor_manual?: boolean;
  sifen_receptor_naturaleza?: string | null;
  sifen_ti_ope?: number | null;
  sifen_num_id_de?: string | null;
  sifen_direccion_de?: string | null;
  sifen_num_casa_de?: number | null;
  sifen_descripcion_tipo_doc?: string | null;
}): Promise<
  | { ok: true; data: { id: string; [key: string]: unknown } }
  | { ok: false; error: string; code?: string; hay_inactivo?: boolean; matches?: DuplicadoMatchClient[] }
> {
  const res = await fetchWithSupabaseSession("/api/clientes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: res.ok ? "Respuesta inválida del servidor" : `Error ${res.status}` };
  }
  const body = json as {
    success?: boolean;
    data?: { id: string; [key: string]: unknown };
    error?: string;
    code?: string;
    hay_inactivo?: boolean;
    matches?: DuplicadoMatchClient[];
  };
  if (!res.ok) {
    // 409 Conflict: duplicado por documento o nombre principal.
    if (res.status === 409 || body?.code === "DUPLICATE") {
      return {
        ok: false,
        error: body?.error ?? "Ya existe un cliente con este RUC/Cédula o nombre.",
        code: "DUPLICATE",
        hay_inactivo: body?.hay_inactivo ?? false,
        matches: body?.matches ?? [],
      };
    }
    return { ok: false, error: body?.error ?? `Error ${res.status}` };
  }
  if (body?.success !== true || !body.data) {
    return { ok: false, error: body?.error ?? "Respuesta inválida del servidor" };
  }
  return { ok: true, data: body.data };
}

/** Verificación en vivo de duplicados (documento o nombre principal). NO usa teléfono/correo/contacto. */
export async function apiCheckDuplicateCliente(input: {
  nombre?: string;
  documento?: string;
  excluir?: string;
}): Promise<{
  exists: boolean;
  match_type: "documento" | "nombre" | "ambos" | null;
  hay_inactivo: boolean;
  matches: DuplicadoMatchClient[];
}> {
  const sp = new URLSearchParams();
  if (input.nombre?.trim()) sp.set("nombre", input.nombre.trim());
  if (input.documento?.trim()) sp.set("documento", input.documento.trim());
  if (input.excluir?.trim()) sp.set("excluir", input.excluir.trim());
  const empty = { exists: false, match_type: null as null, hay_inactivo: false, matches: [] };
  if (![...sp.keys()].some((k) => k === "nombre" || k === "documento")) return empty;
  try {
    const res = await fetchWithSupabaseSession(`/api/clientes/check-duplicate?${sp.toString()}`);
    const json = await res.json();
    if (!res.ok || json?.success !== true) return empty;
    return json.data;
  } catch {
    return empty;
  }
}

export type HistorialClienteFila = {
  id: string;
  created_at: string;
  tipo?: string | null;
  accion: string;
  plan_anterior_nombre?: string | null;
  plan_nuevo_nombre?: string | null;
  creado_por_email?: string | null;
  creado_por_auth_user_id?: string | null;
  detalle?: Record<string, unknown> | null;
};

/** Historial de cambios (auditoría) de la ficha del cliente. */
export async function apiGetClienteHistorial(clienteId: string): Promise<HistorialClienteFila[]> {
  try {
    const res = await fetchWithSupabaseSession(`/api/clientes/${clienteId}/historial`);
    const json = await res.json();
    if (!res.ok || json?.success !== true) return [];
    return (json.data?.filas ?? []) as HistorialClienteFila[];
  } catch {
    return [];
  }
}

export type BajaOperativaPreview = {
  suscripciones_activas: number;
  facturas_pendientes_count?: number;
  factura_pendiente_mes: { id: string; numero_factura: string; monto: number } | null;
  suscripciones: { id: string; precio: number; moneda: string }[];
};

/** Obtiene datos previos para dar de baja (suscripciones, facturas con saldo). */
export async function apiGetBajaOperativaPreview(clienteId: string): Promise<BajaOperativaPreview | null> {
  const res = await fetchWithSupabaseSession(`/api/clientes/${clienteId}/baja-operativa`);
  const json = await res.json();
  if (!res.ok) return null;
  return json?.data ?? null;
}

/** Dar de baja operativa al cliente. Solo admin. Motivo obligatorio. */
export async function apiBajaOperativaCliente(
  clienteId: string,
  motivo: string,
  anularFacturaPendiente: boolean,
  cancelarSuscripciones = true
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchWithSupabaseSession(`/api/clientes/${clienteId}/baja-operativa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      motivo: motivo.trim(),
      anular_factura_pendiente: anularFacturaPendiente,
      cancelar_suscripciones: cancelarSuscripciones,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    return { ok: false, error: json?.error ?? `Error ${res.status}` };
  }
  return { ok: true };
}

/**
 * Bandera `zentra_erp.empresas.gestion_tributaria_clientes`.
 * Ante error HTTP o columna/permiso, **lanza** (no devuelve false) para que la UI muestre el error y no se confunda con “función apagada”.
 */
export async function apiGetGestionTributariaClientes(): Promise<boolean> {
  const res = await fetchWithSupabaseSession("/api/empresas/gestion-tributaria-clientes", { cache: "no-store" });
  let json: { success?: boolean; data?: { gestion_tributaria_clientes?: boolean }; error?: string };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new Error("Respuesta inválida del servidor al leer gestión tributaria.");
  }
  if (!res.ok) {
    throw new Error(json?.error ?? `Error ${res.status} al leer gestión tributaria de clientes.`);
  }
  if (json.success !== true || json.data == null) {
    throw new Error(json?.error ?? "Respuesta inválida al leer gestión tributaria de clientes.");
  }
  return Boolean(json.data.gestion_tributaria_clientes);
}

export async function apiPatchGestionTributariaClientes(on: boolean): Promise<{ ok: boolean; error?: string }> {
  const r = await apiPatch<{ gestion_tributaria_clientes: boolean }>(
    "/api/empresas/gestion-tributaria-clientes",
    { gestion_tributaria_clientes: on }
  );
  if (!r.success) return { ok: false, error: r.error };
  return { ok: true };
}

export type ObligacionCatalogoApi = {
  id: string;
  slug: string;
  nombre: string;
  requiere_detalle_otro: boolean;
};

export async function apiGetObligacionesTributariasCatalogo(): Promise<ObligacionCatalogoApi[]> {
  const res = await fetchWithSupabaseSession("/api/clientes/obligaciones-tributarias-catalogo", { cache: "no-store" });
  const json = (await res.json()) as { success?: boolean; data?: { items?: ObligacionCatalogoApi[] } };
  if (!res.ok || json.success !== true || !json.data?.items) return [];
  return json.data.items;
}

/** Actualiza perfil tributario del cliente (PUT). Omitir `clave_tributaria` para conservar la actual; `null` limpia. */
export async function apiPutClientePerfilTributario(
  clienteId: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const r = await apiPut<{ perfil: unknown }>(
    `/api/clientes/${encodeURIComponent(clienteId)}/perfil-tributario`,
    payload
  );
  if (!r.success) return { ok: false, error: r.error };
  return { ok: true };
}

export type EliminarClientePreview = {
  suscripciones_activas: number;
  /** Todas las suscripciones del cliente (cualquier estado). */
  suscripciones_total: number;
  suscripciones: { id: string; precio: number; moneda: string }[];
  facturas_pendientes_count: number;
  /** Facturas con estado Pagado. */
  facturas_pagadas_count: number;
  /** Facturas no anuladas (emitidas / vigentes en el libro). */
  facturas_emitidas_count: number;
  /** Pagos registrados contra facturas del cliente. */
  pagos_registrados_count: number;
  factura_ejemplo: { id: string; numero_factura: string; monto: number } | null;
  puede_eliminar: boolean;
  bloqueos: string[];
};

/** Vista previa antes de eliminar (suscripciones activas, facturas con saldo, bloqueos). Solo admin. */
export async function apiGetEliminarClientePreview(clienteId: string): Promise<EliminarClientePreview | null> {
  const res = await fetchWithSupabaseSession(`/api/clientes/${clienteId}/eliminar-preview`);
  const json = await res.json();
  if (!res.ok) return null;
  return json?.data ?? null;
}

/** Eliminación lógica del cliente. Solo admin. Requiere motivo y flags si aplica (ver eliminar-preview). */
export async function apiDeleteCliente(
  id: string,
  deletionReason: string,
  opts?: { cancelar_suscripciones?: boolean; anular_facturas_pendientes?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchWithSupabaseSession(`/api/clientes/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deletion_reason: deletionReason,
      cancelar_suscripciones: opts?.cancelar_suscripciones ?? false,
      anular_facturas_pendientes: opts?.anular_facturas_pendientes ?? false,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    return { ok: false, error: json?.error ?? `Error ${res.status}` };
  }
  return { ok: true };
}


export async function apiCreateFactura(data: {
  cliente_id: string;
  /** Deprecated: el servidor reserva correlativo real por empresa/schema. */
  numero_factura?: string;
  fecha: string;
  fecha_vencimiento: string;
  monto: number;
  tipo: "contado" | "credito" | "suscripcion";
  moneda?: string;
  /** Línea única de detalle (inserta factura_items en el servidor; evita Supabase browser). */
  descripcion_linea?: string;
  /** Solo si `tipo` = suscripcion y no enviás fecha_vencimiento explícita. */
  dia_vencimiento?: number;
  /** IVA puntual por factura (default `iva_10` para preservar comportamiento). */
  iva_tipo?: "exenta" | "iva_5" | "iva_10";
}): Promise<{ id: string; [key: string]: unknown } | null> {
  const result = await apiPost<{ id: string; [key: string]: unknown }>("/api/facturas", data);
  return result.success ? result.data : null;
}

/**
 * Variante con error expuesto. Útil para UI que necesita mostrar el mensaje cuando POST `/api/facturas`
 * falla (p. ej. tenants `erp_*` con PG shim, validaciones de monto/tipo, errores de FK, etc.).
 * El callsite original `apiCreateFactura` se mantiene para preservar todos los demás usos.
 */
export async function apiCreateFacturaWithError(data: Parameters<typeof apiCreateFactura>[0]): Promise<
  | { ok: true; data: { id: string; [key: string]: unknown } }
  | { ok: false; error: string }
> {
  const result = await apiPost<{ id: string; [key: string]: unknown }>("/api/facturas", data);
  if (!result.success) return { ok: false, error: result.error };
  return { ok: true, data: result.data };
}

export type FacturaMasViejaClient = {
  id: string;
  numero_factura: string | null;
  fecha_vencimiento: string | null;
  saldo: number;
};

export type CrearPagoResult =
  | { ok: true; data: { id: string; [key: string]: unknown } }
  | { ok: false; error: string; code?: string; oldest?: FacturaMasViejaClient };

export async function apiCreatePago(data: {
  factura_id: string;
  monto: number;
  fecha_pago: string;
  metodo_pago?: string;
  referencia?: string;
}): Promise<CrearPagoResult> {
  const res = await fetchWithSupabaseSession("/api/pagos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: res.ok ? "Respuesta inválida del servidor" : `Error ${res.status}` };
  }
  const body = json as {
    success?: boolean;
    data?: { id: string; [key: string]: unknown };
    error?: string;
    code?: string;
    oldest?: FacturaMasViejaClient;
  };
  if (!res.ok || body?.success !== true || !body.data) {
    return {
      ok: false,
      error: body?.error ?? `Error ${res.status}`,
      code: body?.code,
      oldest: body?.oldest,
    };
  }
  return { ok: true, data: body.data };
}

export async function apiCreateSuscripcion(data: {
  cliente_id: string;
  plan_id?: string | null;
  precio: number;
  moneda?: string;
  fecha_inicio: string;
  duracion_meses?: number;
  dia_facturacion?: number;
  dia_vencimiento?: number;
  generar_factura_este_mes?: boolean;
  /** Decisión explícita de facturación inicial (preferido sobre generar_factura_este_mes). */
  generar_factura?: boolean;
  periodo_factura?: "actual" | "siguiente" | "none";
  fecha_vencimiento_override?: string | null;
  /** Confirma crear aunque el cliente ya tenga una suscripción activa del mismo plan. */
  permitir_duplicado?: boolean;
}): Promise<{ success: true; data: { id: string; [key: string]: unknown } } | { success: false; error: string }> {
  return apiPost<{ id: string; [key: string]: unknown }>("/api/suscripciones", data);
}

/** Elimina una suscripción. Las facturas ya emitidas se conservan (quedan sin vincular). */
export async function apiDeleteSuscripcion(
  suscripcionId: string
): Promise<{ success: true; data: { id: string; facturas_desvinculadas?: number } } | { success: false; error: string }> {
  const res = await fetchWithSupabaseSession(`/api/suscripciones/${encodeURIComponent(suscripcionId)}`, {
    method: "DELETE",
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { success: false, error: res.ok ? "Respuesta inválida del servidor" : `Error ${res.status}` };
  }
  const body = json as { success?: boolean; data?: { id: string; facturas_desvinculadas?: number }; error?: string };
  if (!res.ok) {
    return { success: false, error: body?.error ?? `Error ${res.status}` };
  }
  if (body?.success !== true || !body.data) {
    return { success: false, error: body?.error ?? "Respuesta inválida del servidor" };
  }
  return { success: true, data: body.data };
}
