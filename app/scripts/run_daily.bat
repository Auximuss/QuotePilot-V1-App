@echo off
REM Keys are stored in .env.local — never commit that file to git
for /f "tokens=1,2 delims==" %%a in (.env.local) do set %%a=%%b
python "%~dp0instagram_agent.py"
