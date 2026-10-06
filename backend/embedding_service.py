import logging
from typing import List
from sentence_transformers import SentenceTransformer
from backend.config import settings

logger = logging.getLogger(__name__)

class EmbeddingService:
    _instance = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingService, cls).__new__(cls)
        return cls._instance

    def get_model(self) -> SentenceTransformer:
        if self._model is None:
            logger.info(f"Carregando modelo de embeddings: {settings.EMBEDDING_MODEL_NAME}")
            # Carrega o modelo (all-MiniLM-L6-v2 produz vetores com dimensão 384)
            self._model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
        return self._model

    def encode_text(self, text: str) -> List[float]:
        model = self.get_model()
        vector = model.encode(text, normalize_embeddings=True)
        return vector.tolist()

    def encode_batch(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        model = self.get_model()
        vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return [v.tolist() for v in vectors]

embedding_service = EmbeddingService()
