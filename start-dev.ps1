
docker start bookings-pg | Out-Null

$backend = Start-Process powershell -PassThru -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$PWD\backend'; .\.venv\Scripts\Activate.ps1; uvicorn main:app --reload"
)
$frontend = Start-Process powershell -PassThru -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$PWD\bookings-ui'; npm run dev"
)

"$($backend.Id)`n$($frontend.Id)" | Set-Content "$PWD\.dev-pids"
Write-Host "Started: Postgres + backend + frontend."

# .\start-dev.ps1
# .\stop-dev.ps1