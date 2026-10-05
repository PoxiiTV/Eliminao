# Comprueba qué Vencord carga cada Discord instalado. Sale con 0 si alguno carga el de $Dist
# (y lo abre), o con 1 si ninguno. Hace falta porque el instalador de Vencord sale con 0 aunque falle.
param(
    [Parameter(Mandatory)][string]$Dist,
    [switch]$NoLaunch
)

$ok = $false
foreach ($root in Get-ChildItem $env:LOCALAPPDATA -Directory -Filter 'Discord*') {
    $app = Get-ChildItem $root.FullName -Directory -Filter 'app-*' |
        Sort-Object { [version]($_.Name -replace '^app-') } -Descending |
        Select-Object -First 1
    if (-not $app) { continue }

    $asar = Join-Path $app.FullName 'resources\app.asar'
    if (-not (Test-Path $asar)) { continue }

    # Parcheado = un app.asar diminuto que hace require() del patcher de Vencord
    $target = $null
    if ((Get-Item $asar).Length -lt 10KB) {
        $text = [IO.File]::ReadAllText($asar).Replace('\\', '\')
        $target = [regex]::Match($text, 'require\("(.+?)"\)').Groups[1].Value
    }

    if ($target) { Write-Host "$($root.Name): carga Vencord desde $target" }
    else { Write-Host "$($root.Name): sin Vencord" }

    if ($target -and $target.ToLower().StartsWith($Dist.TrimEnd('\').ToLower() + '\')) {
        $ok = $true
        if (-not $NoLaunch) {
            Start-Process (Join-Path $root.FullName 'Update.exe') -ArgumentList '--processStart', "$($root.Name).exe"
        }
    }
}

if (-not $ok) { exit 1 }
