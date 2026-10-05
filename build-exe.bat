@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

rem Compilador de C# que trae Windows (.NET Framework 4.8): no hace falta instalar nada
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"

if not exist release mkdir release
"%CSC%" /nologo /codepage:65001 /optimize+ /target:winexe ^
    /win32icon:instalador\eliminao.ico /win32manifest:instalador\app.manifest ^
    /r:System.Windows.Forms.dll /r:System.Drawing.dll ^
    /out:release\Eliminao-Instalador.exe instalador\Instalador.cs || goto :error

echo Generado: release\Eliminao-Instalador.exe
if /i not "%~1"=="nopause" pause
exit /b 0

:error
echo [x] No se pudo compilar el instalador.
if /i not "%~1"=="nopause" pause
exit /b 1
