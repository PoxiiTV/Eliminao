@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

rem Vencord vive en una ruta fija: Discord carga desde ahi, asi que esta carpeta
rem (la del zip) se puede mover o borrar sin romper nada. Misma ruta en start.bat.
set "VENCORD_DIR=%LOCALAPPDATA%\Eliminao\Vencord"

if not exist "eliminao\index.tsx" (
    echo [x] Descomprime el zip entero primero y ejecuta instalar.bat desde la carpeta.
    goto :error
)

echo [1/6] Comprobando requisitos...
set "MISSING="
where git >nul 2>&1 || (set "MISSING=1" & call :install Git.Git Git)
where node >nul 2>&1 || (set "MISSING=1" & call :install OpenJS.NodeJS.LTS Node.js)
if defined MISSING (
    echo.
    echo Cierra esta ventana y vuelve a ejecutar instalar.bat para continuar.
    pause
    exit /b 1
)

for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 22 (
    echo [x] Vencord necesita Node.js 22 o superior y tienes la %NODE_MAJOR%.
    echo     Actualizalo: winget upgrade OpenJS.NodeJS.LTS  ^(o desde https://nodejs.org^)
    goto :error
)

where pnpm >nul 2>&1 || (
    echo Instalando pnpm...
    call npm i -g pnpm@11 || goto :error
    set "PATH=%APPDATA%\npm;%PATH%"
)

echo [2/6] Descargando Vencord en %VENCORD_DIR%...
if exist "%VENCORD_DIR%\.git" (
    git -C "%VENCORD_DIR%" pull --ff-only || goto :error
) else (
    git clone --depth 1 https://github.com/Vendicated/Vencord.git "%VENCORD_DIR%" || goto :error
)

echo [3/6] Instalando dependencias...
pushd "%VENCORD_DIR%"
call pnpm install --frozen-lockfile || (popd & goto :error)
popd

echo [4/6] Compilando con Eliminao...
call "%~dp0start.bat" nopause || goto :error

echo [5/6] Instalando en Discord (se cierra un momento)...
taskkill /im Discord.exe /f >nul 2>&1
taskkill /im DiscordPTB.exe /f >nul 2>&1
taskkill /im DiscordCanary.exe /f >nul 2>&1
pushd "%VENCORD_DIR%"
call node scripts/runInstaller.mjs -- -install -branch auto
popd

echo [6/6] Comprobando que Discord carga este Vencord...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\comprobar-discord.ps1" -Dist "%VENCORD_DIR%\dist" || goto :notpatched

echo.
echo Listo. Discord se esta abriendo con Eliminao activado: busca el reloj en la barra del chat.
pause
exit /b 0

:install
rem %1 = id de winget, %2 = nombre
where winget >nul 2>&1 || (
    echo [x] Falta %2. Instalalo a mano y vuelve a ejecutar instalar.bat.
    exit /b 0
)
echo Falta %2, instalandolo con winget...
winget install -e --id %1 --accept-source-agreements --accept-package-agreements
exit /b 0

:notpatched
echo.
echo [x] Discord sigue sin cargar este Vencord.
echo     - Comprueba que tienes Discord de escritorio instalado (no la version web).
echo     - Prueba con clic derecho en instalar.bat ^> "Ejecutar como administrador".
pause
exit /b 1

:error
echo [x] Algo ha fallado, revisa el mensaje de arriba.
pause
exit /b 1
