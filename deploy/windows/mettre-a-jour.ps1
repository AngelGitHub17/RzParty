# Mise à jour de RzParty sous Windows (lancé par mettre-a-jour.bat).
param([string]$Url = $(if ($env:RZ_UPDATE_URL) { $env:RZ_UPDATE_URL } else { "https://rzparty.fr" }))
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

if (Test-Path (Join-Path $root ".git")) {
  Write-Host "Dossier installé avec git : récupération des nouveautés…"
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { exit 1 }
  exit 0
}

$current = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
Write-Host "Version installée : $current"
try {
  $info = Invoke-RestMethod -Uri "$Url/api/version" -TimeoutSec 15
} catch {
  Write-Host "Impossible de joindre $Url : vérifie la connexion Internet."
  exit 1
}
if ([version]$info.version -le [version]$current) {
  Write-Host "RzParty est déjà à jour."
  exit 0
}

Write-Host "Téléchargement de la version $($info.version)…"
$tmp = Join-Path $env:TEMP ("rzparty-maj-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp "RzParty.zip"
  Invoke-WebRequest -Uri "$Url/telecharger" -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $src = Join-Path $tmp "RzParty"
  if (-not (Test-Path (Join-Path $src "package.json"))) { throw "Archive inattendue." }
  Write-Host "Installation…"
  # Copie par-dessus l'ancienne version, sans toucher aux profils ni aux réglages.
  robocopy $src $root /E /XD data node_modules .git /XF rzparty.config.json /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copie des fichiers impossible (code $LASTEXITCODE)." }
  Write-Host "RzParty est passé en version $($info.version)."
  exit 0
} catch {
  Write-Host "Erreur : $_"
  exit 1
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
