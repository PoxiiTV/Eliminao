/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Poxi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { Switch } from "@components/Switch";
import { classNameFactory } from "@utils/css";
import { IconComponent } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { MessageStore, Popout, useMemo, useRef, useState } from "@webpack/common";
import type { CSSProperties } from "react";

import { formatClock, formatDuration, MAX_MS, MIN_MS, parseDuration, parsePresets } from "./duration";
import { cancel, deleteNow, useNow, useTask, useTasks } from "./scheduler";
import { getScope, hasOwnScope, setOwnScope, settings, updateScope } from "./settings";

const cl = classNameFactory("eliminao-");

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
    settings.use(["global", "channels"]);
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLSpanElement>(null);

    if (!isAnyChat) return null;

    const scope = getScope(channel.id);
    const tooltip = scope.enabled
        ? `Eliminao: ${formatDuration(scope.ms)}${scope.once ? " · solo el siguiente" : ""} (clic derecho: desactivar)`
        : "Eliminao: desactivado (clic derecho: activar)";

    return (
        <Popout
            position="top"
            align="right"
            animation={Popout.Animation.NONE}
            shouldShow={open}
            onRequestClose={() => setOpen(false)}
            targetElementRef={anchor}
            renderPopout={() => <Panel channelId={channel.id} />}
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
    );
};

// ---- Panel ----

function Panel({ channelId }: { channelId: string; }) {
    const { presets } = settings.use(["global", "channels", "presets"]);
    const scope = getScope(channelId);
    const own = hasOwnScope(channelId);
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
                </div>
                <Switch checked={scope.enabled} onChange={enabled => updateScope(channelId, { enabled })} />
            </header>

            <div className={cl("segmented")} data-own={own} role="tablist">
                <span className={cl("segmented-thumb")} aria-hidden="true" />
                <button role="tab" aria-selected={own} onClick={() => setOwnScope(channelId, true)}>Este chat</button>
                <button role="tab" aria-selected={!own} onClick={() => setOwnScope(channelId, false)}>Global</button>
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
                    : `Actual: ${formatDuration(scope.ms)}${own ? " en este chat" : " en todos los chats"}`}
            </p>

            <label className={cl("row")}>
                <span>
                    Solo el siguiente mensaje
                    <small>Se desactiva solo después de enviar uno</small>
                </span>
                <Switch checked={scope.once} onChange={once => updateScope(channelId, { once })} />
            </label>

            <PendingList channelId={channelId} />

            {settings.store.prefix.trim() && (
                <p className={cl("footer")}>
                    Atajo: <code>{settings.store.prefix.trim()} 30s mensaje</code> · clic derecho en el reloj para activar o desactivar
                </p>
            )}
        </div>
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
    return msg.attachments?.length ? `📎 ${msg.attachments.length} adjunto(s)` : "Mensaje";
}

// ---- Cuenta atrás bajo el mensaje ----

export function Countdown({ message }: { message: Message; }) {
    // Se renderiza en todos los mensajes: solo una suscripción barata al store de tareas
    const task = useTask(message.id);
    if (!task || !settings.store.showCountdown) return null;
    return <CountdownPill id={task.id} createdAt={task.createdAt} expiresAt={task.expiresAt} />;
}

// Componente aparte: solo los mensajes temporales se suscriben al ticker
function CountdownPill({ id, createdAt, expiresAt }: { id: string; createdAt: number; expiresAt: number; }) {
    const now = useNow();
    const left = expiresAt - now;
    const fraction = Math.min(1, Math.max(0, left / (expiresAt - createdAt || 1)));

    return (
        <div className={cl("countdown", { urgent: left <= 10_000 })}>
            <span className={cl("ring")} style={{ "--eliminao-p": fraction } as CSSProperties} aria-hidden="true" />
            <span>{left > 0 ? `Se elimina en ${formatClock(left)}` : "Eliminando…"}</span>
            <button className={cl("countdown-cancel")} onClick={() => cancel(id)} aria-label="Cancelar borrado" title="Cancelar borrado">
                <CloseIcon />
            </button>
        </div>
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
