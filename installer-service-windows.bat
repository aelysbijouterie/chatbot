@echo off
:: Doit être exécuté en tant qu'Administrateur
title Installation AUREL'IA - Service Windows
echo.
echo  Installation d'AUREL'IA comme service Windows...
echo  (lance automatiquement au démarrage du serveur)
echo.

set DIR=%~dp0
set NODE=node

:: Créer le service Windows avec sc.exe
sc create "AurelIA" binPath= "cmd /c cd /d \"%DIR%\" && %NODE% server.js" start= auto DisplayName= "AURELIA - Chatbot Aelys" >nul 2>&1
if %errorlevel% == 0 (
    sc start "AurelIA"
    echo  Service installe et demarre avec succes.
    echo  AUREL'IA demarrera automatiquement au prochain reboot.
) else (
    echo  Erreur : relancer ce script en tant qu'Administrateur.
)
echo.
pause
