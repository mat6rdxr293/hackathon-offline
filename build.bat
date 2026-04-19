@echo off
setlocal

set ROOT=%~dp0
cd /d "%ROOT%"

if not exist "pnpm-workspace.yaml" (
  echo ERROR: pnpm-workspace.yaml not found in %ROOT%
  exit /b 1
)

echo Running workspace build in: %CD%
where pnpm >nul 2>&1
if errorlevel 1 (
  echo ERROR: pnpm is not installed. Run install.bat first.
  exit /b 1
)

call pnpm -r --filter @hackathon/shared --filter @hackathon/server --filter @hackathon/extension build
if errorlevel 1 (
  echo ERROR: Build failed.
  exit /b 1
)

echo Build completed successfully.
exit /b 0