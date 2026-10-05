/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Poxi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { Menu, UserStore } from "@webpack/common";

import { ClockIcon, Countdown, EliminaoButton } from "./components";
import { formatDuration, matchPrefix, parsePresets } from "./duration";
import * as scheduler from "./scheduler";
import { getScope, settings, updateScope } from "./settings";

// ---- Enlazar el mensaje que sale del chat con el que crea Discord ----
// El pre-send no conoce el id del mensaje. Discord crea primero un mensaje "optimista" (id = nonce)
// y luego el real con ese mismo nonce, así que guardamos la petición y la casamos por nonce.
// Los envíos con adjuntos pueden no tener optimista: entonces se casan por canal (el más antiguo).

interface PendingSend { channelId: string; ms: number; at: number; nonce?: string; }

const PENDING_TTL = 10 * 60_000; // una subida lenta de archivos puede tardar
let pending: PendingSend[] = [];

const isMine = (m?: Message) => !!m?.author && m.author.id === UserStore.getCurrentUser()?.id;
// Normales y respuestas: el resto son mensajes de sistema
const isTimeable = (m: Message) => isMine(m) && (m.type === 0 || m.type === 19) && !(m as any).deleted;

function onMessageCreate({ message, optimistic }: { message: Message; optimistic: boolean; }) {
    if (!pending.length || !isMine(message)) return;

    if (optimistic) {
        const p = pending.find(p => p.channelId === message.channel_id && !p.nonce);
        if (p) p.nonce = message.nonce ?? message.id;
        return;
    }

    let i = pending.findIndex(p => p.nonce != null && p.nonce === message.nonce);
    if (i === -1) i = pending.findIndex(p => p.channelId === message.channel_id && !p.nonce);
    if (i === -1) return;

    const [p] = pending.splice(i, 1);
    scheduler.schedule(message.id, message.channel_id, p.ms);
}

// ---- Menú contextual de mensajes ----

const messageContextMenu: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!message || !isTimeable(message)) return;

    const task = scheduler.getTask(message.id);
    const set = (ms: number) => scheduler.schedule(message.id, message.channel_id, ms);

    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem id="eliminao-set" label={task ? "Cambiar temporizador" : "Hacer temporal"}>
                {parsePresets(settings.store.presets).map(ms => (
                    <Menu.MenuItem key={ms} id={`eliminao-set-${ms}`} label={`En ${formatDuration(ms)}`} action={() => set(ms)} />
                ))}
            </Menu.MenuItem>
            {task && <Menu.MenuItem id="eliminao-cancel" label="Cancelar borrado" action={() => scheduler.cancel(message.id)} />}
            {task && <Menu.MenuItem id="eliminao-now" label="Borrar ya" color="danger" action={() => scheduler.deleteNow(message.id)} />}
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "Eliminao",
    description: "Mensajes temporales: se borran solos pasado el tiempo que elijas. Se ajusta al momento desde el reloj de la barra del chat.",
    authors: [{ name: "Poxi", id: 0n }],
    tags: ["Chat", "Privacy", "Utility"],
    settings,

    chatBarButton: {
        icon: ClockIcon,
        render: EliminaoButton
    },

    onBeforeMessageSend(channelId, msg, _options, props) {
        let ms = 0;
        const prefixed = matchPrefix(msg.content, settings.store.prefix, props?.hasAttachments);

        if (prefixed) {
            // El prefijo manda sobre la configuración y no gasta el "solo el siguiente"
            msg.content = prefixed.rest;
            ms = prefixed.ms;
        } else {
            const scope = getScope(channelId);
            if (scope.enabled) {
                ms = scope.ms;
                if (scope.once) updateScope(channelId, { enabled: false });
            }
        }

        if (!ms) return;
        const now = Date.now();
        pending = pending.filter(p => now - p.at < PENDING_TTL);
        pending.push({ channelId, ms, at: now });
    },

    flux: {
        MESSAGE_CREATE: onMessageCreate,
        // Si el mensaje desaparece por otra vía, la tarea sobra
        MESSAGE_DELETE: ({ id }: { id: string; }) => scheduler.getTask(id) && scheduler.cancel(id),
        MESSAGE_DELETE_BULK: ({ ids }: { ids: string[]; }) => scheduler.cancel(...ids),
        // Cambio de cuenta o reconexión
        CONNECTION_OPEN: () => scheduler.rearm()
    },

    contextMenus: {
        message: messageContextMenu
    },

    renderMessageAccessory: ({ message }) => <Countdown message={message} />,

    start: scheduler.start,
    stop() {
        scheduler.stop();
        pending = [];
    }
});
