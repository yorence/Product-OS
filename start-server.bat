@echo off
echo ============================================
echo  Kaufman Rossin - AI Hub Local Server
echo ============================================
echo.
echo Starting local proxy server on port 3001...
echo Keep this window open while using the app.
echo.
start "" http://localhost:3001
node "%~dp0server.js"
pause
