import logging
from typing import List
from backend.config import settings

logger = logging.getLogger(__name__)

class EmbeddingService:
    _instance = None
    _fastembed_model = None
    _st_model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingService, cls).__new__(cls)
        return cls._instance

    def _get_fastembed(self):
        if self._fastembed_model is None:
            try:
                from fastembed import TextEmbedding
                logger.info(f"Carregando FastEmbed ONNX (~50MB RAM): {settings.EMBEDDING_MODEL_NAME}")
                self._fastembed_model = TextEmbedding(model_name=settings.EMBEDDING_MODEL_NAME)
            except Exception as e:
                logger.warning(f"FastEmbed indisponível ({e}).")
        return self._fastembed_model

    def _get_st_model(self):
        if self._st_model is None:
            try:
                from sentence_transformers import SentenceTransformer
                logger.info(f"Carregando SentenceTransformer: {settings.EMBEDDING_MODEL_NAME}")
                self._st_model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
            except Exception as e:
                logger.error(f"Falha ao carregar SentenceTransformers: {e}")
                raise e
        return self._st_model

    def encode_text(self, text: str) -> List[float]:
        fe = self._get_fastembed()
        if fe is not None:
            vectors = list(fe.embed([text]))
            return [float(x) for x in vectors[0]]
        st = self._get_st_model()
        vector = st.encode(text, normalize_embeddings=True)
        return vector.tolist()

    def encode_batch(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        fe = self._get_fastembed()
        if fe is not None:
            vectors = list(fe.embed(texts))
            return [[float(x) for x in v] for v in vectors]
        st = self._get_st_model()
        vectors = st.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return [v.tolist() for v in vectors]

embedding_service = EmbeddingService()

