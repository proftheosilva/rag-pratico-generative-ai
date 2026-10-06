# Projeto RAG Prático: Next.js + PGVector + OpenRouter

Aplicação completa de Recuperação Aumentada por Geração (RAG) desenvolvida conforme a especificação do documento [instrucao.md](instrucao.md).

---

## 🏗️ Arquitetura do Sistema

- **Frontend**: Next.js 14+ (App Router, TypeScript, Vanilla CSS de alta fidelidade com tema escuro e glassmorphism).
- **Backend**: Python 3.12 (FastAPI, Uvicorn) isolado em ambiente virtual `venv`.
- **Extração & OCR**: Suporte a arquivos `.pdf`, `.txt`, `.sql` e `.json` com isolamento de falhas por arquivo.
- **Chunking Semântico**: Blocos coerentes de 200 a 800 caracteres com metadados detalhados.
- **Embeddings**: `SentenceTransformers` com o modelo `sentence-transformers/all-MiniLM-L6-v2` (384 dimensões).
- **Banco de Dados**: Supabase PostgreSQL com extensão `pgvector`, índice HNSW e função RPC de busca por similaridade de cosseno.
- **LLM Gateway**: OpenRouter (`openrouter/auto`) com `temperature = 0` e fallback automático: *"Não há dados disponíveis para a requisição na base."*

---

## 📁 Estrutura de Arquivos

```
RAG/
├── backend/                       # Backend em Python
│   ├── main.py                    # Servidor FastAPI e endpoints da API
│   ├── config.py                  # Leitura de variáveis do .env
│   ├── extractor.py               # Leitura heterogênea e métricas de preenchimento
│   ├── chunker.py                 # Fatiador coerente de 200 a 800 caracteres
│   ├── embedding_service.py       # SentenceTransformers (384 dimensões)
│   ├── supabase_service.py        # Integração PGVector e função RPC
│   └── llm_service.py             # Prompt aumentado e inferência OpenRouter
├── dados_locais/                  # Arquivos de teste para ingestão
│   ├── contrato_prestacao_servicos.txt
│   ├── fatura_servicos_tecnologia.txt
│   └── regulamento_academico.txt
├── frontend/                      # Aplicação Next.js
│   ├── src/app/
│   │   ├── page.tsx               # Interface com Tela 1 (Ingestão) e Tela 2 (Chatbot)
│   │   ├── globals.css            # Design System moderno
│   │   └── layout.tsx
├── venv/                          # Ambiente virtual Python isolado
├── .env                           # Credenciais e parâmetros de execução
├── .env.example                   # Modelo das variáveis de ambiente
├── schema.sql                     # Script SQL para o Supabase (PGVector)
├── requirements.txt               # Dependências Python
├── run_backend.bat                # Inicializador do backend
└── run_frontend.bat               # Inicializador do frontend
```

---

## 🚀 Como Executar o Projeto

### 1. Configurar o Supabase
1. Acesse o seu painel no [Supabase](https://supabase.com).
2. Abra o **SQL Editor** e execute o conteúdo do arquivo [`schema.sql`](schema.sql).
3. No seu Dashboard, copie a URL do projeto e a Service Role Key (ou Anon Key).

### 2. Configurar o arquivo `.env`
Abra o arquivo [`.env`](.env) e preencha suas chaves:
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-chave-supabase
OPENROUTER_API_KEY=sk-or-v1-sua-chave-openrouter
```

### 3. Iniciar o Backend
Execute o script batch ou ative a venv manualmente:
```bash
run_backend.bat
```
Ou no terminal:
```bash
.\venv\Scripts\activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
A API estará rodando em: `http://127.0.0.1:8000` (documentação Swagger em `http://127.0.0.1:8000/docs`).

### 4. Iniciar o Frontend
Execute o script batch:
```bash
run_frontend.bat
```
Ou no terminal:
```bash
cd frontend
npm run dev
```
Acesse a aplicação no navegador em: `http://localhost:3000`.

---

## 🧪 Telas e Funcionalidades

### Tela 1: Ingestão de Dados
1. O diretório padrão já vem preenchido com a pasta `dados_locais`.
2. Clique no botão **"PROCESSAR INGESTÃO"**.
3. Acompanhe a **Linha do Tempo de 4 Fases**:
   - *Etapa A*: Extração OCR & Leitura de Arquivos.
   - *Etapa B*: Pré-Estruturação Relacional e Povoamento de Campos.
   - *Etapa C*: Gerador de Chunks & Embeddings (`SentenceTransformers`).
   - *Etapa D*: Persistência Remota no Supabase (`PGVector`).
4. Visualize o painel com total de arquivos, taxa de preenchimento, contagem de campos nulos e tabela detalhada.

### Tela 2: Pergunta / RAG Chatbot
1. **Validação Prévia**: Se a base estiver sem chunks, a interface bloqueia e exibe o aviso *"Prepare antes a BASE na tela de Ingestão."*.
2. **Consultas com Evidências**: Utilize as sugestões rápidas ou digite perguntas sobre o contrato, fatura ou regulamento.
3. **Painel de Evidências (TOP_K = 3)**: Exibe os 3 trechos recuperados pelo PGVector com seus scores de similaridade cosseno (ex: `0.89`).
4. **Fallback Estrito**: Perguntas sem correlação na base (ex: *"Qual é a fórmula da teoria da relatividade?"*) recebem a resposta protegida: *"Não há dados disponíveis para a requisição na base."*.
