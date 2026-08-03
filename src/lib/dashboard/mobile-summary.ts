import "server-only";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";

export type DashboardMobileSummaryData = {
  ventasMes: number;
  porCobrar: number;
  facturasPendientes: number;
  clientesActivos: number;
  stockCritico: number;
  facturasRecientes: Array<{
    id: string;
    numero_factura: string;
    fecha: string;
    monto: number;
    estado: string;
    cliente_nombre: string | null;
  }>;
};

/**
 * Calcula los KPIs del dashboard mobile en una sola pasada.
 * Reusable tanto desde el route handler (/api/dashboard/mobile-summary) como
 * desde server components que quieran pre-warmear los datos.
 */
export async function fetchDashboardMobileSummary(
  request?: Request | null
): Promise<DashboardMobileSummaryData | null> {
  const ctx = await getTenantSupabaseFromAuth(request ?? null);
  if (!ctx) return null;
  const { auth, supabase } = ctx;
  const empresaId = auth.empresa_id;

  const hoy = new Date();
  const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
  const finMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-31`;

  const [facturasMesQ, facturasPendQ, clientesQ, productosQ, recientesQ] = await Promise.all([
    supabase
      .from("facturas")
      .select("monto, saldo, estado")
      .eq("empresa_id", empresaId)
      .gte("fecha", inicioMes)
      .lte("fecha", finMes),
    supabase
      .from("facturas")
      .select("saldo, estado")
      .eq("empresa_id", empresaId)
      .gt("saldo", 0),
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId),
    supabase.from("productos").select("stock_actual, stock_minimo").eq("empresa_id", empresaId),
    supabase
      .from("facturas")
      .select("id, numero_factura, fecha, monto, estado, cliente_id")
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false })
      .limit(5),
  ]);

  type FacturaMes = { monto: number; saldo: number; estado: string };
  type FacturaPend = { saldo: number; estado: string };
  type Producto = { stock_actual: number; stock_minimo: number };
  type FacturaReciente = {
    id: string;
    numero_factura: string;
    fecha: string;
    monto: number;
    estado: string;
    cliente_id: string | null;
  };

  const facturasMesRows = (facturasMesQ.data ?? []) as FacturaMes[];
  const facturasPendRows = (facturasPendQ.data ?? []) as FacturaPend[];
  const productosRows = (productosQ.data ?? []) as Producto[];
  const recientesRows = (recientesQ.data ?? []) as FacturaReciente[];

  const ventasMes = facturasMesRows
    .filter((f) => {
      const s = String(f.estado ?? "").toLowerCase().trim();
      return s !== "anulado" && s !== "corregida nc";
    })
    .reduce((acc, f) => acc + Number(f.monto ?? 0), 0);

  const facturasPendActivas = facturasPendRows.filter((f) => {
    const s = String(f.estado ?? "").toLowerCase().trim();
    return s !== "anulado" && s !== "corregida nc";
  });
  const porCobrar = facturasPendActivas.reduce((acc, f) => acc + Number(f.saldo ?? 0), 0);
  const facturasPendientes = facturasPendActivas.length;

  const clientesActivos = clientesQ.count ?? 0;
  const stockCritico = productosRows.filter(
    (p) => Number(p.stock_actual ?? 0) <= Number(p.stock_minimo ?? 0)
  ).length;

  const clienteIds = [...new Set(recientesRows.map((r) => r.cliente_id).filter((id): id is string => !!id))];
  const nombreByCliente = new Map<string, string>();
  if (clienteIds.length > 0) {
    const { data: clientes } = await supabase
      .from("clientes")
      .select("id, empresa, nombre_contacto")
      .eq("empresa_id", empresaId)
      .in("id", clienteIds);
    for (const c of (clientes ?? []) as Array<{ id: string; empresa?: string; nombre_contacto?: string }>) {
      nombreByCliente.set(c.id, c.empresa?.trim() || c.nombre_contacto?.trim() || "");
    }
  }

  return {
    ventasMes,
    porCobrar,
    facturasPendientes,
    clientesActivos,
    stockCritico,
    facturasRecientes: recientesRows.map((f) => ({
      id: f.id,
      numero_factura: f.numero_factura,
      fecha: f.fecha,
      monto: f.monto,
      estado: f.estado,
      cliente_nombre: f.cliente_id ? nombreByCliente.get(f.cliente_id) ?? null : null,
    })),
  };
}
