$ErrorActionPreference = 'Stop'
$portFile = Join-Path $PSScriptRoot '.saude-da-familia-server-port'
$stopFile = Join-Path $PSScriptRoot '.saude-da-familia-server-stop'
if (-not (Test-Path -LiteralPath $portFile)) {
    $legacyPortFile = Join-Path $PSScriptRoot '.lacos-server-port'
    if (Test-Path -LiteralPath $legacyPortFile) {
        $stopFile = Join-Path $PSScriptRoot '.lacos-server-stop'
    } else {
        Write-Host 'No active Saude da Familia server was found for this project.'
        exit 0
    }
} else {
    $legacyPortFile = $null
}

if (-not (Test-Path -LiteralPath $portFile) -and -not $legacyPortFile) {
    Write-Host 'No active Saude da Familia server was found for this project.'
    exit 0
}

Set-Content -LiteralPath $stopFile -Value 'stop' -Encoding ASCII
Write-Host 'Stop requested. The server will close shortly.' -ForegroundColor Yellow
