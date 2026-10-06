import logging
from typing import List, Dict, Any, Optional
from supabase import create_client, Client
from backend.config import settings

logger = logging.getLogger(__name__)

class SupabaseService:
    def __init__(self):
        self._client: Optional[Client] = None

    @property
    def client(self) -> Client:
        if self._client is None:
            if not settings.SUPABASE_URL or not settings.SUPABASE_KEY or "seu-projeto" in settings.SUPABASE_URL:
                raise ValueError("SUPABASE_URL ou SUPABASE_KEY não configuradas no arquivo .env.")
            self._client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return self._client

    def is_configured(self) -> bool:
        return bool(settings.SUPABASE_URL and settings.SUPABASE_KEY and "seu-projeto" not in settings.SUPABASE_URL)

    def check_database_status(self) -> Dict[str, Any]:
        """
        Verifica se a conexão funciona e se há chunks gravados.
        """
        if not self.is_configured():
            return {
                "configured": False,
                "has_chunks": False,
                "total_chunks": 0,
                "message": "Supabase não configurado no .env"
            }
        
        try:
            res = self.client.table("documento_chunks").select("id", count="exact").limit(1).execute()
            count = res.count if res.count is not None else 0
            return {
                "configured": True,
                "has_chunks": count > 0,
                "total_chunks": count,
                "message": "Conectado ao Supabase com sucesso"
            }
        except Exception as exc:
            logger.error(f"Erro ao verificar status do Supabase: {exc}")
            return {
                "configured": True,
                "has_chunks": False,
                "total_chunks": 0,
                "error": str(exc),
                "message": f"Erro de comunicação com Supabase: {str(exc)}"
            }

    def insert_document(self, doc_data: Dict[str, Any]) -> Optional[str]:
        """
        Insere o documento na tabela relacional 'documentos' e retorna o ID.
        """
        res = self.client.table("documentos").insert({
            "nome_arquivo": doc_data["nome_arquivo"],
            "categoria": doc_data.get("categoria", "geral"),
            "total_campos": doc_data.get("total_campos", 0),
            "campos_preenchidos": doc_data.get("campos_preenchidos", 0),
            "campos_nulos": doc_data.get("campos_nulos", 0),
            "percentual_sucesso": doc_data.get("percentual_sucesso", 0.0),
            "status": doc_data.get("status", "PROCESSADO")
        }).execute()
        
        if res.data and len(res.data) > 0:
            return res.data[0]["id"]
        return None

    def insert_chunks(self, chunks: List[Dict[str, Any]]) -> int:
        """
        Insere os chunks com vetores na tabela 'documento_chunks'.
        """
        if not chunks:
            return 0
        
        # Inserção em lotes de até 50 para resiliência
        batch_size = 50
        inserted_count = 0
        
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            payload = [
                {
                    "documento_id": c["documento_id"],
                    "texto": c["texto"],
                    "vetor": c["vetor"],
                    "metadados": c.get("metadados", {})
                }
                for c in batch
            ]
            res = self.client.table("documento_chunks").insert(payload).execute()
            if res.data:
                inserted_count += len(res.data)
                
        return inserted_count

    def search_similar_chunks(
        self,
        query_vector: List[float],
        top_k: int = 5,
        threshold: float = 0.0
    ) -> List[Dict[str, Any]]:
        """
        Chama a RPC 'match_documento_chunks' no Supabase para busca por similaridade cosseno
        e executa expansão de contexto (Sibling Chunks) para garantir integridade do documento.
        """
        try:
            params = {
                "query_embedding": query_vector,
                "match_threshold": threshold,
                "match_count": max(top_k, 5)
            }
            res = self.client.rpc("match_documento_chunks", params).execute()
            candidates = res.data or []

            # Expansão contextual inteligente (Sibling Retrieval):
            # Se o documento mais relevante tiver trechos complementares (ex: cabeçalho + tabela de valores),
            # trazemos os chunks irmãos do mesmo documento para não fragmentar faturas ou contratos.
            if candidates:
                top_doc_id = candidates[0].get("documento_id")
                candidate_ids = {c["id"] for c in candidates}
                if top_doc_id:
                    siblings = (
                        self.client.table("documento_chunks")
                        .select("id, documento_id, texto, metadados")
                        .eq("documento_id", top_doc_id)
                        .execute()
                    )
                    if siblings.data:
                        for sib in siblings.data:
                            if sib["id"] not in candidate_ids:
                                sib["similarity"] = float(candidates[0].get("similarity", 0.5)) * 0.98
                                candidates.append(sib)

            return candidates
        except Exception as exc:
            logger.error(f"Erro na busca vetorial RPC: {exc}")
            raise exc

supabase_service = SupabaseService()
