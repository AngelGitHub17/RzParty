@echo off
chcp 65001 >nul
title RzParty
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Telecharge la version LTS sur https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)

rem Installe ou met a jour les dependances quand elles ont change depuis le dernier lancement.
set NEED_INSTALL=0
if not exist node_modules set NEED_INSTALL=1
if not exist node_modules\.rzparty-lock.json set NEED_INSTALL=1
if %NEED_INSTALL%==0 (
  fc /b package-lock.json node_modules\.rzparty-lock.json >nul 2>nul
  if errorlevel 1 set NEED_INSTALL=1
)
if %NEED_INSTALL%==1 (
  echo Installation des dependances, patiente un instant...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto erreur
  copy /y package-lock.json node_modules\.rzparty-lock.json >nul
)

call npm start
if errorlevel 1 goto erreur
exit /b 0

:erreur
echo.
echo Une erreur est survenue. Lis le message ci-dessus.
pause
exit /b 1
