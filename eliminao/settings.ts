/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Poxi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { ChannelStore } from "@webpack/common";

import { ShortcutSetting } from "./components";

export interface Scope {
    enabled: boolean;
    ms: number;
    /** Se desactiva solo tras enviar un mensaje */
    once: boolean;
}

/** De más concreto a más general: se aplica el primero que tenga configuración */
export type ScopeKind = "channel" | "guild" | "global";

export const settings = definePluginSettings({
    global: {
        type: OptionType.CUSTOM,
        default: { enabled: false, ms: 60_000, once: false } as Scope
    },
    channels: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, Scope>
    },
    guilds: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, Scope>
    },
    shortcut: {
        type: OptionType.COMPONENT,
        default: "Alt+T",
        component: ShortcutSetting
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
    autoUpdate: {
        type: OptionType.BOOLEAN,
        description: "Actualizar Eliminao automáticamente cuando salga una versión nueva",
        default: true
    },
    notifyOnDelete: {
        type: OptionType.BOOLEAN,
        description: "Mostrar un aviso cada vez que se elimina un mensaje",
        default: false
    }
});

export const guildOf = (channelId: string): string | null => ChannelStore.getChannel(channelId)?.guild_id ?? null;

export function scopeKind(channelId: string): ScopeKind {
    if (channelId in settings.store.channels) return "channel";
    const guildId = guildOf(channelId);
    return guildId && guildId in settings.store.guilds ? "guild" : "global";
}

export function getScope(channelId: string): Scope {
    const guildId = guildOf(channelId);
    return settings.store.channels[channelId]
        ?? (guildId ? settings.store.guilds[guildId] : undefined)
        ?? settings.store.global;
}

// Las escrituras trabajan sobre copias planas y reasignan el objeto entero: así no se cuelan
// proxies anidados en lo que se guarda y los hooks settings.use() se enteran del cambio.
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function setEntry(key: "channels" | "guilds", id: string, value: Scope | null) {
    const { [id]: _, ...rest } = copy(settings.store[key]);
    settings.store[key] = value ? { ...rest, [id]: value } : rest;
}

/** Modifica la configuración que aplica ahora mismo en el canal (la del chat, la del servidor o la global) */
export function updateScope(channelId: string, patch: Partial<Scope>) {
    const next = { ...copy(getScope(channelId)), ...patch };
    switch (scopeKind(channelId)) {
        case "channel": return setEntry("channels", channelId, next);
        case "guild": return setEntry("guilds", guildOf(channelId)!, next);
        default: settings.store.global = next;
    }
}

/** Cambia qué configuración usa el canal. La nueva parte de la que estaba aplicando, si no existía ya */
export function setScopeKind(channelId: string, kind: ScopeKind) {
    const current = copy(getScope(channelId));
    const guildId = guildOf(channelId);

    if (kind === "channel") return setEntry("channels", channelId, current);

    setEntry("channels", channelId, null);
    if (guildId) setEntry("guilds", guildId, kind === "guild" ? copy(settings.store.guilds[guildId] ?? current) : null);
}
