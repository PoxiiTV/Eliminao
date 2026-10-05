@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

where git >nul 2>&1 || (echo [x] Falta git: https://git-scm.com & goto :error)
where node >nul 2>&1 || (echo [x] Falta Node.js: https://nodejs.org & goto :error)
where pnpm >nul 2>&1 || (echo Instalando pnpm... & call npm i -g pnpm || goto :error)

if exist Vencord\.git (
    echo Actualizando Vencord...
    git -C Vencord pull --ff-only || goto :error
) else (
    echo Descargando Vencord...
    git clone --depth 1 https://github.com/Vendicated/Vencord.git Vencord || goto :error
)

pushd Vencord
call pnpm install --frozen-lockfile || (popd & goto :error)
popd

call "%~dp0start.bat" nopause || goto :error

echo.
echo Se abre el instalador de Vencord: elige tu Discord e instala/repara.
pushd Vencord
call pnpm inject || (popd & goto :error)
popd

echo.
echo Listo. Cierra Discord del todo (tambien de la bandeja), abrelo y activa
echo "Eliminao" en Ajustes ^> Vencord ^> Plugins.
pause
exit /b 0

:error
echo [x] Algo ha fallado, revisa el mensaje de arriba.
pause
exit /b 1
