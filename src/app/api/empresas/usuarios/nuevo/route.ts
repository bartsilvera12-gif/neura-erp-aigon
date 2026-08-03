import { supabaseServiceRoleClientOptions } from "@/lib/supabase/schema";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getServiceAuthUsuario } from "@/lib/auth/get-service-auth-usuario";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";

function emailExistsInAuthError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("already been registered") ||
    m.includes("already registered") ||
    m.includes("user already registered") ||
    m.includes("duplicate")
  );
}

/**
 * Crea un usuario NUEVO en Auth + `usuarios`.
 *
 * Guardrail crítico: "crear" jamás modifica un usuario existente. Si el correo ya existe
 * (en `usuarios` o en Auth) se RECHAZA — nunca se sobrescribe contraseña ni perfil/rol.
 * (Antes, un email autocompletado por el navegador —p. ej. el del propio admin— pisaba
 * la contraseña y degradaba el rol del usuario existente.)
 */
export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "Config no disponible" }, { status: 500 });
    }

    const authR = await getServiceAuthUsuario(req);
    if (!authR.ok) {
      return NextResponse.json({ error: "No autenticado" }, { status: authR.status });
    }
    if (!authR.catalogUsuario) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 });
    }

    const supabase = createClient(url, serviceKey, { ...supabaseServiceRoleClientOptions });

    const admin = {
      empresa_id: authR.catalogUsuario.empresa_id ?? undefined,
      rol: authR.catalogUsuario.rol ?? undefined,
    };

    if (!admin.empresa_id && admin.rol !== "super_admin") {
      return NextResponse.json({ error: "Tu usuario no tiene empresa asignada." }, { status: 403 });
    }

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const nombre = String(body.nombre ?? "").trim();
    const telefono = body.telefono ? String(body.telefono).trim() : null;
    const fecha_nacimiento = body.fecha_nacimiento ? String(body.fecha_nacimiento) : null;
    const fecha_ingreso = body.fecha_ingreso ? String(body.fecha_ingreso) : null;
    const tipoRaw = body.tipo_contrato ? String(body.tipo_contrato).trim().toLowerCase() : null;
    const tipoOk = ["salario", "comision", "mixto", "prestador_servicio"];
    const tipo_contrato = tipoRaw && tipoOk.includes(tipoRaw) ? tipoRaw : null;
    const parseGs = (v: unknown): number | null => {
      if (v === undefined || v === null || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(/\s/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const parsePct = (v: unknown): number | null => {
      if (v === undefined || v === null || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v));
      return Number.isFinite(n) ? n : null;
    };
    const salario_base = parseGs(body.salario_base);
    const porcentaje_comision = parsePct(body.porcentaje_comision);
    const ips = Boolean(body.ips);
    const areaRaw = body.area ? String(body.area).trim().toLowerCase() : null;
    const areasOk = ["ventas", "soporte", "finanzas", "operaciones", "administracion"];
    const area = areaRaw && areasOk.includes(areaRaw) ? areaRaw : null;
    const rol = String(body.rol ?? "usuario");

    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: "Email y contraseña (mín. 6 caracteres) son obligatorios." }, { status: 400 });
    }
    if (!nombre) {
      return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
    }

    if (porcentaje_comision != null && (porcentaje_comision < 0 || porcentaje_comision > 100)) {
      return NextResponse.json({ error: "La comisión debe estar entre 0 y 100." }, { status: 400 });
    }

    const empresaId = admin.empresa_id;
    if (!empresaId) {
      return NextResponse.json({ error: "Solo un administrador de empresa puede crear usuarios." }, { status: 403 });
    }

    // 1) Rechazar si el correo YA existe en `usuarios` (nunca sobrescribir un perfil/rol).
    const { data: existente } = await supabase
      .from("usuarios")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existente?.id) {
      return NextResponse.json(
        {
          error:
            "Ese correo ya está registrado en el sistema. Para modificar ese usuario usá 'Editar'; acá no se puede crear uno nuevo con el mismo correo.",
        },
        { status: 409 }
      );
    }

    // 2) Crear en Auth. Si ya existe en Auth → rechazar (NO se toca la contraseña de nadie).
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      if (emailExistsInAuthError(createErr.message)) {
        return NextResponse.json(
          {
            error:
              "Ese correo ya está registrado en el sistema de acceso (Auth). No se puede crear un usuario nuevo con ese correo.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }
    const authUserId: string | null = created.user?.id ?? null;

    const payload = {
      empresa_id: empresaId,
      email,
      nombre,
      telefono,
      fecha_nacimiento,
      fecha_ingreso,
      tipo_contrato,
      salario_base,
      porcentaje_comision,
      ips,
      area,
      rol,
      auth_user_id: authUserId,
      estado: "activo" as const,
    };

    // 3) INSERT (nunca update). Si falla, revierte el Auth recién creado (sin huérfanos).
    const { data: inserted, error: insErr } = await supabase
      .from("usuarios")
      .insert([payload])
      .select("id")
      .single();
    if (insErr) {
      if (authUserId) await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
    if (!inserted?.id) {
      return NextResponse.json({ error: "No se pudo obtener el id del usuario creado." }, { status: 500 });
    }
    const targetId: string = inserted.id as string;

    await supabase.from("usuario_modulos").delete().eq("usuario_id", targetId);
    if (!esRolAdminEmpresa(rol)) {
      const { data: emActivos } = await supabase
        .from("empresa_modulos")
        .select("modulo_id")
        .eq("empresa_id", empresaId)
        .eq("activo", true);
      if (emActivos && emActivos.length > 0) {
        const umRows = emActivos.map((r) => ({
          usuario_id: targetId,
          modulo_id: r.modulo_id as string,
        }));
        const { error: errUm } = await supabase.from("usuario_modulos").insert(umRows);
        if (errUm) {
          return NextResponse.json(
            { error: `Usuario guardado pero error al asignar módulos: ${errUm.message}` },
            { status: 400 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Usuario creado correctamente.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
