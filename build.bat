@echo off
setlocal

set ROOT=%~dp0
cd /d "%ROOT%"

if not exist "pnpm-workspace.yaml" (
  echo ERROR: pnpm-workspace.yaml not found in %ROOT%
  exit /b 1
)

echo [1/3] Running workspace build in: %CD%
where pnpm >nul 2>&1
if errorlevel 1 (
  echo ERROR: pnpm is not installed. Run install.bat first.
  exit /b 1
)

echo [2/3] Checking workspace dependencies...
set "NEEDS_INSTALL=0"
if not exist "node_modules\.pnpm" set "NEEDS_INSTALL=1"
if not exist "apps\server\node_modules\@hackathon\shared" set "NEEDS_INSTALL=1"
if not exist "apps\extension\node_modules\@hackathon\shared" set "NEEDS_INSTALL=1"

if "%NEEDS_INSTALL%"=="1" (
  echo Workspace links are missing. Running pnpm install...
  call pnpm install
  if errorlevel 1 (
    echo ERROR: pnpm install failed.
    exit /b 1
  )
)

echo [3/3] Building shared, server, extension...
call pnpm -r --filter @hackathon/shared --filter @hackathon/server --filter @hackathon/extension build
if errorlevel 1 (
  echo ERROR: Build failed.
  exit /b 1
)

echo Build completed successfully.
exit /b 0
