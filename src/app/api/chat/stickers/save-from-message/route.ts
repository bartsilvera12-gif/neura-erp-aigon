import { NextRequest, NextResponse } from "next/server";
import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";
import {
  getErpAttachmentPublicUrl,
  getWhatsAppMediaUrlFromRawPayload,
  type RawPayload,
} from "@/lib/chat/message-erp-display";

export const runtime = "nodejs";

const CHAT_STICKERS_BUCKET = "chat-stickers";

/**
 * POST /api/chat/stickers/save-from-message
 * Guarda a la biblioteca de stickers un sticker RECIBIDO de un cliente.
 *
 * Body:
 *  { message_id: uuid, pack_id?: uuid, new_pack_name?: string }
 *  Al menos uno de pack_id / new_pack_name es obligatorio.
 *
 * Flujo:
 *  1. Carga el chat_message. Debe ser sticker entrante (from_me=false, message_type='sticker').
 *  2. Extrae la URL del sticker desde raw_payload (Meta o Storage propio).
 *  3. Copia el .webp al bucket `chat-stickers` de la empresa.
 *  4. Crea/reutiliza el pack, inserta la fila en `stickers`.
 *
 * Idempotente por `(empresa_id, storage_path)`: si intentás guardar el mismo
 * sticker (mismo binario) dos veces, devuelve la fila existente.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireEmpresaTenantServiceRole();
  } catch {
    return NextResponse.json({ ok: false, error: "Iniciá sesión" }, { status: 401 });
  }
  const { supabase, empresa_id, usuario_id } = ctx;

  const body = (await request.json().catch(() => null)) as
    | { message_id?: string; pack_id?: string; new_pack_name?: string }
    | null;

  const messageId = typeof body?.message_id === "string" ? body.message_id.trim() : "";
  const packIdInput = typeof body?.pack_id === "string" ? body.pack_id.trim() : "";
  const newPackName = typeof body?.new_pack_name === "string" ? body.new_pack_name.trim() : "";

  if (!messageId) {
    return NextResponse.json({ ok: false, error: "message_id requerido" }, { status: 400 });
  }
  if (!packIdInput && !newPackName) {
    return NextResponse.json(
      { ok: false, error: "Elegí un paquete existente o dale un nombre a uno nuevo" },
      { status: 400 }
    );
  }

  // 1) Cargar el mensaje
  const { data: msgRow, error: msgErr } = await supabase
    .from("chat_messages")
    .select("id, empresa_id, message_type, from_me, raw_payload")
    .eq("id", messageId)
    .eq("empresa_id", empresa_id)
    .maybeSingle();
  if (msgErr) {
    return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
  }
  if (!msgRow) {
    return NextResponse.json({ ok: false, error: "Mensaje no encontrado" }, { status: 404 });
  }
  const msg = msgRow as {
    id: string;
    empresa_id: string;
    message_type: string;
    from_me: boolean;
    raw_payload: RawPayload;
  };
  if (msg.message_type !== "sticker" || msg.from_me) {
    return NextResponse.json(
      { ok: false, error: "Solo se pueden guardar stickers recibidos de clientes" },
      { status: 400 }
    );
  }

  // 2) URL de origen (Storage propio prioridad; luego el link de Meta que puede caducar)
  const sourceUrl =
    getErpAttachmentPublicUrl(msg.raw_payload) ??
    getWhatsAppMediaUrlFromRawPayload(msg.raw_payload);
  if (!sourceUrl) {
    return NextResponse.json(
      { ok: false, error: "El sticker ya no tiene URL disponible" },
      { status: 400 }
    );
  }

  // 3) Bucket
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!(buckets ?? []).some((b) => b.name === CHAT_STICKERS_BUCKET)) {
      const { error: bcErr } = await supabase.storage.createBucket(CHAT_STICKERS_BUCKET, {
        public: true,
        fileSizeLimit: "1MB", // límites Meta: 100KB estático, 500KB animado; 1MB de margen
      });
      if (bcErr && !bcErr.message.toLowerCase().includes("already exists")) {
        return NextResponse.json({ ok: false, error: bcErr.message }, { status: 500 });
      }
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "bucket setup falló" },
      { status: 500 }
    );
  }

  // 4) Descargar el binario del sticker
  let stickerBytes: ArrayBuffer;
  let contentType = "image/webp";
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `No se pudo descargar el sticker (HTTP ${res.status})` },
        { status: 500 }
      );
    }
    contentType = res.headers.get("content-type") ?? "image/webp";
    stickerBytes = await res.arrayBuffer();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "descarga falló" },
      { status: 500 }
    );
  }

  // 5) Detectar animado (heurística por rawPayload sticker.animated de Meta)
  const rp = msg.raw_payload as { sticker?: { animated?: boolean } } | null;
  const isAnimated = Boolean(rp?.sticker?.animated);
  const kind: "static" | "animated" = isAnimated ? "animated" : "static";

  // 6) Subir. Path determinístico por message_id → idempotente aunque se toque dos veces.
  const storagePath = `${empresa_id}/from-msg/${msg.id}.webp`;
  const { error: upErr } = await supabase.storage
    .from(CHAT_STICKERS_BUCKET)
    .upload(storagePath, stickerBytes, {
      contentType,
      upsert: true,
    });
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: `Subida falló: ${upErr.message}` },
      { status: 500 }
    );
  }

  const { data: pubData } = supabase.storage.from(CHAT_STICKERS_BUCKET).getPublicUrl(storagePath);
  const publicUrl = pubData?.publicUrl;
  if (!publicUrl) {
    return NextResponse.json(
      { ok: false, error: "No se pudo obtener la URL pública" },
      { status: 500 }
    );
  }

  // 7) Resolver o crear el paquete
  let packId = packIdInput;
  if (!packId && newPackName) {
    // Reusar si ya existe uno con el mismo nombre (evita duplicados por race)
    const { data: existing } = await supabase
      .from("sticker_packs")
      .select("id")
      .eq("empresa_id", empresa_id)
      .eq("nombre", newPackName)
      .maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
      packId = String((existing as { id: string }).id);
    } else {
      const { data: created, error: packErr } = await supabase
        .from("sticker_packs")
        .insert({ empresa_id, nombre: newPackName, orden: 0, activo: true })
        .select("id")
        .maybeSingle();
      if (packErr || !(created as { id?: string } | null)?.id) {
        return NextResponse.json(
          { ok: false, error: packErr?.message ?? "No se pudo crear el paquete" },
          { status: 500 }
        );
      }
      packId = String((created as { id: string }).id);
    }
  }

  // 8) Insert / upsert del sticker (idempotente por unique storage_path)
  const { data: stickerRow, error: stErr } = await supabase
    .from("stickers")
    .upsert(
      {
        empresa_id,
        pack_id: packId,
        storage_path: storagePath,
        public_url: publicUrl,
        kind,
        source_message_id: msg.id,
        saved_by_user_id: usuario_id,
        orden: 0,
      },
      { onConflict: "empresa_id,storage_path" }
    )
    .select("id, public_url, kind")
    .maybeSingle();

  if (stErr) {
    return NextResponse.json({ ok: false, error: stErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sticker: stickerRow,
    pack_id: packId,
  });
}
