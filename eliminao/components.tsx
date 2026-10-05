/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Poxi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { Switch } from "@components/Switch";
import { classNameFactory } from "@utils/css";
import { IconComponent, PluginSettingComponentProps } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { Alerts, ContextMenuApi, Menu, MessageStore, Popout, ReactDOM, showToast, Tooltip, useEffect, useMemo, useRef, useState } from "@webpack/common";
import type { CSSProperties, RefObject } from "react";

import { cancel, deleteNow, findMyLastMessages, getTask, schedule, scheduleMany, Task, useNow, useTask, useTasks } from "./scheduler";
import { exitSelection, selectAllLoaded, startSelection, useSelection } from "./selection";
import { getScope, guildOf, ScopeKind, scopeKind, setScopeKind, settings, updateScope } from "./settings";
import { comboFromEvent, formatClock, formatDuration, MAX_MS, MIN_MS, parseDuration, parsePresets, VERSION } from "./utils";

const cl = classNameFactory("eliminao-");

const SCOPE_LABEL: Record<ScopeKind, string> = { channel: "Este chat", guild: "Servidor", global: "Global" };
const SCOPE_WHERE: Record<ScopeKind, string> = { channel: "en este chat", guild: "en este servidor", global: "en todos los chats" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const ClockIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg width={width} height={height} viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path
            fill="currentColor"
            fillRule="evenodd"
            d="M12 23a11 11 0 1 0 0-22 11 11 0 0 0 0 22Zm1-17a1 1 0 1 0-2 0v6c0 .27.1.52.3.7l3.5 3.5a1 1 0 0 0 1.4-1.4L13 11.58V6Z"
        />
    </svg>
);

// ---- Botón de la barra del chat ----

export const EliminaoButton: ChatBarButtonFactory = ({ channel, isAnyChat }) => {
    // Suscripción para re-renderizar al cambiar la config
    settings.use(["global", "channels", "guilds"]);
    const selection = useSelection();
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLSpanElement>(null);

    if (!isAnyChat) return null;

    const scope = getScope(channel.id);
    const tooltip = scope.enabled
        ? `Eliminao: ${formatDuration(scope.ms)}${scope.once ? " · solo el siguiente" : ""} (clic derecho: desactivar)`
        : "Eliminao: desactivado (clic derecho: activar)";

    return (
        <>
            <Popout
                position="top"
                align="right"
                animation={Popout.Animation.NONE}
                shouldShow={open}
                onRequestClose={() => setOpen(false)}
                targetElementRef={anchor}
                renderPopout={() => <Panel channelId={channel.id} onClose={() => setOpen(false)} />}
            >
                {() => (
                    <ChatBarButton
                        tooltip={open ? "" : tooltip}
                        onClick={() => setOpen(v => !v)}
                        onContextMenu={e => {
                            e.preventDefault();
                            updateScope(channel.id, { enabled: !scope.enabled });
                        }}
                        buttonProps={{ "aria-haspopup": "dialog", "aria-expanded": open } as any}
                    >
                        <span ref={anchor} className={cl("button", { active: scope.enabled, open })}>
                            <ClockIcon />
                            {scope.enabled && <span className={cl("badge")}>{formatDuration(scope.ms)}</span>}
                            {scope.enabled && scope.once && <span className={cl("once-dot")} />}
                        </span>
                    </ChatBarButton>
                )}
            </Popout>
            {selection?.channelId === channel.id && ReactDOM.createPortal(<SelectionBar channelId={channel.id} anchor={anchor} />, document.body)}
        </>
    );
};

// ---- Panel ----

function Panel({ channelId, onClose }: { channelId: string; onClose(): void; }) {
    const { presets, shortcut } = settings.use(["global", "channels", "guilds", "presets", "shortcut"]);
    const scope = getScope(channelId);
    const kind = scopeKind(channelId);
    const kinds: ScopeKind[] = guildOf(channelId) ? ["channel", "guild", "global"] : ["channel", "global"];
    const presetList = useMemo(() => parsePresets(presets), [presets]);

    const [custom, setCustom] = useState("");
    const [invalid, setInvalid] = useState(false);

    const setTime = (ms: number) => updateScope(channelId, { ms, enabled: true });

    function applyCustom() {
        const ms = parseDuration(custom);
        if (!ms) {
            // Reinicia la animación de error aunque ya estuviera marcado
            setInvalid(false);
            requestAnimationFrame(() => setInvalid(true));
            return;
        }
        setTime(ms);
        setCustom("");
        setInvalid(false);
    }

    return (
        <div className={cl("panel")} role="dialog" aria-label="Eliminao">
            <header className={cl("header")}>
                <div className={cl("title")}>
                    <ClockIcon width={18} height={18} />
                    <span>Eliminao</span>
                    <span className={cl("version")}>v{VERSION}</span>
                </div>
                <Switch checked={scope.enabled} onChange={enabled => updateScope(channelId, { enabled })} />
            </header>

            <div
                className={cl("segmented")}
                role="tablist"
                style={{ "--eliminao-n": kinds.length, "--eliminao-i": kinds.indexOf(kind) } as CSSProperties}
            >
                <span className={cl("segmented-thumb")} aria-hidden="true" />
                {kinds.map(k => (
                    <button key={k} role="tab" aria-selected={k === kind} onClick={() => setScopeKind(channelId, k)}>
                        {SCOPE_LABEL[k]}
                    </button>
                ))}
            </div>

            <div className={cl("presets")}>
                {presetList.map(ms => (
                    <button
                        key={ms}
                        className={cl("chip", { selected: scope.enabled && scope.ms === ms })}
                        onClick={() => setTime(ms)}
                    >
                        {formatDuration(ms)}
                    </button>
                ))}
            </div>

            <div className={cl("custom", { invalid })} onAnimationEnd={() => setInvalid(false)}>
                <input
                    value={custom}
                    placeholder="Personalizado: 2h30m, 45s…"
                    aria-label="Tiempo personalizado"
                    aria-invalid={invalid}
                    onChange={e => setCustom(e.currentTarget.value)}
                    onKeyDown={e => e.key === "Enter" && applyCustom()}
                />
                <button onClick={applyCustom} disabled={!custom.trim()}>Aplicar</button>
            </div>
            <p className={cl("hint")}>
                {invalid
                    ? `Formato no válido. Entre ${formatDuration(MIN_MS)} y ${formatDuration(MAX_MS)}.`
                    : `Actual: ${formatDuration(scope.ms)} ${SCOPE_WHERE[kind]}`}
            </p>

            <label className={cl("row")}>
                <span>
                    Solo el siguiente mensaje
                    <small>Se desactiva solo después de enviar uno</small>
                </span>
                <Switch checked={scope.once} onChange={once => updateScope(channelId, { once })} />
            </label>

            <Tools channelId={channelId} ms={scope.ms} onClose={onClose} />

            <PendingList channelId={channelId} />

            <p className={cl("footer")}>
                Activar o desactivar: {shortcut && <><code>{shortcut}</code> o </>}clic derecho en el reloj
                {settings.store.prefix.trim() && <><br />Un solo mensaje: <code>{settings.store.prefix.trim()} 30s hola</code></>}
            </p>
        </div>
    );
}

function Tools({ channelId, ms, onClose }: { channelId: string; ms: number; onClose(): void; }) {
    const [count, setCount] = useState("10");
    const [busy, setBusy] = useState(false);
    const n = Math.min(500, Math.max(0, parseInt(count) || 0));

    async function makeLastTemporary() {
        setBusy(true);
        try {
            const ids = await findMyLastMessages(channelId, n);
            scheduleMany(ids.map(id => ({ id, channelId })), ms);
            if (ids.length) showToast(`${plural(ids.length, "mensaje")} se borrarán en ${formatDuration(ms)}`, "success");
            else showToast("No he encontrado mensajes tuyos en este chat");
        } catch {
            showToast("No se pudieron cargar los mensajes", "failure");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className={cl("tools")}>
            <div className={cl("tool")}>
                <span>Mis últimos</span>
                <input
                    type="number"
                    min={1}
                    max={500}
                    value={count}
                    aria-label="Cuántos mensajes"
                    onChange={e => setCount(e.currentTarget.value)}
                    onKeyDown={e => e.key === "Enter" && n && !busy && makeLastTemporary()}
                />
                <button onClick={makeLastTemporary} disabled={busy || !n}>
                    {busy ? "Buscando…" : `Temporales · ${formatDuration(ms)}`}
                </button>
            </div>
            <button
                className={cl("tool-select")}
                title="Elige mensajes tuyos para borrarlos o hacerlos temporales de golpe"
                onClick={() => {
                    startSelection(channelId);
                    onClose();
                }}
            >
                <CheckIcon /> Seleccionar mensajes…
            </button>
        </section>
    );
}

function PendingList({ channelId }: { channelId: string; }) {
    const tasks = useTasks();
    const now = useNow();
    const list = [...tasks.values()].filter(t => t.channelId === channelId).sort((a, b) => a.expiresAt - b.expiresAt);

    if (!list.length) return null;

    return (
        <section className={cl("pending")}>
            <div className={cl("pending-header")}>
                <span>Pendientes en este chat · {list.length}</span>
                <button onClick={() => cancel(...list.map(t => t.id))}>Cancelar todos</button>
            </div>
            <ul>
                {list.map(t => (
                    <li key={t.id}>
                        <span className={cl("pending-text")}>{preview(channelId, t.id)}</span>
                        <span className={cl("pending-time")}>{formatClock(t.expiresAt - now)}</span>
                        <button aria-label="Borrar ya" title="Borrar ya" className={cl("icon-btn", "danger")} onClick={() => deleteNow(t.id)}>
                            <TrashIcon />
                        </button>
                        <button aria-label="Cancelar borrado" title="Cancelar borrado" className={cl("icon-btn")} onClick={() => cancel(t.id)}>
                            <CloseIcon />
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function preview(channelId: string, id: string) {
    const msg = MessageStore.getMessage(channelId, id);
    if (!msg) return "Mensaje";
    if (msg.content) return msg.content;
    return msg.attachments?.length ? `📎 ${plural(msg.attachments.length, "adjunto")}` : "Mensaje";
}

// ---- Barra flotante del modo selección ----

function SelectionBar({ channelId, anchor }: { channelId: string; anchor: RefObject<HTMLSpanElement | null>; }) {
    const selection = useSelection();
    const { ms } = getScope(channelId);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && exitSelection();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    if (!selection) return null;

    // Encima del reloj, alineada a su derecha
    const rect = anchor.current?.getBoundingClientRect();
    const position = rect
        ? { right: Math.max(16, innerWidth - rect.right - 8), bottom: innerHeight - rect.top + 18 }
        : { right: 24, bottom: 96 };

    const items = [...selection.ids].map(id => ({ id, channelId }));
    const n = items.length;

    function makeTemporary() {
        scheduleMany(items, ms);
        exitSelection();
        showToast(`${plural(n, "mensaje")} se borrarán en ${formatDuration(ms)}`, "success");
    }

    function confirmDelete() {
        Alerts.show({
            title: `¿Borrar ${plural(n, "mensaje")}?`,
            body: "Se borran ahora mismo y no se puede deshacer.",
            confirmText: "Borrar",
            cancelText: "Cancelar",
            // Botón rojo de Discord para acciones destructivas (los tipos de Vencord aún no lo recogen)
            confirmVariant: "critical-primary",
            onConfirm() {
                scheduleMany(items, 0);
                exitSelection();
            }
        } as Parameters<typeof Alerts.show>[0]);
    }

    return (
        <div className={cl("selbar")} style={position} role="toolbar" aria-label="Selección de mensajes">
            <span className={cl("selbar-count")} aria-live="polite">
                {n ? `${n} seleccionado${n === 1 ? "" : "s"}` : "Haz clic en tus mensajes"}
            </span>
            <button onClick={selectAllLoaded}>Todos</button>
            <button disabled={!n} onClick={makeTemporary}>Temporales · {formatDuration(ms)}</button>
            <button className={cl("selbar-danger")} disabled={!n} onClick={confirmDelete}>
                <TrashIcon /> Borrar
            </button>
            <button className={cl("icon-btn")} aria-label="Salir del modo selección" title="Salir (Esc)" onClick={exitSelection}>
                <CloseIcon />
            </button>
        </div>
    );
}

// ---- Menús de temporizador (clic derecho en el mensaje y botón al pasar el ratón) ----

const presetItems = (message: Message) => parsePresets(settings.store.presets).map(ms => (
    <Menu.MenuItem key={ms} id={`eliminao-set-${ms}`} label={`En ${formatDuration(ms)}`} action={() => schedule(message.id, message.channel_id, ms)} />
));

const taskItems = (message: Message, task?: Task) => task ? [
    <Menu.MenuItem key="cancel" id="eliminao-cancel" label="Cancelar borrado" action={() => cancel(message.id)} />,
    <Menu.MenuItem key="now" id="eliminao-now" label="Borrar ya" color="danger" action={() => deleteNow(message.id)} />
] : [];

export function messageMenuGroup(message: Message) {
    const task = getTask(message.id);
    return (
        <Menu.MenuGroup>
            <Menu.MenuItem id="eliminao-set" label={task ? "Cambiar temporizador" : "Hacer temporal"}>
                {presetItems(message)}
            </Menu.MenuItem>
            {taskItems(message, task)}
        </Menu.MenuGroup>
    );
}

export function openTimerMenu(event: React.MouseEvent, message: Message) {
    ContextMenuApi.openContextMenu(event, () => {
        const task = getTask(message.id);
        return (
            <Menu.Menu navId="eliminao-timer" onClose={ContextMenuApi.closeContextMenu} aria-label="Temporizador de Eliminao">
                <Menu.MenuGroup label={task ? "Cambiar temporizador" : "Borrar en…"}>{presetItems(message)}</Menu.MenuGroup>
                {task && <Menu.MenuGroup>{taskItems(message, task)}</Menu.MenuGroup>}
            </Menu.Menu>
        );
    });
}

// ---- Ajuste del atajo de teclado: graba la combinación que pulses ----

// Declaración de función (no const): settings.ts la usa al cargar y así está disponible aunque haya import circular
export function ShortcutSetting({ setValue }: PluginSettingComponentProps) {
    const [value, setLocal] = useState<string>(settings.store.shortcut);
    const [recording, setRecording] = useState(false);

    useEffect(() => {
        if (!recording) return;
        const onKey = (e: KeyboardEvent) => {
            // En captura sobre window: llega antes que el atajo global y no lo dispara
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.key === "Escape") return setRecording(false);

            const combo = e.key === "Backspace" || e.key === "Delete" ? "" : comboFromEvent(e);
            if (combo === null) return; // solo modificadores: sigue esperando la tecla
            setLocal(combo);
            setValue(combo);
            setRecording(false);
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [recording]);

    return (
        <div className={cl("shortcut")}>
            <div>
                <strong>Atajo para activar o desactivar</strong>
                <small>Pulsa el botón y después la combinación. Retroceso: sin atajo · Esc: cancelar</small>
            </div>
            <button className={cl("shortcut-btn", { recording })} onClick={() => setRecording(r => !r)}>
                {recording ? "Pulsa una combinación…" : value || "Sin atajo"}
            </button>
        </div>
    );
}

// ---- Cuenta atrás al final del mensaje, en línea como "(editado)" ----

export function Countdown({ message }: { message: Message; }) {
    // Se renderiza en todos los mensajes: solo una suscripción barata al store de tareas
    const task = useTask(message.id);
    if (!task || !settings.store.showCountdown) return null;
    return <CountdownLabel id={task.id} createdAt={task.createdAt} expiresAt={task.expiresAt} />;
}

// Componente aparte: solo los mensajes temporales se suscriben al ticker
function CountdownLabel({ id, createdAt, expiresAt }: { id: string; createdAt: number; expiresAt: number; }) {
    const now = useNow();
    const left = expiresAt - now;
    const fraction = Math.min(1, Math.max(0, left / (expiresAt - createdAt || 1)));
    const at = new Date(expiresAt).toLocaleString([], expiresAt - now > 86_400_000
        ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
        : { hour: "2-digit", minute: "2-digit" });

    return (
        <Tooltip text={`Se elimina a las ${at} · Clic para cancelar`}>
            {props => (
                <span
                    {...props}
                    role="button"
                    tabIndex={0}
                    aria-label={`Se elimina en ${formatClock(left)}. Cancelar borrado`}
                    className={cl("inline", { urgent: left <= 10_000 })}
                    onClick={e => {
                        e.stopPropagation();
                        cancel(id);
                    }}
                    onKeyDown={e => (e.key === "Enter" || e.key === " ") && cancel(id)}
                >
                    <span className={cl("ring")} style={{ "--eliminao-p": fraction } as CSSProperties} aria-hidden="true" />
                    {left > 0 ? formatClock(left) : "…"}
                </span>
            )}
        </Tooltip>
    );
}

// ---- Iconos ----

const CloseIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M17.3 18.7a1 1 0 0 0 1.4-1.4L13.42 12l5.3-5.3a1 1 0 0 0-1.42-1.4L12 10.58l-5.3-5.3a1 1 0 0 0-1.4 1.42L10.58 12l-5.3 5.3a1 1 0 1 0 1.42 1.4L12 13.42l5.3 5.3Z" />
    </svg>
);

const TrashIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M14.25 1c.41 0 .75.34.75.75V3h5.25c.41 0 .75.34.75.75v.5c0 .41-.34.75-.75.75H3.75A.75.75 0 0 1 3 4.25v-.5c0-.41.34-.75.75-.75H9V1.75c0-.41.34-.75.75-.75h4.5ZM5.06 7a1 1 0 0 0-1 1.06l.76 12.13a3 3 0 0 0 3 2.81h8.36a3 3 0 0 0 3-2.81l.75-12.13a1 1 0 0 0-1-1.06H5.07Z" />
    </svg>
);

const CheckIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 16H5V5h14v14Zm-9-2-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8Z" />
    </svg>
);
