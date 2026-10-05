/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Poxi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** Versión publicada. publicar.bat la usa para el tag del release; súbela antes de publicar */
export const VERSION = "1.0.0";

/** "1.2.0" > "1.1.9" → true. Ignora una "v" delante */
export function isNewer(candidate: string, current: string) {
    const parse = (v: string) => v.replace(/^v/, "").split(".").map(n => parseInt(n) || 0);
    const a = parse(candidate), b = parse(current);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
    }
    return false;
}

const UNITS = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 } as const;
type Unit = keyof typeof UNITS;

export const MIN_MS = 3000;
export const MAX_MS = 30 * UNITS.d;

const inRange = (ms: number) => ms >= MIN_MS && ms <= MAX_MS ? ms : null;

/**
 * "1h30m", "45s", "5min", "90" (segundos) → ms. "off" / "0" → 0.
 * Devuelve null si no es válido o se sale del rango permitido.
 */
export function parseDuration(input: string): number | null {
    const s = input.trim().toLowerCase().replace(/\s+/g, "").replace(/min/g, "m");
    if (s === "off" || s === "0") return 0;
    if (/^\d+$/.test(s)) return inRange(Number(s) * 1000);
    if (!/^(\d+[dhms])+$/.test(s)) return null;

    let ms = 0;
    for (const [, n, u] of s.matchAll(/(\d+)([dhms])/g)) ms += Number(n) * UNITS[u as Unit];
    return inRange(ms);
}

/** 90_000 → "1m30s", 3_600_000 → "1h" */
export function formatDuration(ms: number): string {
    let rest = Math.round(ms / 1000) * 1000;
    let out = "";
    for (const u of Object.keys(UNITS) as Unit[]) {
        const n = Math.floor(rest / UNITS[u]);
        if (n) out += n + u;
        rest -= n * UNITS[u];
    }
    return out || "0s";
}

/** Cuenta atrás: 272_000 → "4:32", 3_725_000 → "1:02:05", más de un día → "2d 3h" */
export function formatClock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor(total % 86400 / 3600);
    const m = Math.floor(total % 3600 / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");

    if (d) return `${d}d ${h}h`;
    if (h) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
}

/** "10s, 30s, 1m" → [10000, 30000, 60000], sin inválidos ni duplicados, ordenado */
export function parsePresets(list: string): number[] {
    const values = list.split(",").map(parseDuration).filter((ms): ms is number => !!ms);
    return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * "!t 30s hola" con prefijo "!t" → { ms: 30000, rest: "hola" }.
 * null si no lleva el prefijo, el tiempo es inválido o quedaría un mensaje vacío.
 */
export function matchPrefix(content: string, prefix: string, hasAttachments = false) {
    const p = prefix.trim();
    if (!p || !content.startsWith(p + " ")) return null;

    const m = content.slice(p.length + 1).match(/^\s*(\S+)\s*([\s\S]*)$/);
    if (!m) return null;

    const ms = parseDuration(m[1]);
    if (ms === null || (!m[2] && !hasAttachments)) return null;
    return { ms, rest: m[2] };
}

const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta", "AltGraph"];

/** Evento de teclado → "Ctrl+Alt+T". null si solo se han pulsado modificadores */
export function comboFromEvent(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">) {
    if (MODIFIER_KEYS.includes(e.key)) return null;
    const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    return [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta", key].filter(Boolean).join("+");
}
