// Publica una versión de Eliminao: compila, genera el instalador y crea el release en GitHub.
// Lo que se sube es lo que descargan el instalador y la actualización automática del plugin.
// Uso: publicar.bat (sube antes VERSION en eliminao/utils.ts y añade la sección al CHANGELOG.md)

import { execSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dirname, "..");
const release = join(root, "release");
const dist = join(process.env.LOCALAPPDATA, "Eliminao", "Vencord", "dist");
const FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];

const run = cmd => execSync(cmd, { cwd: root, stdio: "inherit", shell: "cmd.exe" });
const out = cmd => execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
const fail = msg => {
    console.error(`\n[x] ${msg}`);
    process.exit(1);
};

const version = readFileSync(join(root, "eliminao", "utils.ts"), "utf8").match(/VERSION = "(.+?)"/)[1];
const tag = `v${version}`;
console.log(`Publicando Eliminao ${tag}...\n`);

if (out("git status --porcelain")) fail("Hay cambios sin commitear. Haz commit antes de publicar.");
if (out(`git ls-remote --tags origin ${tag}`)) fail(`La ${tag} ya está publicada. Sube VERSION en eliminao/utils.ts.`);

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const notes = changelog.match(new RegExp(`^## ${tag.replace(/\./g, "\\.")}\\b.*?\\n([\\s\\S]*?)(?=^## v|(?![\\s\\S]))`, "m"))?.[1].trim();
if (!notes) fail(`Añade una sección "## ${tag}" al CHANGELOG.md con las novedades.`);

run(`"${join(root, "start.bat")}" nopause`);
run(`"${join(root, "build-exe.bat")}" nopause`);

mkdirSync(release, { recursive: true });
for (const f of FILES) {
    if (!existsSync(join(dist, f))) fail(`Falta ${f} en ${dist}. ¿Has ejecutado instalar.bat en este PC?`);
    copyFileSync(join(dist, f), join(release, f));
}
writeFileSync(join(release, "version.json"), JSON.stringify({ version, notes }, null, 4));
writeFileSync(join(release, "notes.md"), notes);

const assets = [...FILES, "version.json", "Eliminao-Instalador.exe"].map(f => `"release\\${f}"`).join(" ");
run("git push");
run(`gh release create ${tag} ${assets} --title "Eliminao ${tag}" --notes-file release\\notes.md`);
rmSync(join(release, "notes.md"));

console.log(`\nPublicada ${tag}. Los que ya lo tienen instalado se actualizarán solos.`);
