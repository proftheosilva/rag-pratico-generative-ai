import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from pypdf import PdfReader

def infer_category(filename: str, text: str) -> str:
    lower_name = filename.lower()
    lower_text = text.lower()[:1500]

    if "fatura" in lower_name or "invoice" in lower_name or "nf" in lower_name or "nota fiscal" in lower_text or "fatura" in lower_text:
        return "fatura"
    elif "contrato" in lower_name or "termo" in lower_name or "acordo" in lower_name or "contrato" in lower_text:
        return "contrato"
    elif "regulamento" in lower_name or "diretriz" in lower_name or "norma" in lower_name or "manual" in lower_name or "regulamento" in lower_text:
        return "regulamento"
    elif filename.endswith(".sql"):
        return "codigo_sql"
    elif filename.endswith(".json"):
        return "dados_json"
    return "documento_geral"

def analyze_document_fields(filename: str, text: str, category: str) -> Dict[str, Any]:
    """
    Simula e avalia o preenchimento de campos essenciais da pré-estrutura
    conforme a categoria do documento.
    """
    fields: Dict[str, Optional[str]] = {}

    if category == "fatura":
        fields["numero_documento"] = re.search(r"(?:fatura|nf|número|no\.?)\s*[:#]?\s*([A-Za-z0-9\-]+)", text, re.IGNORECASE)
        fields["data_emissao"] = re.search(r"(?:data|emissão|emissao)\s*[:]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", text, re.IGNORECASE)
        fields["valor_total"] = re.search(r"(?:total|valor|r\$)\s*[:]?\s*([0-9.,]+)", text, re.IGNORECASE)
        fields["cliente_ou_destinatario"] = re.search(r"(?:cliente|destinatário|pagador)\s*[:]?\s*([A-Za-z\s]+)", text, re.IGNORECASE)
        fields["vencimento"] = re.search(r"(?:vencimento|vence)\s*[:]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", text, re.IGNORECASE)
    elif category == "contrato":
        fields["partes_envolvidas"] = re.search(r"(?:partes|contratante|entre)\s*[:]?\s*([A-Za-z\s,]+)", text, re.IGNORECASE)
        fields["objeto_contrato"] = re.search(r"(?:objeto|finalidade)\s*[:]?\s*([^\n\r.]+)", text, re.IGNORECASE)
        fields["vigencia"] = re.search(r"(?:prazo|vigência|validade)\s*[:]?\s*([^\n\r.]+)", text, re.IGNORECASE)
        fields["valor_ou_remuneracao"] = re.search(r"(?:remuneração|preço|valor)\s*[:]?\s*([0-9.,R$\s]+)", text, re.IGNORECASE)
        fields["foro"] = re.search(r"(?:foro|comarca)\s*[:]?\s*([^\n\r.]+)", text, re.IGNORECASE)
    elif category == "codigo_sql":
        fields["tabelas"] = re.findall(r"(?:from|join|table)\s+([a-zA-Z0-9_]+)", text, re.IGNORECASE)
        fields["operacoes"] = re.findall(r"(select|insert|update|delete|create|alter)", text, re.IGNORECASE)
    elif category == "dados_json":
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                for k, v in list(data.items())[:6]:
                    fields[k] = str(v) if v is not None else None
            elif isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                for k, v in list(data[0].items())[:6]:
                    fields[k] = str(v) if v is not None else None
        except Exception:
            fields["json_valido"] = None
    else:
        # Documento Geral
        fields["titulo"] = re.search(r"^([^\n\r]+)", text.strip())
        fields["autor_ou_origem"] = re.search(r"(?:autor|elaborado por|origem)\s*[:]?\s*([^\n\r]+)", text, re.IGNORECASE)
        fields["data"] = re.search(r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", text)
        fields["resumo_identificado"] = "Sim" if len(text.strip()) > 100 else None

    # Mapear valores encontrados
    cleaned_fields = {}
    for k, v in fields.items():
        if v is None:
            cleaned_fields[k] = None
        elif hasattr(v, "group"):
            match_str = v.group(1).strip()
            cleaned_fields[k] = match_str if match_str else None
        elif isinstance(v, list):
            cleaned_fields[k] = ", ".join(set(v)) if v else None
        else:
            s_val = str(v).strip()
            cleaned_fields[k] = s_val if s_val else None

    total_campos = len(cleaned_fields)
    preenchidos = sum(1 for v in cleaned_fields.values() if v is not None)
    nulos = total_campos - preenchidos
    percentual = round((preenchidos / total_campos * 100.0), 2) if total_campos > 0 else 0.0

    return {
        "campos": cleaned_fields,
        "total_campos": total_campos,
        "campos_preenchidos": preenchidos,
        "campos_nulos": nulos,
        "percentual_sucesso": percentual
    }

class DocumentExtractor:
    @staticmethod
    def extract_from_path(file_path: Path) -> Dict[str, Any]:
        """
        Extrai o texto bruto e estatísticas do arquivo, com tratamento isolado de erro.
        """
        filename = file_path.name
        suffix = file_path.suffix.lower()
        
        try:
            raw_text = ""
            if suffix == ".pdf":
                reader = PdfReader(str(file_path))
                pages_text = []
                for i, page in enumerate(reader.pages):
                    t = page.extract_text()
                    if t:
                        pages_text.append(t)
                raw_text = "\n\n".join(pages_text).strip()
            elif suffix in [".txt", ".sql"]:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    raw_text = f.read().strip()
            elif suffix == ".json":
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    data = json.load(f)
                    raw_text = json.dumps(data, indent=2, ensure_ascii=False)
            else:
                # Tentativa de leitura textual genérica
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    raw_text = f.read().strip()

            if not raw_text:
                return {
                    "success": False,
                    "filename": filename,
                    "error": "Arquivo vazio ou texto ilegível.",
                    "status": "ERRO_OCR"
                }

            category = infer_category(filename, raw_text)
            structure = analyze_document_fields(filename, raw_text, category)

            return {
                "success": True,
                "filename": filename,
                "category": category,
                "raw_text": raw_text,
                "total_campos": structure["total_campos"],
                "campos_preenchidos": structure["campos_preenchidos"],
                "campos_nulos": structure["campos_nulos"],
                "percentual_sucesso": structure["percentual_sucesso"],
                "campos": structure["campos"],
                "status": "PROCESSADO"
            }

        except Exception as exc:
            return {
                "success": False,
                "filename": filename,
                "error": str(exc),
                "status": "ERRO_OCR"
            }
