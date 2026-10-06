from datetime import datetime, timezone
from typing import List, Dict, Any

class CoherentChunker:
    def __init__(self, min_chars: int = 200, max_chars: int = 800, overlap_chars: int = 80):
        self.min_chars = min_chars
        self.max_chars = max_chars
        self.overlap_chars = overlap_chars

    def split_text(self, text: str) -> List[str]:
        """
        Divide o texto em blocos coerentes priorizando quebras de parágrafo e sentenças.
        Mantém o tamanho entre 200 e 800 caracteres.
        """
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks = []
        current_chunk = ""

        for para in paragraphs:
            # Se o parágrafo for maior que max_chars, fatiamos por frases
            if len(para) > self.max_chars:
                sentences = [s.strip() + "." for s in para.replace(".\n", ". ").split(". ") if s.strip()]
                for sent in sentences:
                    if len(current_chunk) + len(sent) + 1 <= self.max_chars:
                        current_chunk = f"{current_chunk} {sent}".strip()
                    else:
                        if len(current_chunk) >= self.min_chars:
                            chunks.append(current_chunk)
                            current_chunk = sent
                        else:
                            # Se for menor que min_chars, força acumular se viável ou fecha chunk
                            chunks.append(current_chunk)
                            current_chunk = sent
            else:
                if len(current_chunk) + len(para) + 2 <= self.max_chars:
                    current_chunk = f"{current_chunk}\n\n{para}".strip()
                else:
                    if current_chunk:
                        chunks.append(current_chunk)
                    current_chunk = para

        if current_chunk:
            chunks.append(current_chunk)

        # Caso algum chunk tenha ficado minúsculo, mescla com o anterior se possível
        refined_chunks = []
        for c in chunks:
            c = c.strip()
            if not c:
                continue
            if refined_chunks and len(c) < self.min_chars and (len(refined_chunks[-1]) + len(c) + 2 <= self.max_chars):
                refined_chunks[-1] = f"{refined_chunks[-1]}\n\n{c}"
            else:
                refined_chunks.append(c)

        return refined_chunks

    def create_chunks_with_metadata(
        self,
        document_id: str,
        filename: str,
        category: str,
        text: str
    ) -> List[Dict[str, Any]]:
        text_chunks = self.split_text(text)
        result = []
        now_iso = datetime.now(timezone.utc).isoformat()

        for idx, chunk_text in enumerate(text_chunks):
            # Estimativa de tokens: ~1 token a cada 4 caracteres para texto ocidental
            approx_tokens = max(1, len(chunk_text) // 4)
            size_bytes = len(chunk_text.encode("utf-8"))

            metadata = {
                "chunk_index": idx,
                "origem": filename,
                "categoria": category,
                "tokens": approx_tokens,
                "tamanho_bytes": size_bytes,
                "data_criacao": now_iso
            }

            result.append({
                "documento_id": document_id,
                "texto": chunk_text,
                "metadados": metadata
            })

        return result
