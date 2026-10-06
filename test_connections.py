import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Forçar stdout para UTF-8 no Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

print("=" * 60)
print("TESTE DE CONECTIVIDADE E COMUNICACAO DE SERVICOS")
print("=" * 60)

# -------------------------------------------------------------
# 1. TESTE SUPABASE
# -------------------------------------------------------------
supabase_url = os.getenv("SUPABASE_URL", "")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", "")

print("\n[1/2] Testando Comunicacao com o Supabase...")
print(f"  URL: {supabase_url[:35]}..." if len(supabase_url) > 35 else f"  URL: {supabase_url}")

if not supabase_url or not supabase_key or "seu-projeto" in supabase_url:
    print("  [ERRO]: SUPABASE_URL ou SUPABASE_KEY nao configuradas no .env")
else:
    try:
        from supabase import create_client
        client = create_client(supabase_url, supabase_key)
        
        # Testar consulta nas tabelas
        res = client.table("documento_chunks").select("id", count="exact").limit(1).execute()
        count = res.count if res.count is not None else 0
        print(f"  [OK] SUCESSO: Conexao com Supabase estabelecida com exito!")
        print(f"  Total de chunks encontrados na tabela documento_chunks: {count}")

        # Testar tabela documentos
        res_docs = client.table("documentos").select("id", count="exact").limit(1).execute()
        docs_count = res_docs.count if res_docs.count is not None else 0
        print(f"  Total de documentos registrados na tabela documentos: {docs_count}")

    except Exception as exc:
        print(f"  [FALHA] Erro ao comunicar com o Supabase: {exc}")

# -------------------------------------------------------------
# 2. TESTE OPENROUTER
# -------------------------------------------------------------
openrouter_key = os.getenv("OPENROUTER_API_KEY", "")
openrouter_model = os.getenv("OPENROUTER_MODEL", "openrouter/auto")
openrouter_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

print("\n[2/2] Testando Comunicacao com o OpenRouter...")
print(f"  Modelo configurado: {openrouter_model}")

if not openrouter_key or "sua-chave" in openrouter_key:
    print("  [ERRO]: OPENROUTER_API_KEY nao configurada no .env")
else:
    try:
        import httpx
        headers = {
            "Authorization": f"Bearer {openrouter_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Teste Conexao RAG"
        }
        payload = {
            "model": openrouter_model,
            "messages": [
                {"role": "user", "content": "Responda apenas a palavra 'CONECTADO'."}
            ],
            "temperature": 0
        }
        
        with httpx.Client(timeout=30.0) as http_client:
            endpoint = f"{openrouter_url.rstrip('/')}/chat/completions"
            resp = http_client.post(endpoint, headers=headers, json=payload)
            
            if resp.status_code == 200:
                data = resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                model_used = data.get("model", openrouter_model)
                print(f"  [OK] SUCESSO: Comunicacao com OpenRouter validada!")
                print(f"  Modelo respondente: {model_used}")
                print(f"  Resposta da LLM: {content}")
            else:
                print(f"  [FALHA] OpenRouter HTTP {resp.status_code}: {resp.text}")

    except Exception as exc:
        print(f"  [FALHA] Erro ao conectar ao OpenRouter: {exc}")

print("\n" + "=" * 60)
