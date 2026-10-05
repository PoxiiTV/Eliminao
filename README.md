# ⏱️ Eliminao

**Mensajes temporales para Discord (plugin de [Vencord](https://vencord.dev)).** Escribe y olvídate: tus mensajes se borran solos cuando pasa el tiempo que elijas, y ese tiempo lo cambias al momento desde el propio chat.

[🇪🇸 Español](#-español) · [🇬🇧 English](#-english)

---

## 🇪🇸 Español

### Qué hace

- **Botón de reloj en la barra del chat.** Al pulsarlo se abre un panel con atajos de tiempo (10s, 30s, 1m, 5m, 15m, 1h, 8h, 1d), un campo para poner el tiempo que quieras (`45s`, `2h30m`, `5min`…) y un interruptor para activarlo. Si haces **clic derecho** en el reloj, se activa o desactiva sin abrir nada.
- **Siempre sabes si está activo:** el reloj se colorea y muestra el tiempo (ej. `5m`).
- **Por chat o global:** cada chat puede tener su propio tiempo o usar el global.
- **Solo el siguiente mensaje:** se desactiva solo después de enviar uno.
- **Prefijo rápido:** `!t 30s hola` envía *hola* y lo borra a los 30 s. Con `!t off hola` ese mensaje no se borra aunque el modo esté activo.
- **Cuenta atrás en cada mensaje temporal**, con un anillo que se va vaciando y se pone en rojo en los últimos 10 s. Pasando el ratón por encima puedes cancelar el borrado.
- **Clic derecho en tus mensajes:** *Hacer temporal* (también en mensajes ya enviados), *Cambiar temporizador*, *Cancelar borrado* y *Borrar ya*.
- **Lista de pendientes** del chat dentro del panel, con opción de cancelar o borrar al momento.
- **Persistente:** si cierras Discord, los borrados se guardan y, al volver a abrirlo, se borra lo que ya había caducado.
- **Prudente con Discord:** borra los mensajes de uno en uno, respeta los límites de peticiones (429) y reintenta si falla la red.

### Instalación

Necesitas [Git](https://git-scm.com) y [Node.js](https://nodejs.org) (18 o superior).

1. Ejecuta **`instalar.bat`**. Descarga Vencord, compila el plugin y abre el instalador de Vencord: elige tu Discord y pulsa instalar o reparar.
2. Cierra Discord del todo (también desde la bandeja del sistema) y vuelve a abrirlo.
3. Ve a **Ajustes → Vencord → Plugins** y activa **Eliminao**.

Tus ajustes y temas de Vencord se conservan, porque se guardan en la misma carpeta.

### Scripts

| Script | Para qué |
|---|---|
| `instalar.bat` | Primera instalación. Vuelve a ejecutarlo si una actualización de Discord rompe Vencord: actualiza Vencord y lo reinstala. |
| `start.bat` | Pasa los tests, copia el plugin a Vencord y compila. Después pulsa `Ctrl+R` en Discord. |
| `deploy.bat` | Genera `deploy-hosting/eliminao`, lista para copiar en `src/userplugins/` de cualquier Vencord. |

### Ajustes (Vencord → Plugins → Eliminao)

- **Atajos:** lista separada por comas, por ejemplo `10s, 1m, 2h30m`.
- **Prefijo:** `!t` por defecto. Déjalo vacío para desactivarlo.
- **Cuenta atrás:** mostrarla u ocultarla debajo de los mensajes.
- **Aviso al borrar:** muestra un toast cada vez que se elimina un mensaje.

Límites de tiempo: entre **3 segundos** y **30 días**.

### Cosas a tener en cuenta

- Solo borra **tus propios mensajes**, y solo mientras Discord está abierto con Vencord (lo que caduque con Discord cerrado se borra al abrirlo).
- No funciona en el móvil ni en otros dispositivos donde no tengas el plugin.
- Quien esté conectado puede leer el mensaje antes de que se borre, y los bots de registro pueden guardar una copia.
- Los mods de cliente, Vencord incluido, van contra los Términos de Servicio de Discord. Úsalo bajo tu responsabilidad.

---

## 🇬🇧 English

### What it does

- **Clock button in the chat bar.** Click it to open a panel with quick times (10s, 30s, 1m, 5m, 15m, 1h, 8h, 1d), a custom time field (`45s`, `2h30m`, `5min`…) and an on/off switch. **Right-click** the clock to toggle it without opening anything.
- **Always know when it's on:** the clock lights up and shows the current time (e.g. `5m`).
- **Per chat or global:** each chat can have its own timer or use the global one.
- **Next message only:** turns itself off after sending one message.
- **Quick prefix:** `!t 30s hello` sends *hello* and deletes it after 30 s. `!t off hello` keeps that message even when the mode is on.
- **Countdown on every temporary message**, with a ring that drains and turns red in the last 10 s. Hover it to cancel the deletion.
- **Right-click your messages:** *Make temporary* (works on already-sent messages too), *Change timer*, *Cancel deletion* and *Delete now*.
- **Pending list** for the current chat inside the panel, where you can cancel or delete right away.
- **Persistent:** if you close Discord, scheduled deletions are saved, and anything that expired in the meantime is deleted when you reopen it.
- **Gentle with Discord:** deletes messages one by one, respects rate limits (429) and retries on network errors.

### Installation

You need [Git](https://git-scm.com) and [Node.js](https://nodejs.org) 18+.

1. Run **`instalar.bat`**. It downloads Vencord, builds the plugin and opens the Vencord installer: pick your Discord and install or repair.
2. Fully quit Discord (including from the system tray) and open it again.
3. Go to **Settings → Vencord → Plugins** and enable **Eliminao**.

Your Vencord settings and themes are kept, since they live in the same folder.

### Scripts

| Script | Purpose |
|---|---|
| `instalar.bat` | First install. Run it again if a Discord update breaks Vencord: it updates Vencord and reinstalls it. |
| `start.bat` | Runs the tests, copies the plugin into Vencord and builds it. Then press `Ctrl+R` in Discord. |
| `deploy.bat` | Creates `deploy-hosting/eliminao`, ready to drop into `src/userplugins/` of any Vencord checkout. |

### Settings (Vencord → Plugins → Eliminao)

- **Presets:** comma-separated list, e.g. `10s, 1m, 2h30m`.
- **Prefix:** `!t` by default. Leave it empty to disable it.
- **Countdown:** show or hide it under messages.
- **Notify on delete:** shows a toast every time a message is deleted.

Time limits: from **3 seconds** to **30 days**.

### Good to know

- It only deletes **your own messages**, and only while Discord is open with Vencord (anything that expires while Discord is closed is deleted when you open it).
- It doesn't work on mobile or on other devices without the plugin.
- People online can read the message before it's deleted, and logging bots may keep a copy.
- Client mods, Vencord included, are against Discord's Terms of Service. Use it at your own risk.

---

Licencia / License: [GPL-3.0-or-later](LICENSE)
