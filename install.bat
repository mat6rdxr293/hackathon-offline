@echo off
setlocal

set ROOT=%~dp0
cd /d "%ROOT%"

if not exist "pnpm-workspace.yaml" (
  echo ERROR: pnpm-workspace.yaml not found in %ROOT%
  exit /b 1
)

echo [1/4] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Install Node.js 20+ and rerun.
  exit /b 1
)

echo [2/4] Checking npm...
where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm is not available. Reinstall Node.js.
  exit /b 1
)

echo [3/4] Checking pnpm...
where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm not found. Installing pnpm@10.6.0 globally...
  call npm install -g pnpm@10.6.0
  if errorlevel 1 (
    echo ERROR: Failed to install pnpm.
    exit /b 1
  )
)

echo [4/4] Installing workspace dependencies in: %CD%
call pnpm install
if errorlevel 1 (
  echo ERROR: pnpm install failed.
  exit /b 1
)

echo Done. Dependencies installed successfully.
exit /b 0