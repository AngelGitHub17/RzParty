@echo off
chcp 65001 >nul
title Mise a jour de RzParty
cd /d "%~dp0"
rem Met RzParty a jour : git pull si le dossier vient de GitHub, sinon telecharge la derniere version.
rem Les profils (dossier data) et le port enregistre sont conserves.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\mettre-a-jour.ps1" %*
if errorlevel 1 (
  echo.
  echo La mise a jour a echoue. Le jeu n'a pas ete modifie.
  pause
  exit /b 1
)
echo.
echo Mise a jour terminee. Relance start.bat pour jouer.
pause
