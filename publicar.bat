@echo off
cd /d "%~dp0"
chcp 65001 >nul
node scripts\publicar.mjs
pause
