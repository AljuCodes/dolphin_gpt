@echo off
REM dolphin_gpt launcher for Windows. Double-click to start.

cd /d "%~dp0"

if not exist "backend\venv" (
  echo Backend is not set up yet. Run the first-time setup steps in README.md.
  pause
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo Frontend is not set up yet. Run the first-time setup steps in README.md.
  pause
  exit /b 1
)

curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
  echo Ollama does not appear to be running.
  echo Open the Ollama app first, then try again.
  pause
  exit /b 1
)

set "MODEL=hf.co/TrevorJS/gemma-4-E4B-it-uncensored-GGUF:Q4_K_M"
if exist "backend\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("backend\.env") do (
    if /i "%%A"=="OLLAMA_MODEL" set "MODEL=%%B"
  )
)

curl -s http://localhost:11434/api/tags | findstr /C:"\"%MODEL%\"" >nul
if errorlevel 1 (
  echo.
  echo AI model "%MODEL%" is not downloaded yet.
  echo Downloading now ^(about 3 GB, one time^). You can cancel with Ctrl+C.
  echo.
  where ollama >nul 2>&1
  if errorlevel 1 (
    echo Could not find the 'ollama' command.
    echo Please run this manually, then restart the launcher:
    echo     ollama pull %MODEL%
    pause
    exit /b 1
  )
  ollama pull "%MODEL%"
  if errorlevel 1 (
    echo.
    echo Model download failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
  echo.
  echo Model ready.
  echo.
)

echo Starting backend on http://localhost:8000
start "dolphin_gpt backend" cmd /k "cd backend && venv\Scripts\activate && uvicorn main:app --host 127.0.0.1 --port 8000"

echo Starting frontend on http://localhost:3000
start "dolphin_gpt frontend" cmd /k "cd frontend && npm run dev"

timeout /t 5 /nobreak >nul
start "" http://localhost:3000

echo.
echo dolphin_gpt is running.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8000
echo Close the two opened windows to stop.
echo.
pause
