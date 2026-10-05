@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

rem Misma ruta que en instalar.bat
set "VENCORD_DIR=%LOCALAPPDATA%\Eliminao\Vencord"

if not exist "%VENCORD_DIR%\node_modules" (
    echo Primero ejecuta instalar.bat
    goto :error
)

echo [1/3] Tests...
call "%VENCORD_DIR%\node_modules\.bin\tsx" tests\utils.test.ts || goto :error

echo [2/3] Copiando el plugin a Vencord...
robocopy eliminao "%VENCORD_DIR%\src\userplugins\eliminao" /MIR /NJH /NJS /NFL /NDL >nul
if errorlevel 8 goto :error

echo [3/3] Compilando Vencord...
pushd "%VENCORD_DIR%"
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
