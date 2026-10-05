/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Poxi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotice } from "@api/Notices";
import ErrorBoundary from "@components/ErrorBoundary";
import { Logger } from "@utils/Logger";
import definePlugin, { PluginNative } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, SelectedChannelStore, showToast } from "@webpack/common";

import { ClockIcon, Countdown, EliminaoButton, messageMenuGroup, openTimerMenu } from "./components";
import * as scheduler from "./scheduler";
import { exitSelection, getSelection, toggleSelected } from "./selection";
import { getScope, settings, updateScope } from "./settings";
import { comboFromEvent, formatDuration, matchPrefix, VERSION } from "./utils";

// ---- Enlazar el mensaje que sale del chat con el que crea Discord ----
// El pre-send no conoce el id del mensaje. Discord crea primero un mensaje "optimista" (id = nonce)
// y luego el real con ese mismo nonce, así que guardamos la petición y la casamos por nonce.
// Los envíos con adjuntos pueden no tener optimista: entonces se casan por canal (el más antiguo).

interface PendingSend { channelId: string; ms: number; at: number; nonce?: string; }

const PENDING_TTL = 10 * 60_000; // una subida lenta de archivos puede tardar
let pending: PendingSend[] = [];

function onMessageCreate({ message, optimistic }: { message: Message; optimistic: boolean; }) {
    if (!pending.length || !scheduler.isTimeable(message)) return;

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

const messageContextMenu: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (message && scheduler.isTimeable(message)) children.push(messageMenuGroup(message));
};

// ---- Atajo de teclado global (configurable en ajustes) ----

function onKeyDown(e: KeyboardEvent) {
    const { shortcut } = settings.store;
    if (!shortcut || e.repeat || comboFromEvent(e) !== shortcut) return;

    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;
    e.preventDefault();
    e.stopPropagation();

    const scope = getScope(channelId);
    updateScope(channelId, { enabled: !scope.enabled });
    showToast(scope.enabled ? "Eliminao desactivado" : `Eliminao activado · ${formatDuration(scope.ms)}`, scope.enabled ? "message" : "success");
}

// ---- Actualizaciones desde los releases de GitHub ----

const Native = VencordNative.pluginHelpers.Eliminao as PluginNative<typeof import("./native")>;
const UPDATE_EVERY = 6 * 3_600_000;
let updateTimer: ReturnType<typeof setTimeout> | undefined;
let updateReady = false;

async function checkForUpdates() {
    updateTimer = setTimeout(checkForUpdates, UPDATE_EVERY);
    if (updateReady || !settings.store.autoUpdate) return;
    try {
        const info = await Native.checkForUpdate(VERSION);
        if (!info) return;
        await Native.downloadUpdate(info.version);
        updateReady = true;
        showNotice(`Eliminao se ha actualizado a la v${info.version}. Reinicia Discord para usarla.`, "Reiniciar", () => Native.relaunch());
    } catch (e) {
        // Sin conexión o release a medio subir: se reintenta en la siguiente vuelta
        new Logger("Eliminao").warn("No se pudo comprobar o descargar la actualización", e);
    }
}

// ---- Plan B de la cuenta atrás ----
// Va en línea gracias a un parche sobre el renderizado del mensaje. Si una actualización de Discord
// rompe ese parche, renderCountdown no se llama nunca y la cuenta atrás pasa a mostrarse con la API
// de accesorios (debajo del mensaje). El contenido se renderiza antes que los accesorios, así que
// cuando el parche funciona el flag ya está activo al llegar aquí.
let inlinePatchWorks = false;
const CountdownSafe = ErrorBoundary.wrap(Countdown, { noop: true });

export default definePlugin({
    name: "Eliminao",
    description: "Mensajes temporales: se borran solos pasado el tiempo que elijas. Se ajusta al momento desde el reloj de la barra del chat.",
    authors: [{ name: "Poxi", id: 0n }],
    tags: ["Chat", "Privacy", "Utility"],
    // Quien lo instala lo hace para usarlo: que no haya que buscarlo en la lista
    enabledByDefault: true,
    settings,

    chatBarButton: {
        icon: ClockIcon,
        render: EliminaoButton
    },

    messagePopoverButton: {
        icon: ClockIcon,
        render: message => scheduler.isTimeable(message) ? {
            label: scheduler.getTask(message.id) ? "Temporizador de Eliminao" : "Hacer temporal",
            icon: ClockIcon,
            message,
            channel: ChannelStore.getChannel(message.channel_id),
            onClick: e => openTimerMenu(e, message)
        } : null
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

    onMessageClick(message, channel, event) {
        const selection = getSelection();
        if (!selection || selection.channelId !== channel.id || !scheduler.isTimeable(message)) return;
        // Enlaces, botones e imágenes siguen funcionando con normalidad
        if ((event.target as HTMLElement).closest("a, button, [role=button], img, video")) return;
        toggleSelected(message.id);
    },

    flux: {
        MESSAGE_CREATE: onMessageCreate,
        // Si el mensaje desaparece por otra vía, la tarea sobra
        MESSAGE_DELETE: ({ id }: { id: string; }) => scheduler.getTask(id) && scheduler.cancel(id),
        MESSAGE_DELETE_BULK: ({ ids }: { ids: string[]; }) => scheduler.cancel(...ids),
        // Cambio de cuenta o reconexión
        CONNECTION_OPEN: () => scheduler.rearm(),
        // La selección es de un chat concreto
        CHANNEL_SELECT({ channelId }: { channelId: string; }) {
            if (getSelection()?.channelId !== channelId) exitSelection();
        }
    },

    contextMenus: {
        message: messageContextMenu
    },

    patches: [
        {
            // Renderizador del contenido del mensaje: la cuenta atrás va al final del texto,
            // en línea como "(editado)", así sale también en los mensajes agrupados (sin cabecera)
            find: ".SEND_FAILED,",
            replacement: {
                match: /location:\i\.\i\.WITH_CONTENT\}\)(?=\])/,
                replace: "$&,$self.renderCountdown(arguments[0])"
            }
        }
    ],

    renderCountdown({ message }: { message: Message; }) {
        inlinePatchWorks = true;
        return <CountdownSafe message={message} />;
    },

    renderMessageAccessory: ({ message }) => inlinePatchWorks ? null : <CountdownSafe message={message} />,

    start() {
        document.addEventListener("keydown", onKeyDown, true);
        // Con margen: que Discord termine de arrancar antes de ir a la red
        updateTimer = setTimeout(checkForUpdates, 15_000);
        return scheduler.start();
    },

    stop() {
        document.removeEventListener("keydown", onKeyDown, true);
        clearTimeout(updateTimer);
        scheduler.stop();
        exitSelection();
        pending = [];
    }
});
