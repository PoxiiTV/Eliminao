/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Poxi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export interface Scope {
    enabled: boolean;
    ms: number;
    /** Se desactiva solo tras enviar un mensaje */
    once: boolean;
}

export const settings = definePluginSettings({
    global: {
        type: OptionType.CUSTOM,
        default: { enabled: false, ms: 60_000, once: false } as Scope
    },
    /** Configuración propia de cada canal; si no hay, se usa la global */
    channels: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, Scope>
    },
    presets: {
        type: OptionType.STRING,
        description: "Tiempos rápidos del panel, separados por comas (ej. 10s, 1m, 2h30m)",
        default: "10s, 30s, 1m, 5m, 15m, 1h, 8h, 1d"
    },
    prefix: {
        type: OptionType.STRING,
        description: "Prefijo para darle tiempo a un solo mensaje: \"!t 30s hola\" (\"!t off hola\" para no borrarlo). Vacío = desactivado",
        default: "!t"
    },
    showCountdown: {
        type: OptionType.BOOLEAN,
        description: "Mostrar la cuenta atrás al final de tus mensajes temporales",
        default: true
    },
    notifyOnDelete: {
        type: OptionType.BOOLEAN,
        description: "Mostrar un aviso cada vez que se elimina un mensaje",
        default: false
    }
});

export const getScope = (channelId: string): Scope =>
    settings.store.channels[channelId] ?? settings.store.global;

export const hasOwnScope = (channelId: string) => channelId in settings.store.channels;

// Las escrituras trabajan sobre copias planas y reasignan el objeto entero: así no se cuelan
// proxies anidados en lo que se guarda y los hooks settings.use() se enteran del cambio.
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Modifica la configuración que aplica ahora mismo en el canal (la propia o la global) */
export function updateScope(channelId: string, patch: Partial<Scope>) {
    const channels = copy(settings.store.channels);
    if (channelId in channels) settings.store.channels = { ...channels, [channelId]: { ...channels[channelId], ...patch } };
    else settings.store.global = { ...copy(settings.store.global), ...patch };
}

/** true: el canal pasa a tener su propia configuración (copia de la global). false: vuelve a la global */
export function setOwnScope(channelId: string, own: boolean) {
    const { [channelId]: current, ...rest } = copy(settings.store.channels);
    settings.store.channels = own ? { ...rest, [channelId]: current ?? copy(settings.store.global) } : rest;
}
