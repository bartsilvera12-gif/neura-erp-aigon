"use client";

import Link from "next/link";
import type { ComponentType } from "react";

export type SettingsModuleBadgeTone = "active" | "inactive" | "neutral";

function badgeClasses(tone: SettingsModuleBadgeTone): string {
  if (tone === "active")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "inactive")
    return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]";
}

function badgeDotClass(tone: SettingsModuleBadgeTone): string {
  if (tone === "active") return "bg-emerald-500";
  if (tone === "inactive") return "bg-slate-400";
  return "bg-[#4FAEB2]";
}

export type SettingsModuleCardProps = {
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
  badge?: { label: string; tone: SettingsModuleBadgeTone };
  href?: string;
  disabled?: boolean;
  onSelect?: () => void;
  actionLabel?: string;
};

/**
 * Card uniforme para el centro de configuración. Mismo tamaño para todas:
 * - description con `line-clamp-3` + `min-h-[3.75rem]` reserva el alto
 * - footer pegado abajo via `mt-auto`
 *
 * Paleta: blanco + turquesa #4FAEB2.
 */
export function SettingsModuleCard({
  title,
  subtitle,
  icon: Icon,
  description,
  badge,
  href,
  disabled,
  onSelect,
  actionLabel = "Editar",
}: SettingsModuleCardProps) {
  const shell =
    "group relative flex h-full flex-col rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4FAEB2]/70 hover:shadow-[0_8px_28px_rgba(79,174,178,0.10)]";

  const footerEnabledClass =
    "inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]";
  const footerDisabledClass =
    "inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-400 cursor-not-allowed";

  const header = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#4FAEB2]">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-slate-900">
              {title}
            </h2>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {subtitle}
            </p>
          </div>
        </div>
        {badge ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClasses(badge.tone)}`}
          >
            <span
              aria-hidden="true"
              className={`h-1 w-1 rounded-full ${badgeDotClass(badge.tone)}`}
            />
            {badge.label}
          </span>
        ) : null}
      </div>

      <p className="mt-3 line-clamp-3 min-h-[3.75rem] text-xs leading-relaxed text-slate-500">
        {description}
      </p>
    </>
  );

  const arrow = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );

  const footer =
    href && !disabled ? (
      <Link href={href} className={footerEnabledClass}>
        {actionLabel}
        {arrow}
      </Link>
    ) : disabled ? (
      <button type="button" disabled className={footerDisabledClass}>
        {actionLabel}
      </button>
    ) : (
      <button
        type="button"
        onClick={onSelect}
        className={footerEnabledClass}
      >
        {actionLabel}
        {arrow}
      </button>
    );

  return (
    <article className={`${shell} ${disabled ? "opacity-[0.65]" : ""}`}>
      {header}
      <div className="mt-auto pt-5">{footer}</div>
    </article>
  );
}
