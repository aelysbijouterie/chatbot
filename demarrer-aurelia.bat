@echo off
title AUREL'IA
:: Vérifie si le serveur est déjà lancé sur le port 3000
netstat -an | find ":3000" | find "LISTENING" >nul 2>&1
if %errorlevel% == 0 (
    start http://localhost:3000
    exit
)
:: Sinon : lance le serveur en arrière-plan et ouvre le navigateur
cd /d "%~dp0"
start /b node server.js > aurelia.log 2>&1
timeout /t 4 /nobreak >nul
start http://localhost:3000
exit
