import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireAgendaApiAccess } from "@/lib/agenda/agenda-auth";

const TZ = "America/Asuncion";

/** Offset (local - UTC) en ms para un instante dado en la zona de negocio. */
function tzOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUTC = Date.UTC(
    +map.year,
    +map.month - 1,
    +map.day,
    +map.hour,
    +map.minute,
    +map.second
  );
  return asUTC - date.getTime();
}

/** Rango [inicio, fin) del día de hoy en America/Asuncion, expresado en ISO UTC. */
function rangoHoy(now: Date): { startIso: string; endIso: string } {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  // offset estable usando el mediodía local (evita bordes de DST).
  const noonUtcGuess = Date.UTC(y, m - 1, d, 12, 0, 0);
  const offset = tzOffsetMs(new Date(noonUtcGuess));
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - offset;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
  return { startIso: new Date(startUtcMs).toISOString(), endIso: new Date(endUtcMs).toISOString() };
}

export async function GET(request: Request) {
  const auth = await requireAgendaApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const empresaId = auth.empresaId;
    const { startIso, endIso } = rangoHoy(new Date());

    const base = () => sb.from("agenda_citas").select("*", { count: "exact", head: true }).eq("empresa_id", empresaId);

    const [hoy, pendientes, confirmadas, completadas, canceladasNoAsistio] = await Promise.all([
      base().gte("inicio_at", startIso).lt("inicio_at", endIso).not("estado", "in", "(cancelada,reprogramada)"),
      base().eq("estado", "pendiente"),
      base().eq("estado", "confirmada"),
      base().eq("estado", "completada"),
      base().in("estado", ["cancelada", "no_asistio"]),
    ]);

    const firstErr =
      hoy.error || pendientes.error || confirmadas.error || completadas.error || canceladasNoAsistio.error;
    if (firstErr) return NextResponse.json(errorResponse(firstErr.message), { status: 400 });

    return NextResponse.json(
      successResponse({
        hoy: hoy.count ?? 0,
        pendientes: pendientes.count ?? 0,
        confirmadas: confirmadas.count ?? 0,
        completadas: completadas.count ?? 0,
        canceladas_no_asistio: canceladasNoAsistio.count ?? 0,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
