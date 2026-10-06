# Imagem oficial Python leve
FROM python:3.12-slim

# Evitar escrita de bytecode e habilitar logs imediatos
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Instalar dependências de sistema necessárias
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar dependências e instalar
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código do backend
COPY backend/ ./backend

# Hugging Face Spaces expõe por padrão a porta 7860
EXPOSE 7860

# Iniciar o servidor FastAPI na porta 7860
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
