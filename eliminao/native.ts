/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Poxi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Se ejecuta en el proceso principal de Discord (Node). __dirname es la carpeta dist de Vencord,
// la misma desde la que Discord carga patcher.js, preload.js y renderer.js/css.

import { app, IpcMainInvokeEvent } from "electron";
import { existsSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

import { isNewer } from "./utils";

const RELEASES = "https://github.com/PoxiiTV/Eliminao/releases/latest/download/";
const FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];

export interface UpdateInfo { version: string; notes?: string; }

/** Instalación desde código fuente (instalar.bat): no se toca, para no pisar tus builds */
const isDevInstall = () => existsSync(join(__dirname, "..", ".git"));

export async function checkForUpdate(_: IpcMainInvokeEvent, current: string): Promise<UpdateInfo | null> {
    if (isDevInstall()) return null;
    const res = await fetch(RELEASES + "version.json", { cache: "no-store" });
    if (!res.ok) return null;
    const info: UpdateInfo = await res.json();
    return isNewer(info.version, current) ? info : null;
}

/** Descarga todo antes de tocar nada y luego sustituye: o se actualiza entero o no cambia nada */
export async function downloadUpdate(_: IpcMainInvokeEvent, version: string) {
    const files = await Promise.all(FILES.map(async name => {
        const res = await fetch(RELEASES + name, { cache: "no-store" });
        if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
        return { name, data: Buffer.from(await res.arrayBuffer()) };
    }));

    // Un renderer sin Eliminao dentro significaría un release roto: mejor no instalarlo
    const renderer = files.find(f => f.name === "renderer.js")!;
    if (!renderer.data.includes("Eliminao")) throw new Error("renderer.js no contiene Eliminao");

    try {
        for (const { name, data } of files) writeFileSync(join(__dirname, name + ".new"), data);
        for (const { name } of files) renameSync(join(__dirname, name + ".new"), join(__dirname, name));
    } finally {
        for (const name of FILES) rmSync(join(__dirname, name + ".new"), { force: true });
    }

    // El instalador lee aquí la versión instalada (Actualizar / reparar)
    writeFileSync(join(__dirname, "..", "version.json"), JSON.stringify({ version }, null, 4));
}

export function relaunch(_: IpcMainInvokeEvent) {
    app.relaunch();
    app.exit(0);
}
