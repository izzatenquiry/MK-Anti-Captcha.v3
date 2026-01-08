@echo off
echo ========================================
echo   MONOKLIX - Starting Server and App
echo ========================================
echo.

REM Start server in a new window (from server folder)
start "MONOKLIX Server" cmd /k "cd server && node index.js"

REM Wait a moment for server to start
timeout /t 2 /nobreak >nul

REM Start app in a new window
start "MONOKLIX App" cmd /k "npm run dev"

echo.
echo [OK] Server and App are starting in separate windows...
echo.
echo Server: Running on separate window (node index.js)
echo App: Running on separate window (npm run dev)
echo.
echo Press any key to close this window (this will NOT stop the server/app)
pause >nul

