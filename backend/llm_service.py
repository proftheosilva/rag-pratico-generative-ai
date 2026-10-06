import logging
from typing import List, Dict, Any
import httpx
from backend.config import settings

logger = logging.getLogger(__name__)

FALLBACK_MESSAGE = "Não há dados disponíveis para a requisição na base."

class LLMService:
    @staticmethod
    def build_prompt(query: str, candidates: List[Dict[str, Any]]) -> str:
        """
        Monta o prompt aumentado estrito conforme especificação do roteiro.
        """
        evidence_lines = []
        for idx, item in enumerate(candidates, 1):
            short_id = str(item.get("id", f"CH-{idx:02d}"))[:8]
            score = round(float(item.get("similarity", 0.0)), 2)
            texto = item.get("texto", "").strip().replace("\n", " ")
            evidence_lines.append(f'- Trecho [ID: {short_id} | Score: {score}]: "{texto}"')

        evidences_block = "\n".join(evidence_lines)

        prompt = f"""[INSTRUÇÃO SISTÊMICA]
Você é um assistente especialista baseado estritamente em evidências documentais.
Sua missão é analisar minuciosamente os trechos recuperados das faturas, contratos e relatórios para responder à pergunta do usuário com máxima precisão.

DIRETRIZES DE RESPOSTA:
1. Responda de forma CATEGÓRICA, DIRETA e BEM FORMATADA (utilize negrito para destacar valores, números de documento, empresas e datas).
2. Se a pergunta solicitar um valor total, fatura ou dado financeiro de uma empresa/serviço, localize o valor correspondente nos trechos (ex: **TOTAL A PAGAR**, **Subtotal**, **Valor Total**, etc.) e informe de forma clara e objetiva.
3. Se os trechos apresentarem detalhes complementares relevantes da fatura/documento (como Número da Fatura, Vencimento, Itens ou Status), inclua-os de forma organizada e limpa.
4. Somente se os trechos recuperados NÃO contiverem dados ou relação com o assunto/empresa questionada, responda exatamente:
"{FALLBACK_MESSAGE}"

[EVIDÊNCIAS RECUPERADAS (TOP_K = {len(candidates)})]
{evidences_block}

[PERGUNTA DO USUÁRIO]
Pergunta: {query}"""
        return prompt

    async def generate_answer(self, query: str, candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Envia o prompt aumentado para o OpenRouter com modelo dinâmico e temperatura zero.
        """
        # Se não houver candidatos retornados pela busca semântica
        if not candidates:
            return {
                "answer": FALLBACK_MESSAGE,
                "model_used": "fallback-local",
                "evidence_count": 0,
                "is_fallback": True
            }

        # Verifica chave do OpenRouter
        if not settings.OPENROUTER_API_KEY or "sua-chave" in settings.OPENROUTER_API_KEY:
            return {
                "answer": f"[AVISO: OPENROUTER_API_KEY não configurada no arquivo .env]\n\nEvidências recuperadas com sucesso:\n" + 
                          "\n".join([f"- Score {round(c.get('similarity', 0), 2)}: {c.get('texto', '')[:120]}..." for c in candidates]),
                "model_used": "unconfigured-api-key",
                "evidence_count": len(candidates),
                "is_fallback": False
            }

        prompt = self.build_prompt(query, candidates)

        headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "RAG Nextjs PGVector Local App"
        }

        payload = {
            "model": settings.OPENROUTER_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": settings.LLM_TEMPERATURE
        }

        url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"

        # verify=False garante funcionamento mesmo sob proxy corporativo ou inspeção de certificados SSL
        async with httpx.AsyncClient(timeout=45.0, verify=False) as client:
            try:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                model_used = data.get("model", settings.OPENROUTER_MODEL)

                return {
                    "answer": content if content else FALLBACK_MESSAGE,
                    "model_used": model_used,
                    "evidence_count": len(candidates),
                    "is_fallback": content == FALLBACK_MESSAGE
                }
            except httpx.HTTPStatusError as exc:
                logger.error(f"Erro HTTP OpenRouter: {exc.response.status_code} - {exc.response.text}")
                return {
                    "answer": f"Erro de comunicação com OpenRouter: {exc.response.status_code} ({exc.response.text})",
                    "model_used": settings.OPENROUTER_MODEL,
                    "evidence_count": len(candidates),
                    "is_fallback": False,
                    "error": str(exc)
                }
            except Exception as exc:
                logger.error(f"Erro na requisição OpenRouter: {exc}")
                return {
                    "answer": f"Erro ao contatar modelo de IA: {str(exc)}",
                    "model_used": settings.OPENROUTER_MODEL,
                    "evidence_count": len(candidates),
                    "is_fallback": False,
                    "error": str(exc)
                }

llm_service = LLMService()
