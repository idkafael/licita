@echo off
echo ========================================
echo    LicitaFacil - Iniciando sistema...
echo ========================================
echo.

echo [1/2] Iniciando backend Python (porta 8000)...
start "Backend LicitaFacil" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && python main.py"

timeout /t 2 /nobreak > nul

echo [2/2] Iniciando frontend Next.js (porta 3000)...
start "Frontend LicitaFacil" cmd /k "cd /d %~dp0licitacao-app && npm run dev"

timeout /t 3 /nobreak > nul

echo.
echo ========================================
echo  Sistema iniciado!
echo  Acesse: http://localhost:3000
echo ========================================
echo.
pause
