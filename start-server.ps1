$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$port = 8000
$listener = $null

while ($port -le 8010) {
    $candidate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    try {
        $candidate.Start()
        $listener = $candidate
        break
    } catch {
        $candidate.Stop()
        $port++
    }
}

if (-not $listener) { throw 'Could not start the local server. Ports 8000 through 8010 may be in use.' }

Write-Host "Saude da Familia is available at http://localhost:$port/" -ForegroundColor Green
Write-Host 'Keep this PowerShell window open. Press Ctrl+C or run .\stop-server.ps1 to stop the server.'
$portFile = Join-Path $root '.saude-da-familia-server-port'
$stopFile = Join-Path $root '.saude-da-familia-server-stop'
Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue
Set-Content -LiteralPath $portFile -Value $port -Encoding ASCII

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.svg' = 'image/svg+xml'
    '.png' = 'image/png'
    '.ico' = 'image/x-icon'
}
$ascii = [System.Text.Encoding]::ASCII

try {
    while ($true) {
        if (Test-Path -LiteralPath $stopFile) { break }
        if (-not $listener.Pending()) {
            Start-Sleep -Milliseconds 100
            continue
        }
        $client = $listener.AcceptTcpClient()
        $stopRequested = $false
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, $ascii, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            while ($null -ne ($header = $reader.ReadLine()) -and $header.Length -gt 0) { }

            $status = '200 OK'
            $body = [byte[]]@()
            $contentType = 'text/plain; charset=utf-8'
            if (-not $requestLine -or $requestLine -notmatch '^GET\s+(\S+)\s+HTTP/') {
                $status = '405 Method Not Allowed'
                $body = $ascii.GetBytes('Method not allowed')
            } else {
                $requestPath = $Matches[1].Split('?')[0]
                if ($requestPath -eq '/__stop') {
                    $stopRequested = $true
                    $body = $ascii.GetBytes('Server stopped')
                } else {
                    $relative = [Uri]::UnescapeDataString($requestPath).TrimStart('/')
                    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
                    $relative = $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
                    $file = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
                    if (-not $file.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
                        $status = '403 Forbidden'
                        $body = $ascii.GetBytes('Forbidden')
                    } elseif (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
                        $status = '404 Not Found'
                        $body = $ascii.GetBytes('Not found')
                    } else {
                        $body = [System.IO.File]::ReadAllBytes($file)
                        $extension = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
                        if ($mime.ContainsKey($extension)) { $contentType = $mime[$extension] }
                        else { $contentType = 'application/octet-stream' }
                    }
                }
            }

            $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
            $headerBytes = $ascii.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
            $stream.Flush()
            $reader.Dispose()
        } catch {
            # Close this request and continue serving subsequent requests.
        } finally {
            $client.Close()
        }
        if ($stopRequested) { break }
    }
} finally {
    $listener.Stop()
    Remove-Item -LiteralPath $portFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue
}
