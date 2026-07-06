
docker stop bookings-pg | Out-Null

$pidFile = "$PSScriptRoot\.dev-pids"
if (Test-Path $pidFile) {
  Get-Content $pidFile | Where-Object { $_ -match '^\d+$' } | ForEach-Object {
    taskkill /PID $_ /T /F 2>$null
  }
  Remove-Item $pidFile
}
Write-Host "Stopped: Postgres + backend + frontend."


# .\start-dev.ps1
# .\stop-dev.ps1