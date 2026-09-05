import { useEffect, useMemo } from "react";
import type { InstitutionSettings } from "./model";
import "./school-brand.css";

function safeHex(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

function onColor(hex: string) {
  const value = hex.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
  const channel = (component: number) => component <= 0.03928 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  return luminance > 0.53 ? "#101827" : "#ffffff";
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function SchoolBrand({ institution }: { institution: InstitutionSettings }) {
  const name = institution.name.trim() || "Sua instituição";
  const primary = safeHex(institution.primaryColor, "#1649b8");
  const secondary = safeHex(institution.secondaryColor, "#0f766e");
  const foreground = useMemo(() => onColor(primary), [primary]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--school-primary", primary);
    root.style.setProperty("--school-secondary", secondary);
    root.style.setProperty("--school-on-primary", foreground);
  }, [primary, secondary, foreground]);

  return <>
    <span className="brand-mark school-brand-mark" aria-hidden="true">
      {institution.logoDataUrl
        ? <img src={institution.logoDataUrl} alt="" />
        : <b>{initials(name)}</b>}
      <i />
    </span>
    <span className="school-brand-copy">
      <strong title={name}>{name}</strong>
      <small>AulaFácil</small>
    </span>
  </>;
}
