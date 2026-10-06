import os
import shutil
import tempfile
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import settings
from backend.extractor import DocumentExtractor
from backend.chunker import CoherentChunker
from backend.embedding_service import embedding_service
from backend.supabase_service import supabase_service
from backend.llm_service import llm_service

app = FastAPI(
    title="RAG Prático API",
    description="Backend local de OCR, Chunking, Embeddings e RAG com PGVector e OpenRouter",
    version="1.0.0"
)

# Habilita CORS para conexão com o frontend Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chunker = CoherentChunker(min_chars=200, max_chars=800)

class FolderIngestionRequest(BaseModel):
    folder_path: str

class QueryRequest(BaseModel):
    query: str
    top_k: Optional[int] = 3
    threshold: Optional[float] = 0.0

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "RAG Backend",
        "embedding_model": settings.EMBEDDING_MODEL_NAME,
        "llm_model": settings.OPENROUTER_MODEL
    }

@app.get("/api/status")
def get_system_status():
    """
    Retorna o status do Supabase e das variáveis de ambiente.
    Utilizado pela Tela 2 para validação prévia da base.
    """
    db_status = supabase_service.check_database_status()
    return {
        "database": db_status,
        "openrouter_configured": bool(settings.OPENROUTER_API_KEY and "sua-chave" not in settings.OPENROUTER_API_KEY),
        "embedding_model": settings.EMBEDDING_MODEL_NAME,
        "ready_for_rag": db_status.get("has_chunks", False)
    }

def process_file_pipeline(file_path: Path) -> Dict[str, Any]:
    """
    Executa as 4 etapas de ingestão para um único arquivo com isolamento de falhas.
    """
    filename = file_path.name
    stage_logs = []

    # Etapa A: Extração OCR & Leitura
    stage_logs.append("Etapa A: Extração OCR & Leitura iniciada")
    extracted = DocumentExtractor.extract_from_path(file_path)
    if not extracted["success"]:
        return {
            "success": False,
            "filename": filename,
            "stage_failed": "Etapa A",
            "error": extracted.get("error", "Falha na extração de texto"),
            "stage_logs": stage_logs
        }
    stage_logs.append(f"Etapa A concluída: {len(extracted['raw_text'])} caracteres extraídos")

    # Etapa B: Pré-Estruturação Relacional
    stage_logs.append("Etapa B: Pré-Estruturação e Povoamento de Campos")
    doc_meta = {
        "nome_arquivo": filename,
        "categoria": extracted["category"],
        "total_campos": extracted["total_campos"],
        "campos_preenchidos": extracted["campos_preenchidos"],
        "campos_nulos": extracted["campos_nulos"],
        "percentual_sucesso": extracted["percentual_sucesso"],
        "status": "PROCESSADO"
    }
    stage_logs.append(f"Etapa B concluída: Categoria '{extracted['category']}' com {extracted['percentual_sucesso']}% de sucesso")

    # Etapa C: Gerador de Chunks & Embeddings
    stage_logs.append("Etapa C: Geração de Chunks & Embeddings (SentenceTransformers)")
    # Se o Supabase estiver configurado, criamos registro na tabela documentos para obter o ID
    doc_id = "00000000-0000-0000-0000-000000000000"
    if supabase_service.is_configured():
        try:
            inserted_id = supabase_service.insert_document(doc_meta)
            if inserted_id:
                doc_id = inserted_id
        except Exception as exc:
            return {
                "success": False,
                "filename": filename,
                "stage_failed": "Etapa B/Persistência Relacional",
                "error": f"Falha ao registrar documento no Supabase: {str(exc)}",
                "stage_logs": stage_logs
            }

    chunks_data = chunker.create_chunks_with_metadata(
        document_id=doc_id,
        filename=filename,
        category=extracted["category"],
        text=extracted["raw_text"]
    )

    if not chunks_data:
        return {
            "success": False,
            "filename": filename,
            "stage_failed": "Etapa C",
            "error": "Nenhum chunk gerado a partir do conteúdo",
            "stage_logs": stage_logs
        }

    # Gera os vetores para todos os chunks
    chunk_texts = [c["texto"] for c in chunks_data]
    vectors = embedding_service.encode_batch(chunk_texts)
    for c, v in zip(chunks_data, vectors):
        c["vetor"] = v
    stage_logs.append(f"Etapa C concluída: {len(chunks_data)} chunks vetorizados (384 dims)")

    # Etapa D: Persistência Remota no Supabase (PGVector)
    stage_logs.append("Etapa D: Persistência no Supabase (PGVector)")
    persisted_count = 0
    if supabase_service.is_configured():
        try:
            persisted_count = supabase_service.insert_chunks(chunks_data)
            stage_logs.append(f"Etapa D concluída: {persisted_count} chunks salvos no banco")
        except Exception as exc:
            return {
                "success": False,
                "filename": filename,
                "stage_failed": "Etapa D",
                "error": f"Falha ao persistir chunks no Supabase: {str(exc)}",
                "stage_logs": stage_logs
            }
    else:
        stage_logs.append("Etapa D: Supabase não configurado. Modo simulação local ativado.")

    return {
        "success": True,
        "filename": filename,
        "document_id": doc_id,
        "categoria": extracted["category"],
        "total_campos": extracted["total_campos"],
        "campos_preenchidos": extracted["campos_preenchidos"],
        "campos_nulos": extracted["campos_nulos"],
        "percentual_sucesso": extracted["percentual_sucesso"],
        "chunks_gerados": len(chunks_data),
        "stage_logs": stage_logs
    }

def aggregate_pipeline_results(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_files = len(results)
    success_files = [r for r in results if r["success"]]
    failed_files = [r for r in results if not r["success"]]

    total_campos = sum(r.get("total_campos", 0) for r in success_files)
    campos_preenchidos = sum(r.get("campos_preenchidos", 0) for r in success_files)
    campos_nulos = sum(r.get("campos_nulos", 0) for r in success_files)
    total_chunks = sum(r.get("chunks_gerados", 0) for r in success_files)

    global_success_rate = round((campos_preenchidos / total_campos * 100.0), 2) if total_campos > 0 else 0.0

    return {
        "total_arquivos": total_files,
        "arquivos_sucesso": len(success_files),
        "arquivos_falha": len(failed_files),
        "total_campos": total_campos,
        "campos_preenchidos": campos_preenchidos,
        "campos_nulos": campos_nulos,
        "percentual_global_sucesso": global_success_rate,
        "total_chunks_gerados": total_chunks,
        "detalhes": results
    }

@app.post("/api/ingestion/process-folder")
def process_folder(request: FolderIngestionRequest):
    folder_str = request.folder_path.strip()
    # Se o caminho for vazio, default é 'dados_locais'
    if not folder_str or folder_str in [".", "./"]:
        folder_str = "dados_locais"

    base_dir = Path(__file__).resolve().parent.parent

    # Se contiver barras invertidas do Windows ou letra de unidade (ex: d:\workspace...\dados_locais),
    # ou se for relativo a 'dados_locais', redireciona para a pasta do repositório
    if "\\" in folder_str or ":" in folder_str or "dados_locais" in folder_str.lower():
        target = (base_dir / "dados_locais").resolve()
        if target.exists() and target.is_dir():
            folder_path = target
        else:
            folder_path = Path(folder_str)
    elif not Path(folder_str).is_absolute():
        folder_path = (base_dir / folder_str).resolve()
    else:
        folder_path = Path(folder_str)

    # Fallback garantido para a pasta dados_locais do repositório
    if not folder_path.exists() or not folder_path.is_dir():
        fallback_path = (base_dir / "dados_locais").resolve()
        if fallback_path.exists() and fallback_path.is_dir():
            folder_path = fallback_path
        else:
            raise HTTPException(status_code=400, detail=f"Diretório não encontrado: {request.folder_path}")

    supported_extensions = {".pdf", ".txt", ".sql", ".json"}
    files = [p for p in folder_path.iterdir() if p.is_file() and p.suffix.lower() in supported_extensions]

    if not files:
        raise HTTPException(status_code=400, detail=f"Nenhum arquivo suportado (.pdf, .txt, .sql, .json) encontrado em: {request.folder_path}")

    results = []
    for f in files:
        # Isolamento de erro por arquivo
        res = process_file_pipeline(f)
        results.append(res)

    return aggregate_pipeline_results(results)

@app.post("/api/ingestion/upload-files")
async def upload_and_process_files(files: List[UploadFile] = File(...)):
    """
    Permite envio de arquivos diretamente pela interface web.
    """
    if not files:
        raise HTTPException(status_code=400, detail="Nenhum arquivo enviado.")

    results = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for uploaded in files:
            temp_path = Path(tmpdir) / uploaded.filename
            with open(temp_path, "wb") as buffer:
                shutil.copyfileobj(uploaded.file, buffer)
            
            res = process_file_pipeline(temp_path)
            results.append(res)

    return aggregate_pipeline_results(results)

@app.post("/api/rag/query")
async def rag_query(request: QueryRequest):
    """
    Pipeline RAG:
    1. Vetorização da pergunta (SentenceTransformers)
    2. Busca vetorial no PGVector (TOP_K = 3)
    3. Construção do Prompt Aumentado
    4. Inferência via OpenRouter (openrouter/auto, temperature = 0)
    """
    import time
    query_text = request.query.strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="A pergunta não pode ser vazia.")

    top_k = request.top_k or settings.TOP_K
    threshold = request.threshold or 0.0

    # 1. Vetorização da pergunta (Embedding)
    t0 = time.time()
    query_vector = embedding_service.encode_text(query_text)
    t_emb = round((time.time() - t0) * 1000, 1)

    # 2. Busca Vetorial no Supabase (Retrieval)
    candidates = []
    t1 = time.time()
    if supabase_service.is_configured():
        try:
            candidates = supabase_service.search_similar_chunks(
                query_vector=query_vector,
                top_k=top_k,
                threshold=threshold
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Erro na busca vetorial no Supabase: {str(exc)}")
    else:
        return {
            "answer": "O Supabase não está configurado no arquivo .env. Configure suas credenciais para realizar buscas vetoriais reais.",
            "candidates": [],
            "model_used": "none",
            "is_fallback": True,
            "query": query_text,
            "pipeline_trace": None
        }
    t_ret = round((time.time() - t1) * 1000, 1)

    # 3 & 4. Prompt Aumentado e inferência OpenRouter (LLM)
    t2 = time.time()
    llm_result = await llm_service.generate_answer(query_text, candidates)
    t_llm = round((time.time() - t2) * 1000, 1)

    highest_score = round(max([float(c.get("similarity", 0.0)) for c in candidates]), 2) if candidates else 0.0

    pipeline_trace = {
        "embedding": {
            "status": "success",
            "model": settings.EMBEDDING_MODEL_NAME.split("/")[-1],
            "dimensions": len(query_vector),
            "time_ms": t_emb
        },
        "retrieval": {
            "status": "success",
            "top_k": top_k,
            "candidates_found": len(candidates),
            "highest_score": highest_score,
            "time_ms": t_ret
        },
        "prompt_augmented": {
            "status": "success",
            "evidence_count": len(candidates),
            "has_context": len(candidates) > 0
        },
        "llm": {
            "status": "success",
            "model_used": llm_result["model_used"],
            "temperature": settings.LLM_TEMPERATURE,
            "is_fallback": llm_result["is_fallback"],
            "time_ms": t_llm
        }
    }

    # Se a LLM indicar fallback ou ausência de dados na base,
    # limpamos a lista de candidatos para que nenhuma evidência seja retornada/exibida
    is_fallback = bool(
        llm_result.get("is_fallback") or
        "não há dados disponíveis para a requisição na base" in llm_result["answer"].lower()
    )

    return {
        "query": query_text,
        "answer": llm_result["answer"],
        "model_used": llm_result["model_used"],
        "is_fallback": is_fallback,
        "candidates": [] if is_fallback else candidates,
        "pipeline_trace": pipeline_trace
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.BACKEND_HOST, port=settings.BACKEND_PORT)
