@echo off
echo ========================================================
echo Iniciando Servidor Backend FastAPI (RAG)
echo ========================================================
call .\venv\Scripts\activate
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
pause
