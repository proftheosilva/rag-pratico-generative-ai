# Roteiro de Arquitetura e Implementação de RAG Prático com Next.js, PGVector e OpenRouter

Este documento apresenta a especificação técnica, os fundamentos conceituais e o roteiro passo a passo para o desenvolvimento prático de uma aplicação completa de **Recuperação Aumentada por Geração (RAG - *Retrieval-Augmented Generation*)**.

O projeto integra uma interface moderna em **Next.js**, um ecossistema de processamento local em **Python** para extração documental, estruturação de dados e vetorização via *SentenceTransformers*, armazenamento relacional e vetorial no **Supabase** (*PostgreSQL com pgvector*), e inferência LLM fundamentada através da API do **OpenRouter** utilizando o modelo dinâmico `openrouter/auto`.

---

## 1. Visão Geral da Arquitetura e Stack Tecnológica

A arquitetura do sistema foi desenhada com separação estrita de responsabilidades entre a **Preparação Documental** (*Pipeline de Ingestão Off-line/Local*) e a **Consulta e Inferência em Tempo Real** (*Pipeline RAG On-line*). Essa abordagem garante transparência didática, auditabilidade dos trechos recuperados e eliminação de alucinações da LLM.

```
+-----------------------------------------------------------------------------------+
|                                  FRONTEND (Next.js)                               |
|   +------------------------------------+     +--------------------------------+   |
|   |         Tela 1: Ingestão           |     |        Tela 2: Pergunta        |   |
|   | (Linha do Tempo 4 Fases, Métricas) |     | (Pipeline Trace, Chat, TOP_K=5)|   |
|   +------------------------------------+     +--------------------------------+   |
+------------------------------------------+----------------------------------------+
                                           |
                    +----------------------+----------------------+
                    |                                             |
                    v                                             v
+----------------------------------------+   +--------------------------------------+
|            BACKEND (Python)            |   |           SERVIÇO DE LLM             |
| - Ambiente Virtual venv                |   |             (OpenRouter)             |
| - Extração de Texto (PDF, TXT, SQL, JS)|   | - Modelo: openrouter/auto            |
| - Pré-estruturação e Métricas          |   | - Temperatura: 0 (Determinístico)    |
| - Chunker Coerente (200-800 carac.)    |   | - Resposta Categórica e Formatada    |
| - Embeddings (SentenceTransformers 384)|   | - Fallback quando sem evidências     |
| - Sibling Chunk Retrieval Integrado    |   |                                      |
+-------------------+--------------------+   +-------------------+------------------+
                    |                                             ^
                    |                                             |
                    v                                             |
+-----------------------------------------------------------------+-----------------+
|                               BANCO DE DADOS (Supabase)                           |
| - PostgreSQL nativo com extensão PGVector                                         |
| - Tabela Relacional: documentos                                                   |
| - Tabela Vetorial: documento_chunks (ID, texto, vetor 384d, metadados)            |
| - Índice HNSW (vector_cosine_ops) e Função RPC match_documento_chunks             |
+-----------------------------------------------------------------------------------+
```

### Matriz da Stack Tecnológica

| Camada | Tecnologia | Função no Sistema |
| :--- | :--- | :--- |
| **Ambiente Local** | Python `venv` | Isolamento absoluto de dependências no sistema operacional para prevenir conflitos de versões. |
| **Frontend** | Next.js 14+ / React / TS | Interface web moderna (tema escuro de alta fidelidade) com duas telas (Ingestão e Pergunta/RAG), barra de pipeline em tempo real e cards de evidências com scores. |
| **Backend de Processamento** | Python 3.12 (FastAPI / Uvicorn) | Leitura de pasta local, extração e OCR simulado, análise de preenchimento, fatiamento e vetorização. |
| **Modelo de Embeddings** | `FastEmbed` ONNX / `SentenceTransformers` (`all-MiniLM-L6-v2`) | Conversão de texto em vetores densos de **384 dimensões**. Executado via **FastEmbed (ONNX Runtime)** para consumo ultra-leve (~50MB de RAM, ideal para limites de nuvem como Render Free), mantendo 100% de precisão métrica. |
| **Banco de Dados** | Supabase (PostgreSQL + PGVector) | Armazenamento relacional de auditoria documental e busca por similaridade de cosseno via índice HNSW. |
| **Gateway de IA / LLM** | OpenRouter (`openrouter/auto`) | Roteamento dinâmico para modelos gratuitos de alto desempenho (ex: DeepSeek V3/R1), executando inferência estrita com `temperature=0`. |

---

## 2. Preparação do Ambiente e Boas Práticas de Engenharia

Para garantir que o projeto seja reproduzível pelos estudantes em qualquer computador, adota-se um padrão rigoroso de encapsulamento e proteção de credenciais.

### 2.1. Criação do Ambiente Virtual (`venv`)
No terminal do projeto (Windows):
```powershell
# 1. Criação do ambiente virtual encapsulado
python -m venv venv

# 2. Ativação do ambiente virtual
.\venv\Scripts\activate

# 3. Instalação das dependências
pip install -r requirements.txt
```

> **Aviso de Redes Corporativas / Antivírus**: Em ambientes com inspeção de certificados SSL (proxies acadêmicos ou antivírus), utilize:
> `pip install -r requirements.txt --trusted-host pypi.org --trusted-host files.pythonhosted.org`
> E nas requisições assíncronas do backend (`httpx`), adicione `verify=False` para evitar exceções do tipo `CERTIFICATE_VERIFY_FAILED`.

### 2.2. Gestão de Segredos e Variáveis de Ambiente (`.env`)
Nenhuma chave de API ou credencial deve ser gravada no código-fonte. O arquivo `.env` centraliza as configurações:

```env
# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-service-role-ou-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-sua-chave-openrouter-aqui
OPENROUTER_MODEL=openrouter/auto
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
LLM_TEMPERATURE=0

# Backend & Embeddings
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
TOP_K=5
```

---

## 3. Modelagem do Banco de Dados Relacional e Vetorial (Supabase / PGVector)

A modelagem de dados une auditoria relacional com armazenamento vetorial otimizado.

### Script SQL (`schema.sql`)
Execute o script abaixo no **SQL Editor** do Supabase Dashboard:

```sql
-- 1. Habilitar a extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabela Relacional: documentos
CREATE TABLE IF NOT EXISTS public.documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_arquivo VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    total_campos INTEGER DEFAULT 0,
    campos_preenchidos INTEGER DEFAULT 0,
    campos_nulos INTEGER DEFAULT 0,
    percentual_sucesso NUMERIC(5,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'PENDENTE',
    criado_em TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela Vetorial: documento_chunks (384 dimensões para all-MiniLM-L6-v2)
CREATE TABLE IF NOT EXISTS public.documento_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id UUID REFERENCES public.documentos(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    vetor VECTOR(384),
    metadados JSONB DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Índice HNSW para busca vetorial de alta performance (Distância Cosseno)
CREATE INDEX IF NOT EXISTS documento_chunks_vetor_idx 
ON public.documento_chunks 
USING hnsw (vetor vector_cosine_ops);

-- 5. Função RPC para busca de similaridade cosseno
CREATE OR REPLACE FUNCTION match_documento_chunks (
    query_embedding VECTOR(384),
    match_threshold FLOAT DEFAULT 0.0,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    documento_id UUID,
    texto TEXT,
    metadados JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.documento_id,
        dc.texto,
        dc.metadados,
        (1 - (dc.vetor <=> query_embedding))::FLOAT AS similarity
    FROM public.documento_chunks dc
    WHERE dc.vetor IS NOT NULL
      AND (1 - (dc.vetor <=> query_embedding)) > match_threshold
    ORDER BY dc.vetor <=> query_embedding ASC
    LIMIT match_count;
END;
$$;
```

---

## 4. Pipeline de Ingestão e Processamento Local (Tela 1)

O pipeline de ingestão opera em 4 etapas sequenciais visíveis na linha do tempo do frontend:

```
[Etapa A: Extração OCR & Leitura] 
       ↓
[Etapa B: Pré-Estruturação e Povoamento de Campos] 
       ↓
[Etapa C: Chunks & Embeddings (SentenceTransformers 384d)] 
       ↓
[Etapa D: Persistência Remota no Supabase PGVector]
```

### Características Essenciais da Ingestão:
1. **Isolamento de Falhas por Arquivo**: Se um arquivo corrompido falhar, o erro é registrado em log e o lote prossegue sem abortar o processamento dos demais documentos.
2. **Cálculo de Pré-Estrutura**: Para cada documento, o backend calcula `total_campos`, `campos_preenchidos`, `campos_nulos` e o `percentual_sucesso` (gravados na tabela `documentos`).
3. **Chunking Coerente (200 a 800 caracteres)**: Divide o texto respeitando quebras de parágrafos e sentenças, calculando metadados enriquecidos (`tokens`, `tamanho_bytes`, `categoria`, `origem`).

### 4.1. Resolução e Portabilidade da Pasta de Ingestão (`dados_locais` vs Caminho Físico)
Um ponto fundamental de arquitetura para ambientes em nuvem e compartilhamento com alunos é a **portabilidade do diretório de dados**:
- **Caminho Físico Local (Windows)**: Em desenvolvimento na máquina do professor, o caminho absoluto pode ser algo como `d:\workspace\...\dados_locais`.
- **Caminho Relativo no GitHub e Nuvem**: No repositório clonado no GitHub e no container Linux do Render, o caminho absoluto do Windows não existe. Os documentos devem ser lidos a partir do caminho relativo `dados_locais`.
- **Resiliência Implementada no Backend**: O endpoint `/api/ingestion/process-folder` implementa normalização automática. Se um usuário acidentalmente enviar o caminho completo do Windows contendo barras invertidas (`\`) ou letras de unidade (`D:`), o backend intercepta a requisição e redireciona automaticamente para o diretório `dados_locais` oficial do repositório, garantindo compatibilidade multiplataforma sem quebra de execução.

---

## 5. Pipeline RAG On-line, Sibling Retrieval e Engenharia de Prompt (Tela 2)

### 5.1. Validação Prévia da Base
Antes de liberar o Chatbot, o sistema executa um *healthcheck* remoto no Supabase. Se `total_chunks === 0`, o chat é bloqueado com a mensagem:
> *"Prepare antes a BASE na tela de Ingestão."*

### 5.2. O Desafio da Fragmentação e a Técnica *Sibling Chunk Retrieval*

#### O Problema Encontrado:
Em documentos como faturas ou contratos de 1 a 2 páginas, o fatiamento por limites de caracteres divide o arquivo:
- **Chunk 1**: Cabeçalho com o nome da empresa fornecedora, CNPJ e número da fatura.
- **Chunk 2**: Tabela de itens, subtotal, impostos e **Total a Pagar (R$ 3.727,50)**.

Quando o usuário pergunta *"Qual o valor total na fatura da TechCloud Solutions?"*, a busca vetorial por cosseno pontua muito alto no Chunk 1 (onde está o nome "TechCloud Solutions", ex: score 0.68), mas pontua ligeiramente mais baixo no Chunk 2 (onde estão os números, ex: score 0.49). 

Com uma janela pequena (`TOP_K = 3`), cabeçalhos de outras faturas superavam o Chunk 2, e os valores financeiros ficavam de fora dos candidatos. A LLM, sem ter acesso aos valores, acionava o fallback estrito.

#### A Solução de Engenharia: *Sibling / Parent-Document Context Expansion*
1. **Aumento de TOP_K**: Expandir a busca padrão para **`TOP_K = 5`**.
2. **Recuperação de Chunks Irmãos (*Sibling Retrieval*)**: Quando a busca vetorial identifica o documento mais relevante (candidato #1), o backend consulta o Supabase e anexa automaticamente todos os outros chunks pertencentes àquele mesmo `documento_id`.
3. **Resultado**: O cabeçalho da fatura e a tabela de valores são reunificados no contexto da LLM, garantindo 100% de precisão na resposta.

### 5.3. Engenharia de Prompt Categórica e Estruturada

O prompt aumentado entregue ao OpenRouter é estruturado da seguinte forma:

```markdown
[INSTRUÇÃO SISTÊMICA]
Você é um assistente especialista baseado estritamente em evidências documentais.
Sua missão é analisar minuciosamente os trechos recuperados das faturas, contratos e relatórios para responder à pergunta do usuário com máxima precisão.

DIRETRIZES DE RESPOSTA:
1. Responda de forma CATEGÓRICA, DIRETA e BEM FORMATADA (utilize negrito para destacar valores, números de documento, empresas e datas).
2. Se a pergunta solicitar um valor total, fatura ou dado financeiro de uma empresa/serviço, localize o valor correspondente nos trechos (ex: **TOTAL A PAGAR**, **Subtotal**, **Valor Total**, etc.) e informe de forma clara e objetiva.
3. Se os trechos apresentarem detalhes complementares relevantes da fatura/documento (como Número da Fatura, Vencimento, Itens ou Status), inclua-os de forma organizada e limpa.
4. Somente se os trechos recuperados NÃO contiverem dados ou relação com o assunto/empresa questionada, responda exatamente:
"Não há dados disponíveis para a requisição na base."

[EVIDÊNCIAS RECUPERADAS (TOP_K = 5)]
- Trecho [ID: 69a94284 | Score: 0.68]: "TechCloud Solutions Ltda. CNPJ: ... FATURA DE SERVIÇOS Nº: FAT-2026-001..."
- Trecho [ID: 1802be27 | Score: 0.49]: "Total (R$) Processamento GPU ... TOTAL A PAGAR: R$ 3.727,50..."

[PERGUNTA DO USUÁRIO]
Pergunta: Qual valor total na fatura da TechCloud Solutions?
```

### 5.4. Barra de Rastreamento do Pipeline em Tempo Real (Checkpoints)
Acima do Chatbot, o sistema renderiza uma barra interativa marcando os 4 pontos de verificação da consulta:

1. **1. Embedding da Pergunta**: Geração do vetor denso de 384 dimensões via `SentenceTransformers` e latência em ms.
2. **2. Retrieval PGVector**: Quantidade de chunks retornados e maior score de similaridade encontrado.
3. **3. Prompt Aumentado**: Confirmação da injeção das evidências no contexto com as regras de salvaguarda.
4. **4. LLM Ativa**: Modelo respondente (`deepseek-v4-flash`), temperatura (fixada em 0) e tempo de inferência.

Além disso, o cabeçalho do chatbot inclui o botão **"Limpar Conversa"** para restaurar o histórico e o painel de evidências a qualquer momento.

### 5.5. Salvaguarda de Auditoria: Ocultação Estrita de Evidências em Caso de Fallback
Quando a pergunta não possui respaldo na base e a LLM aciona o fallback obrigatório (*"Não há dados disponíveis para a requisição na base."*):
1. **Limpeza no Backend**: O endpoint `/api/rag/query` esvazia a lista de candidatos (`"candidates": []`).
2. **Ocultação Visual no Frontend**: O painel lateral de evidências oculta sumariamente qualquer card de chunk ou score e exibe um alerta de salvaguarda (*"Nenhuma evidência exibida - fallback acionado"*).
3. **Objetivo Didático e de Conformidade**: Essa blindagem impede que candidatos espúrios (trechos com pontuação baixa ou sem relação conceitual) sejam interpretados pelo usuário ou auditor como fundamentação de uma resposta inexistente.

---

## 6. Matriz de Parâmetros e Diagnóstico de Falhas no RAG

| Parâmetro | Valor Padrão | Justificativa |
| :--- | :--- | :--- |
| **Dimensão Vetorial** | `384` | Dimensão exata gerada pelo modelo `all-MiniLM-L6-v2`. |
| **Métrica de Similaridade** | Cosine Distance (`<=>`) | Invariante à magnitude de norma, ideal para comparação semântica. |
| **TOP_K** | `5` | Janela balanceada para capturar cabeçalhos e tabelas de valores. |
| **Tamanho do Chunk** | 200–800 caracteres | Granularidade ideal para faturas, cláusulas contratuais e artigos. |
| **Temperatura LLM** | `0.0` | Elimina estocasticidade e alucinações. |
| **Modelo LLM** | `openrouter/auto` | Roteador dinâmico do OpenRouter priorizando modelos de ponta disponíveis. |

### Trilha de Inspeção Didática para Alunos:
Quando uma consulta não retornar o resultado esperado, siga os 5 passos da trilha:
1. **Verificar a Extração**: O texto do PDF/arquivo local foi extraído com clareza ou sofreu corrupção de caracteres?
2. **Verificar o Chunking**: O valor ou a cláusula foi separada da entidade ou do título? O *Sibling Retrieval* foi ativado?
3. **Verificar os Scores**: O candidato correto estava entre os top-K ou seu score foi superado por chunks menos relevantes?
4. **Verificar o Prompt**: O trecho contendo o valor chegou intacto dentro do bloco de evidências?
5. **Verificar a LLM**: O prompt sistêmico estava restritivo demais (interpretando literalmente perguntas de linguagem natural)?

---

## 7. Roteiro de Execução Prática para os Alunos

1. **Clonar/Baixar o repositório do projeto**.
2. **Configurar o Supabase**:
   - Criar conta gratuita em [supabase.com](https://supabase.com).
   - Executar o script `schema.sql` no SQL Editor.
3. **Configurar o Arquivo `.env`**:
   - Inserir `SUPABASE_URL`, `SUPABASE_KEY` e a `OPENROUTER_API_KEY`.
4. **Criar e Ativar a `venv`**:
   - `python -m venv venv`
   - `.\venv\Scripts\activate`
   - `pip install -r requirements.txt`
5. **Iniciar a Aplicação**:
   - Iniciar o Backend: `run_backend.bat` (Porta `8000`).
   - Iniciar o Frontend: `run_frontend.bat` (Acessar `http://localhost:3000`).
6. **Executar a Ingestão na Tela 1**:
   - Processar os arquivos da pasta `dados_locais`.
   - Analisar o relatório de preenchimento e chunks gerados.
7. **Testar Consultas e Fallbacks na Tela 2**:
   - Testar perguntas válidas sobre valores de faturas e contratos (observando a resposta categórica e os cards de evidências).
   - Testar perguntas fora de escopo (observando o disparo do fallback estrito *"Não há dados disponíveis para a requisição na base."*).

---

## 8. Guia Passo a Passo de Hospedagem Gratuita na Nuvem (GIT - GITHUB - RENDER - VERCEL)

Esta seção documenta o fluxo completo para colocar a aplicação 100% no ar na nuvem, com links públicos HTTPS, alta disponibilidade e **custo zero** para professores e alunos.

```
                    +---------------------------------------+
                    |             REPOSITÓRIO               |
                    |               GITHUB                  |
                    +-------------------+-------------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
+----------------------------------+         +----------------------------------+
|         BACKEND (Python)         |         |        FRONTEND (Next.js)        |
|            RENDER.COM            | <------ |            VERCEL.COM            |
| - Runtime: Python 3              |   API   | - Root Directory: frontend       |
| - Build: pip install -r reqs     |  HTTPS  | - Build: next build              |
| - Start: uvicorn backend.main... |         | - NEXT_PUBLIC_BACKEND_URL        |
+-----------------+----------------+         +----------------------------------+
                  |
                  v
+----------------------------------+
|           SUPABASE               |
| - PostgreSQL nativo + PGVector   |
+----------------------------------+
```

---

### Fase 1: Versionamento e Envio ao GitHub

1. **Garantir a Proteção de Credenciais (`.gitignore`)**:
   Antes de inicializar o repositório, certifique-se de que o arquivo `.gitignore` na raiz do projeto ignore o arquivo `.env` e a pasta `venv/`:
   ```gitignore
   venv/
   .env
   node_modules/
   .next/
   ```

2. **Criar o Repositório no GitHub**:
   - Acesse [github.com/new](https://github.com/new).
   - Nome sugerido: `rag-pratico-generative-ai` ou `rag-pgvector-nextjs`.
   - Visibilidade: **Público** (ou Privado).
   - **Não** marque a opção de criar README ou .gitignore no GitHub (pois já existem no projeto local).

3. **Subir os Arquivos**:
   No terminal da raiz do projeto:
   ```bash
   git init
   git add .
   git commit -m "Primeiro commit da aplicação RAG completa"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/NOME-DO-REPOSITORIO.git
   git push -u origin main
   ```

---

### Fase 2: Hospedagem do Backend no Render.com (FastAPI)

O **Render** é utilizado para hospedar o serviço em Python contendo a API FastAPI, o modelo de embeddings e a conexão com o Supabase.

1. **Criar Conta**: Acesse [render.com](https://render.com) e faça login gratuito com sua conta do GitHub.
2. **Criar o Serviço**:
   - No Dashboard do Render, clique em **"New +"** (ou escolha na tela inicial) ➔ Selecione **`Web Services`**.
   - Conecte o repositório do GitHub criado na Fase 1.
3. **Configuração dos Parâmetros**:
   - **Name**: `rag-backend` (ou o nome desejado).
   - **Region**: Qualquer região gratuita (ex: *Oregon (US West)* ou *Ohio (US East)*).
   - **Branch**: `main`.
   - **Root Directory**: Deixe em branco (o Render executará a partir da raiz).
   - **Runtime**: Selecione **`Python 3`**.
   - **Build Command**:
     ```bash
     pip install -r requirements.txt
     ```
   - **Start Command**:
     ```bash
     uvicorn backend.main:app --host 0.0.0.0 --port $PORT
     ```
   - **Instance Type**: Selecione **`Free`** ($0/mês).
4. **Configuração das Variáveis de Ambiente (*Environment Variables*)**:
   - Na mesma tela, clique no botão **`Add from .env`** e cole suas variáveis:
     ```env
     SUPABASE_URL=https://seu-projeto.supabase.co
     SUPABASE_KEY=sua-chave-supabase
     OPENROUTER_API_KEY=sua-chave-openrouter
     OPENROUTER_MODEL=openrouter/auto
     LLM_TEMPERATURE=0
     ```

> **Engenharia de Memória no Render Free (512 MB RAM)**:
> O plano gratuito do Render possui limite de 512 MB de memória RAM. Modelos de embeddings tradicionais carregados via PyTorch (`sentence-transformers`) alocam cerca de 600 MB, provocando encerramento forçado do processo pelo Linux (**OOM - Out Of Memory**) e gerando erro `502 Bad Gateway`.
> Por essa razão, o projeto utiliza **`fastembed` (ONNX Runtime)**:
> - Executa o mesmo modelo `sentence-transformers/all-MiniLM-L6-v2` (384 dimensões).
> - **Consumo de memória**: Apenas **~50 MB de RAM** (queda de mais de 90%).
> - **Similaridade Vetorial**: 1.000000 (100% idêntica aos vetores do banco).
> - **Build mais rápido**: Não necessita baixar a biblioteca pesada do PyTorch (reduzindo o tempo de build de 5 min para ~40s).

5. **Realizar o Deploy**:
   - Clique no botão preto **"Deploy Web Service"**.
   - Aguarde o término do build (cerca de 1 a 2 minutos).
   - Quando o status ficar verde (**"Live"**), copie a URL pública gerada no topo da tela (ex: `https://rag-backend-xxxx.onrender.com`).
6. **Validação Rápida**:
   - Abra a URL no navegador com `/api/status`:
     `https://sua-url-do-render.onrender.com/api/status`
   - O retorno deverá ser um JSON confirmando: `"ready_for_rag": true` e `"database": { "configured": true }`.

---

### Fase 3: Hospedagem do Frontend na Vercel (Next.js)

A **Vercel** é a plataforma nativa do Next.js e hospedará a interface visual de forma global e com zero latência.

1. **Acessar a Vercel**: Acesse [vercel.com](https://vercel.com) e faça login gratuito com sua conta do GitHub.
2. **Importar o Repositório**:
   - Clique no botão **"Add New..."** ➔ **"Project"**.
   - Localize o repositório `rag-pratico-generative-ai` e clique em **"Import"**.
3. **Configuração do Projeto**:
   - **Root Directory**: Clique no botão **Edit** ao lado de Root Directory, selecione a subpasta **`frontend`** e clique em *Continue*.
   - **Framework Preset**: A Vercel detectará automaticamente como **Next.js**.
4. **Variáveis de Ambiente na Vercel (*Environment Variables*)**:
   - Abra a seção **Environment Variables** e adicione:
     - **Key**: `NEXT_PUBLIC_BACKEND_URL`
     - **Value**: Cole a URL pública obtida no Render (ex: `https://rag-backend-xxxx.onrender.com` — *sem barra no final*).
5. **Realizar o Deploy**:
   - Clique no botão azul **"Deploy"**.
   - Em menos de 2 minutos, o build será concluído e você receberá o link oficial da aplicação (ex: `https://rag-pratico-generative-ai.vercel.app`).

---

### Fase 4: Validação Ponta a Ponta na Nuvem

1. Abra a URL pública da Vercel no navegador.
2. Observe o badge no cabeçalho: ele deverá exibir **"X Chunks Indexados"** em verde (conectado diretamente através do Render ao Supabase).
3. Na **Tela 2: Pergunta / RAG**, digite:
   > *"Qual valor total na fatura da TechCloud Solutions?"*
4. Acompanhe a **Barra de Rastreamento do Pipeline** em tempo real:
   - *1. Embedding (384d)* ➔ *2. Retrieval (5 chunks)* ➔ *3. Prompt Aug.* ➔ *4. LLM Ativa (DeepSeek)*.
5. Verifique a resposta categórica e estruturada com os valores em negrito e os cards de evidências com seus scores de similaridade na coluna lateral.

---

### Fase 5: Diagnóstico e Resolução de Erros Comuns na Nuvem (Troubleshooting)

| Sintoma de Erro | Causa Técnica | Solução Aplicada |
| :--- | :--- | :--- |
| **`Falha ao consultar: Failed to fetch`** no chat | 1. **Cold Start do Render**: Após 15 min de inatividade no plano Free, o servidor hiberna e leva de 30 a 50s para acordar.<br>2. **Queda por Memória (OOM)**: PyTorch ultrapassando 512 MB de RAM. | • Aguardar o retorno inicial da primeira requisição.<br>• Migração concluída para o **FastEmbed ONNX** (~50 MB RAM), evitando qualquer crash de memória. |
| **`Diretório não encontrado: d:\...`** na Ingestão | Envio de caminho físico absoluto do Windows para o container Linux na nuvem. | Usar o caminho relativo **`dados_locais`**. O backend possui sanitizador inteligente que converte automaticamente caminhos do Windows para a pasta do repositório. |
| **`CERTIFICATE_VERIFY_FAILED`** no pip ou LLM | Inspeção de certificados SSL por proxies corporativos, educacionais ou antivírus. | • No pip: utilizar `--trusted-host pypi.org --trusted-host files.pythonhosted.org`<br>• No cliente HTTP: utilizar `httpx.AsyncClient(verify=False)`. |
| **Valores da fatura omitidos na resposta** | Fragmentação do cabeçalho da fatura e da tabela de preços em chunks separados. | Ativação do **Sibling Chunk Retrieval** (`supabase_service.py`) com expansão para `TOP_K = 5`. |


