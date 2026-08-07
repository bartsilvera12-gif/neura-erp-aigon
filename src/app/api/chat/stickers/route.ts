import { NextResponse } from "next/server";
import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";

export const runtime = "nodejs";

/**
 * GET /api/chat/stickers
 * Lista los paquetes y sus stickers para el picker de la vista mobile.
 *
 * Response:
 * {
 *   packs: [
 *     { id, nombre, orden, stickers: [{ id, public_url, kind, orden }] }
 *   ]
 * }
 */
export async function GET() {
  try {
    const ctx = await requireEmpresaTenantServiceRole();
    const { supabase, empresa_id } = ctx;

    const { data: packRows, error: packErr } = await supabase
      .from("sticker_packs")
      .select("id, nombre, orden")
      .eq("empresa_id", empresa_id)
      .eq("activo", true)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });

    if (packErr) {
      return NextResponse.json({ ok: false, error: packErr.message }, { status: 500 });
    }

    const packs = (packRows ?? []) as Array<{ id: string; nombre: string; orden: number }>;
    if (packs.length === 0) {
      return NextResponse.json({ ok: true, packs: [] });
    }

    const packIds = packs.map((p) => p.id);
    const { data: stickerRows, error: stErr } = await supabase
      .from("stickers")
      .select("id, pack_id, public_url, kind, orden, created_at")
      .in("pack_id", packIds)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: false });

    if (stErr) {
      return NextResponse.json({ ok: false, error: stErr.message }, { status: 500 });
    }

    const byPack = new Map<string, Array<{ id: string; public_url: string; kind: string; orden: number }>>();
    for (const s of (stickerRows ?? []) as Array<{
      id: string;
      pack_id: string;
      public_url: string;
      kind: string;
      orden: number;
    }>) {
      const arr = byPack.get(s.pack_id) ?? [];
      arr.push({ id: s.id, public_url: s.public_url, kind: s.kind, orden: s.orden });
      byPack.set(s.pack_id, arr);
    }

    return NextResponse.json({
      ok: true,
      packs: packs.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        orden: p.orden,
        stickers: byPack.get(p.id) ?? [],
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
