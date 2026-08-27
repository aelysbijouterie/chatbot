@echo off
setlocal

cd /d "%~dp0"

echo ============================================
echo   Synchronisation avec GitHub
echo ============================================
echo.
echo Recuperation des dernieres modifications (site admin, etc)...
git pull --rebase

if errorlevel 1 (
  echo.
  echo ============================================
  echo   ATTENTION : conflit reel detecte.
  echo   Ne continue pas seule : previens Claude
  echo   avant de faire quoi que ce soit d'autre.
  echo ============================================
  echo.
  pause
  exit /b 1
)

echo.
echo Envoi de tes modifications vers GitHub...
git push

if errorlevel 1 (
  echo.
  echo ============================================
  echo   L'envoi a echoue. Relance ce script :
  echo   il y a sans doute eu un nouveau changement
  echo   entre-temps, un deuxieme essai suffit
  echo   generalement.
  echo ============================================
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Termine ! Le site va se mettre a jour
echo   automatiquement dans une minute ou deux.
echo ============================================
echo.
pause
