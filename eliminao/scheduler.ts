/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Poxi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { Constants, React, RestAPI, showToast, UserStore } from "@webpack/common";

import { settings } from "./settings";

export interface Task {
    id: string;
    channelId: string;
    /** Dueño del mensaje: con varias cuentas solo se procesan las de la cuenta activa */
    userId: string;
    createdAt: number;
    expiresAt: number;
}

const STORE_KEY = "Eliminao_tasks";
const MAX_TIMEOUT = 2 ** 31 - 1; // setTimeout desborda por encima de ~24,8 días
const GAP_MS = 350; // pausa entre borrados para no rozar el rate limit
const RETRY_MS = 30_000; // reintento ante errores de red

const logger = new Logger("Eliminao");
const me = () => UserStore.getCurrentUser()?.id;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ---- Estado (inmutable: cada cambio crea un Map nuevo, así React detecta el cambio) ----

let tasks = new Map<string, Task>();
const listeners = new Set<() => void>();

function commit(next: Map<string, Task>) {
    tasks = next;
    DataStore.set(STORE_KEY, [...tasks.values()]).catch(e => logger.error("No se pudo guardar", e));
    listeners.forEach(l => l());
    arm();
}

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => void listeners.delete(cb);
}

export const getTask = (id: string) => tasks.get(id);
export const useTasks = () => React.useSyncExternalStore(subscribe, () => tasks);
export const useTask = (id: string) => React.useSyncExternalStore(subscribe, () => tasks.get(id));

export function schedule(id: string, channelId: string, ms: number) {
    const userId = me();
    if (!userId) return;
    const now = Date.now();
    commit(new Map(tasks).set(id, { id, channelId, userId, createdAt: now, expiresAt: now + ms }));
}

export function cancel(...ids: string[]) {
    const next = new Map(tasks);
    if (ids.filter(id => next.delete(id)).length) commit(next);
}

export function deleteNow(id: string) {
    const t = tasks.get(id);
    if (t) commit(new Map(tasks).set(id, { ...t, expiresAt: Date.now() }));
}

// ---- Temporizador: un único setTimeout apuntando a la tarea más próxima ----

let timer: ReturnType<typeof setTimeout> | undefined;

function arm() {
    clearTimeout(timer);
    const userId = me();
    let next = Infinity;
    for (const t of tasks.values()) if (t.userId === userId && !queued.has(t.id)) next = Math.min(next, t.expiresAt);
    if (next !== Infinity) timer = setTimeout(tick, Math.min(Math.max(next - Date.now(), 0), MAX_TIMEOUT));
}

function tick() {
    const now = Date.now(), userId = me();
    for (const t of tasks.values())
        if (t.userId === userId && t.expiresAt <= now && !queued.has(t.id)) {
            queued.add(t.id);
            queue.push(t);
        }
    run();
    arm();
}

// ---- Cola de borrado: de uno en uno, respetando los 429 de Discord ----

const queued = new Set<string>();
const queue: Task[] = [];
let running = false;

async function run() {
    if (running) return;
    running = true;
    try {
        while (queue.length) {
            const t = queue[0];
            // Puede haberse cancelado mientras esperaba turno
            if (!tasks.has(t.id)) {
                finish(t, false);
                continue;
            }
            try {
                await RestAPI.del({ url: Constants.Endpoints.MESSAGE(t.channelId, t.id) });
                finish(t, true);
            } catch (e: any) {
                if (e?.status === 429) {
                    await sleep((e.body?.retry_after ?? 1) * 1000);
                    continue;
                }
                if (e?.status >= 400 && e?.status < 500) {
                    // 404 ya no existe · 403 sin acceso (p. ej. saliste del servidor): no hay nada más que hacer
                    finish(t, false);
                } else {
                    // Error de red o del servidor: se reintenta más tarde, sin perder la tarea
                    logger.warn(`Fallo al borrar ${t.id}, reintento en ${RETRY_MS / 1000}s`, e);
                    queue.shift();
                    queued.delete(t.id);
                    const current = tasks.get(t.id);
                    if (current) commit(new Map(tasks).set(t.id, { ...current, expiresAt: Date.now() + RETRY_MS }));
                }
            }
            await sleep(GAP_MS);
        }
    } finally {
        running = false;
    }
}

function finish(t: Task, deleted: boolean) {
    queue.shift();
    queued.delete(t.id);
    cancel(t.id);
    if (deleted && settings.store.notifyOnDelete) showToast("Eliminao: mensaje eliminado", "success");
}

// ---- Ciclo de vida ----

export async function start() {
    const saved = await DataStore.get<Task[]>(STORE_KEY) ?? [];
    // Por si ya se programó algo mientras cargaba
    tasks = new Map([...saved.map(t => [t.id, t] as const), ...tasks]);
    listeners.forEach(l => l());
    arm(); // lo que caducó con Discord cerrado se borra ahora
}

export function stop() {
    clearTimeout(timer);
    queue.length = 0;
    queued.clear();
}

/** Tras cambiar de cuenta hay que reprogramar con las tareas de la nueva */
export const rearm = arm;

// ---- Ticker compartido para las cuentas atrás (un solo intervalo para toda la UI) ----

const tickers = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | undefined;
// Redondeado al segundo: estable entre llamadas dentro del mismo render
let now = Math.floor(Date.now() / 1000) * 1000;

function subscribeNow(cb: () => void) {
    tickers.add(cb);
    interval ??= setInterval(() => {
        now = Math.floor(Date.now() / 1000) * 1000;
        tickers.forEach(t => t());
    }, 1000);
    return () => {
        tickers.delete(cb);
        if (!tickers.size) {
            clearInterval(interval);
            interval = undefined;
        }
    };
}

export const useNow = () => React.useSyncExternalStore(subscribeNow, () => interval ? now : (now = Math.floor(Date.now() / 1000) * 1000));
