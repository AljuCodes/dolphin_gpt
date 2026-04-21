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
