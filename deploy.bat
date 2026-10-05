@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

if exist deploy-hosting rmdir /s /q deploy-hosting
robocopy eliminao deploy-hosting\eliminao /E /NJH /NJS /NFL /NDL >nul
if errorlevel 8 goto :error
copy /y README.md deploy-hosting\ >nul || goto :error
copy /y LICENSE deploy-hosting\ >nul || goto :error

echo Listo: deploy-hosting\eliminao
echo Copia esa carpeta en src\userplugins\ de cualquier Vencord y compila.
pause
exit /b 0

:error
echo [x] Algo ha fallado, revisa el mensaje de arriba.
pause
exit /b 1
