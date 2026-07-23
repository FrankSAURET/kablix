# Associe les fichiers .projix à Visual Studio Code (Windows).
#
# Effet : un double-clic sur un fichier .projix dans l'Explorateur Windows ouvre
# VS Code, qui l'affiche AUTOMATIQUEMENT dans l'éditeur Kablix (le CustomEditor
# `kablix.projix` a la priorité « default » sur *.projix).
#
# Écrit UNIQUEMENT dans HKCU (utilisateur courant) : aucun droit administrateur
# requis, réversible. Lancer :
#     powershell -ExecutionPolicy Bypass -File .\associer-projix-windows.ps1
# Désassocier :
#     powershell -ExecutionPolicy Bypass -File .\associer-projix-windows.ps1 -Remove

param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$ext    = '.projix'
$progId = 'Kablix.projix'
$clsRoot = 'HKCU:\Software\Classes'

if ($Remove) {
    Remove-Item "$clsRoot\$ext"    -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "$clsRoot\$progId" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Association .projix retirée (HKCU)." -ForegroundColor Yellow
    return
}

# Localise Code.exe : PATH (code.cmd → dossier bin), puis emplacements usuels.
function Find-CodeExe {
    $cmd = (Get-Command code -ErrorAction SilentlyContinue).Source
    if ($cmd) {
        $exe = Join-Path (Split-Path (Split-Path $cmd)) 'Code.exe'
        if (Test-Path $exe) { return $exe }
    }
    foreach ($p in @(
        "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe",
        "$env:ProgramFiles\Microsoft VS Code\Code.exe",
        "${env:ProgramFiles(x86)}\Microsoft VS Code\Code.exe"
    )) { if (Test-Path $p) { return $p } }
    return $null
}

$code = Find-CodeExe
if (-not $code) {
    Write-Error "Code.exe introuvable. Installe VS Code ou ajoute-le au PATH."
    return
}

# ProgId : nom affiché, icône (celle de VS Code), commande d'ouverture.
New-Item   "$clsRoot\$progId"                  -Force | Out-Null
Set-ItemProperty "$clsRoot\$progId" '(default)' 'Projet Kablix'
New-Item   "$clsRoot\$progId\DefaultIcon"      -Force | Out-Null
Set-ItemProperty "$clsRoot\$progId\DefaultIcon" '(default)' "`"$code`",0"
New-Item   "$clsRoot\$progId\shell\open\command" -Force | Out-Null
Set-ItemProperty "$clsRoot\$progId\shell\open\command" '(default)' "`"$code`" `"%1`""

# Extension → ProgId.
New-Item "$clsRoot\$ext" -Force | Out-Null
Set-ItemProperty "$clsRoot\$ext" '(default)' $progId

Write-Host "OK : .projix associé à VS Code ($code)." -ForegroundColor Green
Write-Host "Double-clique un .projix dans l'Explorateur -> il s'ouvre dans Kablix." -ForegroundColor Green
Write-Host "Si l'icône ne change pas tout de suite, déconnecte/reconnecte la session Windows." -ForegroundColor DarkGray
