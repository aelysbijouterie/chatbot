@echo off
title AUREL'IA - Aelys
echo.
echo  ================================
echo   AUREL'IA - Demarrage en cours
echo  ================================
echo.

:: Reconstruction de la base documentaire
echo  [1/2] Construction de la base...
node build.js
echo.

:: Lancement du serveur
echo  [2/2] Demarrage du serveur...
echo.
node server.js
pause
