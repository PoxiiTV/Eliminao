/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Poxi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MessageStore, React } from "@webpack/common";

import { isTimeable } from "./scheduler";

// Modo selección: haces clic en tus mensajes de un chat y luego los borras o los haces temporales de golpe

export interface Selection {
    channelId: string;
    ids: ReadonlySet<string>;
}

let selection: Selection | null = null;
const listeners = new Set<() => void>();
let highlight: HTMLStyleElement | null = null;

function set(next: Selection | null) {
    selection = next;
    paintHighlight();
    listeners.forEach(l => l());
}

// Resaltado con una hoja de estilos generada (un selector por id), sin tocar el DOM de Discord
function paintHighlight() {
    if (!selection) {
        highlight?.remove();
        highlight = null;
        return;
    }
    highlight ??= document.head.appendChild(document.createElement("style"));
    const { channelId, ids } = selection;
    const selectors = [...ids].map(id => `#chat-messages-${channelId}-${id}`).join(",");
    highlight.textContent = selectors && `${selectors}{background:color-mix(in srgb,var(--brand-500) 16%,transparent)!important;box-shadow:inset 3px 0 0 var(--brand-500)}`;
}

export const getSelection = () => selection;
function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => void listeners.delete(cb);
}

export const useSelection = () => React.useSyncExternalStore(subscribe, () => selection);

export const startSelection = (channelId: string) => set({ channelId, ids: new Set() });
export function exitSelection() {
    if (selection) set(null);
}

export function toggleSelected(id: string) {
    if (!selection) return;
    const ids = new Set(selection.ids);
    if (!ids.delete(id)) ids.add(id);
    set({ ...selection, ids });
}

/** Selecciona todos tus mensajes cargados ahora mismo en el chat */
export function selectAllLoaded() {
    if (!selection) return;
    const mine = MessageStore.getMessages(selection.channelId)._array.filter(isTimeable).map(m => m.id);
    set({ ...selection, ids: new Set(mine) });
}
