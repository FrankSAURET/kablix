# Associe les fichiers .projix à Visual Studio Code (Windows).
#
# Effet : un double-clic sur un fichier .projix dans l'Explorateur Windows ouvre
# VS Code, qui l'affiche AUTOMATIQUEMENT dans l'éditeur Kablix (le CustomEditor
# `kablix.projix` a la priorité « default » sur *.projix). L'icône du fichier
# devient celle de Kablix (kablix.ico).
#
# Écrit UNIQUEMENT dans HKCU (utilisateur courant) : aucun droit administrateur
# requis, réversible. Lancer :
#     powershell -ExecutionPolicy Bypass -File .\associer-projix-windows.ps1
# En précisant l'icône (l'extension passe ce chemin automatiquement) :
#     powershell -ExecutionPolicy Bypass -File .\associer-projix-windows.ps1 -IconPath "C:\...\kablix.ico"
# Désassocier :
#     powershell -ExecutionPolicy Bypass -File .\associer-projix-windows.ps1 -Remove

param(
    [switch]$Remove,
    [string]$IconPath
)

$ErrorActionPreference = 'Stop'
$ext    = '.projix'
$progId = 'Kablix.projix'
$clsRoot = 'HKCU:\Software\Classes'
# Emplacement STABLE de l'icône (survit aux mises à jour d'extension, qui changent
# le dossier de version). Le registre pointe ici, jamais dans le dossier d'install.
$iconStore = Join-Path $env:LOCALAPPDATA 'Kablix'
$iconDest  = Join-Path $iconStore 'kablix.ico'

if ($Remove) {
    Remove-Item "$clsRoot\$ext"    -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "$clsRoot\$progId" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $iconDest -Force -ErrorAction SilentlyContinue
    Write-Host "Association .projix retiree (HKCU)." -ForegroundColor Yellow
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

# Localise l'icône kablix.ico : -IconPath fourni, sinon à côté du script, sinon
# à la racine du dépôt (dossier parent de outils/).
function Find-Icon {
    if ($IconPath -and (Test-Path $IconPath)) { return (Resolve-Path $IconPath).Path }
    foreach ($p in @(
        (Join-Path $PSScriptRoot 'kablix.ico'),
        (Join-Path (Split-Path $PSScriptRoot) 'kablix.ico'),
        (Join-Path (Split-Path $PSScriptRoot) 'media\kablix.ico')
    )) { if (Test-Path $p) { return (Resolve-Path $p).Path } }
    return $null
}

$code = Find-CodeExe
if (-not $code) {
    Write-Error "Code.exe introuvable. Installe VS Code ou ajoute-le au PATH."
    return
}

# Copie l'icône vers l'emplacement stable ; à défaut, on retombe sur l'icône de
# VS Code (index 0) pour ne pas laisser un ProgId sans icône.
$srcIcon = Find-Icon
$iconRef = "`"$code`",0"
if ($srcIcon) {
    New-Item -ItemType Directory -Path $iconStore -Force | Out-Null
    Copy-Item $srcIcon $iconDest -Force
    $iconRef = "`"$iconDest`",0"
} else {
    Write-Host "kablix.ico introuvable : l'icone de VS Code sera utilisee." -ForegroundColor DarkYellow
}

# ProgId : nom affiché, icône Kablix, commande d'ouverture.
New-Item   "$clsRoot\$progId"                  -Force | Out-Null
Set-ItemProperty "$clsRoot\$progId" '(default)' 'Projet Kablix'
New-Item   "$clsRoot\$progId\DefaultIcon"      -Force | Out-Null
Set-ItemProperty "$clsRoot\$progId\DefaultIcon" '(default)' $iconRef
New-Item   "$clsRoot\$progId\shell\open\command" -Force | Out-Null
Set-ItemProperty "$clsRoot\$progId\shell\open\command" '(default)' "`"$code`" `"%1`""

# Extension → ProgId.
New-Item "$clsRoot\$ext" -Force | Out-Null
Set-ItemProperty "$clsRoot\$ext" '(default)' $progId

# Purge le cache d'icônes de l'Explorateur pour un rafraîchissement immédiat.
try {
    $sig = '[System.Runtime.InteropServices.DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, int flags, System.IntPtr item1, System.IntPtr item2);'
    $sh = Add-Type -MemberDefinition $sig -Name 'ShellNotify' -Namespace 'Kablix' -PassThru
    # SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0
    $sh::SHChangeNotify(0x08000000, 0, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
} catch { }

Write-Host "OK : .projix associe a VS Code ($code)." -ForegroundColor Green
Write-Host "Double-clique un .projix dans l'Explorateur -> il s'ouvre dans Kablix." -ForegroundColor Green
if (-not $srcIcon) {
    Write-Host "Si l'icone ne change pas tout de suite, deconnecte/reconnecte la session Windows." -ForegroundColor DarkGray
}
