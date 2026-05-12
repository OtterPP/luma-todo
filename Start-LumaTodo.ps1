param(
  [int]$Port = 5173
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$browserUrl = "http://127.0.0.1:$Port"
$devWindowTitle = 'LumaTodo Dev Server'

Start-Process -FilePath 'cmd.exe' -ArgumentList "/c title $devWindowTitle && npm run dev" -WorkingDirectory $projectRoot

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  try {
    Invoke-WebRequest -Uri $browserUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
    Start-Process $browserUrl
    exit 0
  } catch {
    Start-Sleep -Milliseconds 600
  }
}

Start-Process $browserUrl
