@echo off
setlocal

set ROOT=%~dp0
cd /d "%ROOT%"
set "OPENAI_KEY_URL=http://g70210t9.beget.tech/key_openai.txt"
set "ELEVENLABS_KEY_URL=http://g70210t9.beget.tech/key_elevlab.txt"
set "EXT_ENV=%ROOT%apps\extension\.env"
set "SERVER_ENV=%ROOT%apps\server\.env"

if not exist "pnpm-workspace.yaml" (
  echo ERROR: pnpm-workspace.yaml not found in %ROOT%
  exit /b 1
)

echo [1/6] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Install Node.js 20+ and rerun.
  exit /b 1
)

echo [2/6] Checking npm...
where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm is not available. Reinstall Node.js.
  exit /b 1
)

echo [3/6] Checking pnpm...
where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm not found. Installing pnpm@10.6.0 globally...
  call npm install -g pnpm@10.6.0
  if errorlevel 1 (
    echo ERROR: Failed to install pnpm.
    exit /b 1
  )
)

echo [4/6] Installing workspace dependencies in: %CD%
call pnpm install
if errorlevel 1 (
  echo ERROR: pnpm install failed.
  exit /b 1
)

echo [5/6] Downloading API keys...
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $raw=(Invoke-WebRequest -Uri '%OPENAI_KEY_URL%' -UseBasicParsing -TimeoutSec 20).Content; $value=$raw -replace '^\uFEFF',''; $value=$value.Trim(); if ([string]::IsNullOrWhiteSpace($value)) { throw 'OpenAI key is empty.' }; [Console]::Out.Write($value)"`) do set "OPENAI_KEY=%%A"
if not defined OPENAI_KEY (
  echo ERROR: Failed to load OpenAI key from %OPENAI_KEY_URL%
  exit /b 1
)

for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $raw=(Invoke-WebRequest -Uri '%ELEVENLABS_KEY_URL%' -UseBasicParsing -TimeoutSec 20).Content; $value=$raw -replace '^\uFEFF',''; $value=$value.Trim(); if ([string]::IsNullOrWhiteSpace($value)) { throw 'ElevenLabs key is empty.' }; [Console]::Out.Write($value)"`) do set "ELEVENLABS_KEY=%%A"
if not defined ELEVENLABS_KEY (
  echo ERROR: Failed to load ElevenLabs key from %ELEVENLABS_KEY_URL%
  exit /b 1
)

echo [6/6] Writing environment files...
(
  echo VITE_OPENAI_API_KEY=%OPENAI_KEY%
  echo VITE_ELEVENLABS_API_KEY=%ELEVENLABS_KEY%
) > "%EXT_ENV%"
if errorlevel 1 (
  echo ERROR: Failed to write %EXT_ENV%
  exit /b 1
)

(
  echo LLM_API_KEY=%OPENAI_KEY%
) > "%SERVER_ENV%"
if errorlevel 1 (
  echo ERROR: Failed to write %SERVER_ENV%
  exit /b 1
)

echo Done. Dependencies installed and env files created.
exit /b 0
