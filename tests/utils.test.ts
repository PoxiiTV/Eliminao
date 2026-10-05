// Se ejecuta en start.bat (tsx de Vencord/node_modules)
import assert from "node:assert/strict";

import { comboFromEvent, formatClock, formatDuration, isNewer, matchPrefix, parseDuration, parsePresets } from "../eliminao/utils";

assert.equal(parseDuration("30s"), 30_000);
assert.equal(parseDuration("1h30m"), 5_400_000);
assert.equal(parseDuration(" 2H 15M "), 8_100_000);
assert.equal(parseDuration("5min"), 300_000);
assert.equal(parseDuration("90"), 90_000);
assert.equal(parseDuration("off"), 0);
assert.equal(parseDuration("1s"), null, "por debajo del mínimo");
assert.equal(parseDuration("31d"), null, "por encima del máximo");
assert.equal(parseDuration("abc"), null);
assert.equal(parseDuration("1x"), null);
assert.equal(parseDuration(""), null);

assert.equal(formatDuration(90_000), "1m30s");
assert.equal(formatDuration(3_600_000), "1h");
assert.equal(formatDuration(86_400_000 + 7_200_000), "1d2h");

assert.equal(formatClock(272_000), "4:32");
assert.equal(formatClock(3_725_000), "1:02:05");
assert.equal(formatClock(2 * 86_400_000 + 3 * 3_600_000), "2d 3h");
assert.equal(formatClock(-5), "0:00");
assert.equal(formatClock(400), "0:01", "redondea hacia arriba para no mostrar 0:00 antes de tiempo");

assert.deepEqual(parsePresets("1m, 10s, nope, 1m, 30s"), [10_000, 30_000, 60_000]);

assert.deepEqual(matchPrefix("!t 30s hola mundo", "!t"), { ms: 30_000, rest: "hola mundo" });
assert.deepEqual(matchPrefix("!t 1h línea1\nlínea2", "!t"), { ms: 3_600_000, rest: "línea1\nlínea2" });
assert.deepEqual(matchPrefix("!t off hola", "!t"), { ms: 0, rest: "hola" });
assert.deepEqual(matchPrefix("!t 30s", "!t", true), { ms: 30_000, rest: "" }, "vale vacío si hay adjuntos");
assert.equal(matchPrefix("!t 30s", "!t"), null, "no envía un mensaje vacío");
assert.equal(matchPrefix("!t hola", "!t"), null, "tiempo inválido: se envía tal cual");
assert.equal(matchPrefix("!tonto 30s", "!t"), null);
assert.equal(matchPrefix("hola", "!t"), null);
assert.equal(matchPrefix("!t 30s hola", ""), null);


const key = (key: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) =>
    ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
assert.equal(comboFromEvent(key("t", { altKey: true })), "Alt+T");
assert.equal(comboFromEvent(key("T", { ctrlKey: true, shiftKey: true })), "Ctrl+Shift+T");
assert.equal(comboFromEvent(key(" ", { ctrlKey: true })), "Ctrl+Space");
assert.equal(comboFromEvent(key("F8")), "F8");
assert.equal(comboFromEvent(key("Alt", { altKey: true })), null, "solo modificador");

assert.equal(isNewer("1.2.0", "1.1.9"), true);
assert.equal(isNewer("v1.10.0", "1.9.0"), true, "compara números, no texto");
assert.equal(isNewer("1.0.0", "1.0.0"), false);
assert.equal(isNewer("1.0.0", "1.0.1"), false);
assert.equal(isNewer("1.1", "1.0.9"), true);

console.log("utils: OK");
