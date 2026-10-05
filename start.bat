@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

if not exist Vencord\node_modules (
    echo Primero ejecuta instalar.bat
    goto :error
)

echo [1/3] Tests...
call Vencord\node_modules\.bin\tsx tests\duration.test.ts || goto :error

echo [2/3] Copiando el plugin a Vencord...
robocopy eliminao Vencord\src\userplugins\eliminao /MIR /NJH /NJS /NFL /NDL >nul
if errorlevel 8 goto :error

echo [3/3] Compilando Vencord...
pushd Vencord
call pnpm build || (popd & goto :error)
popd

echo.
echo Hecho. En Discord pulsa Ctrl+R para recargar.
if /i not "%~1"=="nopause" pause
exit /b 0

:error
echo [x] Algo ha fallado, revisa el mensaje de arriba.
if /i not "%~1"=="nopause" pause
exit /b 1
