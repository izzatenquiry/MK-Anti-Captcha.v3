@echo off
REM Change to the script's directory
cd /d "%~dp0"

echo ========================================
echo   MONOKLIX - Starting All Services
echo ========================================
echo.
echo Current directory: %CD%
echo.

REM Start server in a new window (from server folder)
echo [*] Starting Node.js Server...
start "MONOKLIX Server" cmd /k "cd /d %~dp0server && node index.js"

REM Wait a moment for server to start
timeout /t 2 /nobreak >nul

REM Start app in a new window
echo [*] Starting React App...
start "MONOKLIX App" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ========================================
echo [OK] All services are starting...
echo ========================================
echo.
echo Token Generator: https://api.monoklix.com (Centralized)
echo Node.js Server:  Running on separate window
echo React App:       Running on separate window
echo.
echo Press any key to close this window (this will NOT stop the services)
pause >nul

