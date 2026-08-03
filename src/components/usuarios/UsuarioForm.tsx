"use client";

import MontoInput from "@/components/ui/MontoInput";
import { FancySelect, type FancySelectOption } from "@/app/dashboard/proyectos/components/FancySelect";
import type { AreaUsuario, NivelUsuario, TipoContrato } from "@/lib/usuarios/types";

export const usuarioFormLabel =
  "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";
export const usuarioFormInput =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
export const usuarioFormInputGray = usuarioFormInput;
export const usuarioFormSelect = usuarioFormInput;

export function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-[#4FAEB2]/15">
      <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-3">
        <span className="text-base">{icon}</span>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export type UsuarioFormValues = {
  nombre: string;
  email: string;
  telefono: string;
  fecha_nacimiento: string;
  fecha_ingreso: string;
  tipo_contrato: TipoContrato;
  salario_base: string;
  porcentaje_comision: string;
  ips: boolean;
  nivel: NivelUsuario;
  area: AreaUsuario;
  estado: "activo" | "inactivo";
  password: string;
  password2: string;
  /** Solo edición: módulos asignados (ids). */
  modulo_ids: string[];
  /** Vistas de dashboard permitidas (ids de catálogo). */
  dashboard_view_ids: string[];
  /** Vista por defecto al abrir el tablero (id de catálogo). */
  default_dashboard_view_id: string;
};

export function emptyUsuarioForm(): UsuarioFormValues {
  return {
    nombre: "",
    email: "",
    telefono: "",
    fecha_nacimiento: "",
    fecha_ingreso: "",
    tipo_contrato: "salario",
    salario_base: "",
    porcentaje_comision: "",
    ips: false,
    nivel: "usuario",
    area: "ventas",
    estado: "activo",
    password: "",
    password2: "",
    modulo_ids: [],
    dashboard_view_ids: [],
    default_dashboard_view_id: "",
  };
}

export function nivelFromRolDb(rol: string | null | undefined): NivelUsuario {
  const r = (rol ?? "").trim().toLowerCase();
  if (r === "administrador" || r === "admin") return "administrador";
  if (r === "supervisor") return "supervisor";
  return "usuario";
}

export function rolFromNivelForm(nivel: NivelUsuario): string {
  return nivel === "administrador" ? "administrador" : nivel;
}

export type UsuarioFormProps = {
  variant: "create" | "edit";
  form: UsuarioFormValues;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  /** Callback opcional para los FancySelect (tipo_contrato, nivel, area, estado). */
  onSelectChange?: (name: string, value: string) => void;
  onSalarioBaseChange: (n: number | "") => void;
  /** Clases de campo: create usa focus sky, edit usa gray (misma página detalle). */
  fieldClassName?: typeof usuarioFormInput | string;
  showPwd?: boolean;
  setShowPwd?: (v: boolean | ((p: boolean) => boolean)) => void;
  showPwd2?: boolean;
  setShowPwd2?: (v: boolean | ((p: boolean) => boolean)) => void;
  /** Debajo de "Accesos", antes de seguridad / pie (p. ej. módulos en edición). */
  extraSections?: React.ReactNode;
  /** Solo administradores pueden cambiar nivel (rol ERP). */
  nivelAccesoDisabled?: boolean;
};

const TIPO_CONTRATO_OPTIONS: FancySelectOption[] = [
  { value: "salario", label: "Salario fijo" },
  { value: "comision", label: "Comisión" },
  { value: "mixto", label: "Mixto (salario + comisión)" },
  { value: "prestador_servicio", label: "Prestador de servicio" },
];

const NIVEL_OPTIONS: FancySelectOption[] = [
  { value: "usuario", label: "Usuario", description: "Acceso operativo estándar." },
  { value: "supervisor", label: "Supervisor", description: "Supervisión de equipo y reportes acotados." },
  { value: "administrador", label: "Administrador", description: "Acceso total al sistema." },
];

const AREA_OPTIONS: FancySelectOption[] = [
  { value: "ventas", label: "Ventas" },
  { value: "soporte", label: "Soporte" },
  { value: "finanzas", label: "Finanzas" },
  { value: "operaciones", label: "Operaciones" },
  { value: "administracion", label: "Administración" },
];

const ESTADO_OPTIONS: FancySelectOption[] = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
];

export function UsuarioFormFields({
  variant,
  form,
  onChange,
  onSelectChange,
  onSalarioBaseChange,
  fieldClassName,
  showPwd = false,
  setShowPwd = () => {},
  showPwd2 = false,
  setShowPwd2 = () => {},
  extraSections,
  nivelAccesoDisabled,
}: UsuarioFormProps) {
  const fLabel = usuarioFormLabel;
  const fInput = fieldClassName ?? usuarioFormInput;
  const showComision = form.tipo_contrato === "comision" || form.tipo_contrato === "mixto";
  const showSalario = form.tipo_contrato !== "comision";

  const setField = (name: string, value: string) => {
    if (onSelectChange) {
      onSelectChange(name, value);
      return;
    }
    // Fallback: sintetiza un evento mínimo para mantener compatibilidad con handleChange existente.
    onChange({
      target: { name, value, type: "select-one" },
    } as unknown as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <>
      <SectionCard title="Datos personales" icon="👤">
        <div className="space-y-4">
          <div>
            <label className={fLabel}>Nombre completo *</label>
            <input
              type="text"
              name="nombre"
              value={form.nombre}
              onChange={onChange}
              placeholder="Ej: JUAN PÉREZ"
              className={`${fInput} uppercase`}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={fLabel}>Email *</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={onChange}
                placeholder="usuario@empresa.com"
                className={fInput}
                autoComplete="off"
                required
              />
            </div>
            <div>
              <label className={fLabel}>Teléfono</label>
              <input
                type="text"
                name="telefono"
                value={form.telefono}
                onChange={onChange}
                placeholder="0981-000000"
                className={fInput}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={fLabel}>Fecha de nacimiento</label>
              <input type="date" name="fecha_nacimiento" value={form.fecha_nacimiento} onChange={onChange} className={fInput} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Datos laborales" icon="💼">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={fLabel}>Fecha de ingreso</label>
              <input type="date" name="fecha_ingreso" value={form.fecha_ingreso} onChange={onChange} className={fInput} />
            </div>
            <div>
              <label className={fLabel}>Tipo de contrato</label>
              <FancySelect
                options={TIPO_CONTRATO_OPTIONS}
                value={form.tipo_contrato}
                onChange={(v) => setField("tipo_contrato", v)}
                ariaLabel="Tipo de contrato"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {showSalario && (
              <div>
                <label className={fLabel}>Salario base (Gs.)</label>
                <MontoInput
                  value={form.salario_base}
                  onChange={(n) => onSalarioBaseChange(n)}
                  placeholder="0"
                  className={fInput}
                  decimals={false}
                />
              </div>
            )}
            {showComision && (
              <div>
                <label className={fLabel}>Comisión (%)</label>
                <input
                  type="number"
                  name="porcentaje_comision"
                  value={form.porcentaje_comision}
                  onChange={onChange}
                  min={0}
                  max={100}
                  step="0.5"
                  placeholder="0"
                  className={fInput}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <input
              type="checkbox"
              id="ips"
              name="ips"
              checked={form.ips}
              onChange={onChange}
              className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]/30"
            />
            <label htmlFor="ips" className="cursor-pointer text-sm font-medium text-slate-700">
              Cotiza IPS
              <span className="ml-1 text-xs font-normal text-slate-400">(Instituto de Previsión Social)</span>
            </label>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Accesos del sistema" icon="🔐">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={fLabel}>Nivel de acceso</label>
            <FancySelect
              options={NIVEL_OPTIONS}
              value={form.nivel}
              onChange={(v) => setField("nivel", v)}
              disabled={nivelAccesoDisabled}
              ariaLabel="Nivel de acceso"
            />
            {nivelAccesoDisabled ? (
              <p className="mt-1 text-xs text-amber-700">Solo un administrador puede cambiar el nivel de acceso.</p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">
                {form.nivel === "administrador" && "Acceso total al sistema."}
                {form.nivel === "supervisor" && "Supervisión de equipo y reportes acotados."}
                {form.nivel === "usuario" && "Acceso operativo estándar."}
              </p>
            )}
          </div>
          <div>
            <label className={fLabel}>Área</label>
            <FancySelect
              options={AREA_OPTIONS}
              value={form.area}
              onChange={(v) => setField("area", v)}
              ariaLabel="Área"
            />
          </div>
          <div>
            <label className={fLabel}>Estado</label>
            <FancySelect
              options={ESTADO_OPTIONS}
              value={form.estado}
              onChange={(v) => setField("estado", v)}
              ariaLabel="Estado"
            />
          </div>
        </div>
      </SectionCard>

      {extraSections}

      {variant === "create" ? (
        <SectionCard title="Seguridad" icon="🔑">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={fLabel}>Contraseña *</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={onChange}
                  placeholder="Mínimo 6 caracteres"
                  className={`${fInput} pr-10`}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#4FAEB2]"
                >
                  <EyeIcon open={showPwd} />
                </button>
              </div>
            </div>
            <div>
              <label className={fLabel}>Confirmar contraseña *</label>
              <div className="relative">
                <input
                  type={showPwd2 ? "text" : "password"}
                  name="password2"
                  value={form.password2}
                  onChange={onChange}
                  placeholder="Repetir contraseña"
                  className={`${fInput} pr-10`}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd2((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#4FAEB2]"
                >
                  <EyeIcon open={showPwd2} />
                </button>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            La contraseña se gestiona en Supabase Auth (servidor seguro).
          </p>
        </SectionCard>
      ) : null}
    </>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z"
        clipRule="evenodd"
      />
      <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path
        fillRule="evenodd"
        d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
