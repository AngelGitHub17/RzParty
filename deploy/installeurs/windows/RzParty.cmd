@echo off
chcp 65001 >nul
title RzParty
cd /d "%~dp0"
rem Lanceur de la version installée (.msi) : Node.js est fourni dans le dossier runtime.
set "PATH=%~dp0runtime;%PATH%"
set RZ_LAUNCHER=1
set RZ_AUTO_RESTART=1
rem Liens vers les paquets du jeu (le .msi ne sait pas installer de liens) : recréés au besoin.
for %%p in (shared minigames server client) do (
  dir /AL /B "node_modules\@rzparty" 2>nul | findstr /x /c:"%%p" >nul || (
    rmdir /s /q "node_modules\@rzparty\%%p" 2>nul
    if not exist "node_modules\@rzparty" mkdir "node_modules\@rzparty"
    mklink /J "node_modules\@rzparty\%%p" "%~dp0packages\%%p" >nul
  )
)
:boucle
"%~dp0runtime\node.exe" "node_modules\tsx\dist\cli.mjs" "packages\server\src\index.ts"
rem 75 : une mise à jour vient d'être installée, on relance la nouvelle version.
if %errorlevel%==75 goto boucle
if not %errorlevel%==0 (
  echo.
  echo RzParty s'est arrete sur une erreur. Lis le message ci-dessus.
  pause
)
