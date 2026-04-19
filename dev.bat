@echo off
setlocal

echo Checking pnpm...
where pnpm >nul 2>&1
if errorlevel 1 (
  echo ERROR: pnpm is not installed. Run install.bat first.
  exit /b 1
)

echo Checking npx...
where npx >nul 2>&1
if errorlevel 1 (
  echo ERROR: npx is not available. Reinstall Node.js.
  exit /b 1
)

set ROOT=%~dp0
cd /d "%ROOT%"

if not exist "pnpm-workspace.yaml" (
  echo ERROR: pnpm-workspace.yaml not found in %ROOT%
  exit /b 1
)

echo Starting backend dev server in new window...
start "Hackathon Backend (8787)" cmd /k "cd /d ""%ROOT%"" && pnpm --filter @hackathon/server dev"

echo Starting frontend mock server in new window...
start "Hackathon Frontend Mock (4173)" cmd /k "cd /d ""%ROOT%"" && npx serve mock -l 4173"

echo Starting extension watch build in new window...
start "Hackathon Extension Watch" cmd /k "cd /d ""%ROOT%"" && pnpm --filter @hackathon/extension dev"

echo Dev processes started.
echo Backend: http://127.0.0.1:8787
echo Frontend mock: http://127.0.0.1:4173/pages/patient-card.html
echo Extension output: apps\extension\dist
exit /b 0
