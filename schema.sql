-- ==============================================================================
-- SCRIPT DE CRIAÇÃO DO BANCO DE DADOS (SUPABASE POSTGRESQL + PGVECTOR)
-- Execute este script no SQL Editor do Supabase Dashboard
-- ==============================================================================

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

-- 3. Tabela Vetorial: documento_chunks (384 dimensões para SentenceTransformers all-MiniLM-L6-v2)
CREATE TABLE IF NOT EXISTS public.documento_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id UUID REFERENCES public.documentos(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    vetor VECTOR(384),
    metadados JSONB DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Índice para busca vetorial de alta performance (Cosine distance)
CREATE INDEX IF NOT EXISTS documento_chunks_vetor_idx 
ON public.documento_chunks 
USING hnsw (vetor vector_cosine_ops);

-- 5. Função RPC para busca de similaridade por cosseno no Supabase
CREATE OR REPLACE FUNCTION match_documento_chunks (
    query_embedding VECTOR(384),
    match_threshold FLOAT DEFAULT 0.0,
    match_count INT DEFAULT 3
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
