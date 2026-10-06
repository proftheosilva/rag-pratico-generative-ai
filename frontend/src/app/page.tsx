"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Search,
  Database,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Send,
  Sparkles,
  ArrowRight,
  RefreshCw,
  FileCode,
  ShieldAlert,
  Percent,
  Server,
  Trash2,
  Zap
} from "lucide-react";

interface DocumentMetric {
  success: boolean;
  filename: string;
  category?: string;
  total_campos?: number;
  campos_preenchidos?: number;
  campos_nulos?: number;
  percentual_sucesso?: number;
  chunks_gerados?: number;
  status: string;
  error?: string;
  stage_logs?: string[];
}

interface IngestionReport {
  total_arquivos: number;
  arquivos_sucesso: number;
  arquivos_falha: number;
  total_campos: number;
  campos_preenchidos: number;
  campos_nulos: number;
  percentual_global_sucesso: number;
  total_chunks_gerados: number;
  detalhes: DocumentMetric[];
}

interface EvidenceCandidate {
  id: string;
  similarity: number;
  texto: string;
  metadados?: {
    categoria?: string;
    origem?: string;
    tokens?: number;
  };
}

interface PipelineTrace {
  embedding?: {
    status: string;
    model: string;
    dimensions: number;
    time_ms: number;
  };
  retrieval?: {
    status: string;
    top_k: number;
    candidates_found: number;
    highest_score: number;
    time_ms: number;
  };
  prompt_augmented?: {
    status: string;
    evidence_count: number;
    has_context: boolean;
  };
  llm?: {
    status: string;
    model_used: string;
    temperature: number;
    is_fallback: boolean;
    time_ms: number;
  };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  model_used?: string;
  is_fallback?: boolean;
  candidates?: EvidenceCandidate[];
  pipeline_trace?: PipelineTrace;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://rag-backend-fg1w.onrender.com";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"ingestion" | "rag">("ingestion");
  
  // Status do Sistema
  const [dbStatus, setDbStatus] = useState<{
    configured: boolean;
    has_chunks: boolean;
    total_chunks: number;
    message: string;
  }>({
    configured: false,
    has_chunks: false,
    total_chunks: 0,
    message: "Verificando..."
  });
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Ingestão
  const [folderPath, setFolderPath] = useState("d:\\workspace\\Digital College\\Professor\\IA Generativa\\Conteudo\\Módulo 2\\Unidade 3\\RAG\\dados_locais");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStage, setCurrentStage] = useState<number>(0); // 0: Idle, 1: A, 2: B, 3: C, 4: D
  const [ingestionResult, setIngestionResult] = useState<IngestionReport | null>(null);
  const [ingestionError, setIngestionError] = useState<string | null>(null);

  // Chat RAG
  const [queryInput, setQueryInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [currentTrace, setCurrentTrace] = useState<PipelineTrace | null>(null);
  const [ragStep, setRagStep] = useState<number>(0); // 0: Idle, 1: Embedding, 2: Retrieval, 3: Prompt, 4: LLM

  const fetchStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/status`);
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data.database);
      } else {
        setDbStatus({
          configured: false,
          has_chunks: false,
          total_chunks: 0,
          message: "Servidor offline ou inacessível."
        });
      }
    } catch {
      setDbStatus({
        configured: false,
        has_chunks: false,
        total_chunks: 0,
        message: `Não foi possível conectar ao backend (${BACKEND_URL}).`
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleProcessFolder = async () => {
    if (!folderPath.trim()) return;

    setIsProcessing(true);
    setIngestionError(null);
    setCurrentStage(1);

    try {
      // Simula visualmente o avanço da linha do tempo durante a requisição
      const stageTimer1 = setTimeout(() => setCurrentStage(2), 600);
      const stageTimer2 = setTimeout(() => setCurrentStage(3), 1300);
      const stageTimer3 = setTimeout(() => setCurrentStage(4), 2000);

      const res = await fetch(`${BACKEND_URL}/api/ingestion/process-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_path: folderPath.trim() })
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Falha no processamento (Código ${res.status})`);
      }

      const data: IngestionReport = await res.json();
      setCurrentStage(4);
      setIngestionResult(data);
      // Atualiza contadores
      await fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setIngestionError(msg);
      setCurrentStage(0);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendQuery = async (queryText?: string) => {
    const text = queryText || queryInput;
    if (!text.trim() || isQuerying) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setQueryInput("");
    setIsQuerying(true);
    setRagStep(1);

    const stepTimer1 = setTimeout(() => setRagStep(2), 250);
    const stepTimer2 = setTimeout(() => setRagStep(3), 500);
    const stepTimer3 = setTimeout(() => setRagStep(4), 750);

    try {
      const res = await fetch(`${BACKEND_URL}/api/rag/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, top_k: 5 })
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      setRagStep(4);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Erro na inferência RAG (${res.status})`);
      }

      const data = await res.json();
      setCurrentTrace(data.pipeline_trace || null);

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.answer,
        model_used: data.model_used,
        is_fallback: data.is_fallback,
        candidates: data.candidates || [],
        pipeline_trace: data.pipeline_trace || null
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Falha ao consultar: ${msg}`,
          is_fallback: true
        }
      ]);
    } finally {
      setIsQuerying(false);
    }
  };

  const sampleQuestions = [
    "Qual é o valor total e o prazo de vigência do contrato com a Inova Tech?",
    "Qual é o número da fatura, cliente e a data de vencimento?",
    "Quais são os critérios de aprovação e frequência mínima no regulamento acadêmico?",
    "Qual é a fórmula da teoria da relatividade?" // Teste de fallback estrito
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* HEADER / NAVIGATION */}
      <header
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(10, 15, 29, 0.8)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: "16px 32px"
        }}
      >
        <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: "var(--gradient-brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 20px rgba(99, 102, 241, 0.4)"
              }}
            >
              <Cpu size={24} color="#fff" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                  RAG Prático
                </h1>
                <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>
                  Next.js + PGVector
                </span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                SentenceTransformers (384d) &bull; OpenRouter (openrouter/auto)
              </p>
            </div>
          </div>

          {/* Abas e Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* Status Badge */}
            <div
              className={`badge ${dbStatus.has_chunks ? "badge-success" : dbStatus.configured ? "badge-warning" : "badge-danger"}`}
              style={{ cursor: "pointer", padding: "6px 12px" }}
              onClick={fetchStatus}
              title="Clique para atualizar status do banco"
            >
              <Database size={14} />
              <span>
                {dbStatus.has_chunks
                  ? `${dbStatus.total_chunks} Chunks Indexados`
                  : dbStatus.configured
                  ? "Base Vazia (0 Chunks)"
                  : "Supabase Pendente"}
              </span>
              <RefreshCw size={12} className={isCheckingStatus ? "spin-animation" : ""} />
            </div>

            {/* Navigation Tabs */}
            <div
              style={{
                display: "flex",
                background: "rgba(255, 255, 255, 0.05)",
                borderRadius: "var(--radius-md)",
                padding: 4,
                border: "1px solid var(--border-subtle)"
              }}
            >
              <button
                onClick={() => setActiveTab("ingestion")}
                style={{
                  background: activeTab === "ingestion" ? "var(--indigo-500)" : "transparent",
                  color: activeTab === "ingestion" ? "#fff" : "var(--text-secondary)",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.2s"
                }}
              >
                <Layers size={16} />
                Tela 1: Ingestão de Dados
              </button>
              <button
                onClick={() => setActiveTab("rag")}
                style={{
                  background: activeTab === "rag" ? "var(--indigo-500)" : "transparent",
                  color: activeTab === "rag" ? "#fff" : "var(--text-secondary)",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.2s"
                }}
              >
                <Search size={16} />
                Tela 2: Pergunta / RAG
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main style={{ flex: 1, maxWidth: 1300, width: "100%", margin: "0 auto", padding: "32px 24px" }}>
        {/* ==================================================================== */}
        {/* TELA 1: INGESTÃO DE DADOS */}
        {/* ==================================================================== */}
        {activeTab === "ingestion" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {/* Box de Seleção de Pasta e Ação */}
            <div className="glass-panel" style={{ padding: 28 }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <FolderOpen size={22} color="var(--indigo-400)" />
                Pipeline de Ingestão e Processamento Local
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: 24, maxWidth: 900 }}>
                Selecione o diretório contendo os arquivos heterogêneos (<code>.pdf</code>, <code>.txt</code>, <code>.sql</code>, <code>.json</code>). O pipeline executará extração OCR/leitura, pré-estruturação relacional com cálculo de preenchimento, fatiamento semântico em blocos de 200 a 800 caracteres e vetorização remota no PGVector.
              </p>

              <div style={{ display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 320, position: "relative" }}>
                  <input
                    type="text"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    placeholder="Ex: d:\workspace\...\dados_locais"
                    style={{
                      width: "100%",
                      height: 48,
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      padding: "0 16px",
                      color: "#fff",
                      fontSize: "0.92rem",
                      fontFamily: "JetBrains Mono, monospace"
                    }}
                  />
                </div>
                <button
                  className="btn-primary"
                  onClick={handleProcessFolder}
                  disabled={isProcessing}
                  style={{ height: 48, padding: "0 28px" }}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw size={18} className="spin-animation" />
                      PROCESSANDO INGESTÃO...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      PROCESSAR INGESTÃO
                    </>
                  )}
                </button>
              </div>

              {ingestionError && (
                <div
                  style={{
                    marginTop: 20,
                    padding: 16,
                    background: "rgba(244, 63, 94, 0.12)",
                    border: "1px solid rgba(244, 63, 94, 0.3)",
                    borderRadius: "var(--radius-md)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    color: "#fecdd3"
                  }}
                >
                  <AlertTriangle size={20} color="var(--rose-500)" />
                  <div>
                    <strong>Erro no Processamento:</strong> {ingestionError}
                  </div>
                </div>
              )}
            </div>

            {/* LINHA DO TEMPO / BARRA DE PROGRESSO HORIZONTAL (4 ETAPAS) */}
            <div className="glass-panel" style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>
                  Linha do Tempo do Processamento (4 Fases Sequenciais)
                </h3>
                <span className="badge badge-info">
                  {currentStage === 0
                    ? "Aguardando Início"
                    : currentStage < 4
                    ? `Executando Etapa ${String.fromCharCode(64 + currentStage)}`
                    : "Etapas Concluídas"}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 16,
                  position: "relative"
                }}
              >
                {[
                  {
                    stage: 1,
                    letter: "Etapa A",
                    title: "Extração OCR & Leitura",
                    desc: "Leitura resiliente de PDF, TXT, SQL e JSON com isolamento de falhas.",
                    icon: FileText
                  },
                  {
                    stage: 2,
                    letter: "Etapa B",
                    title: "Pré-Estruturação Relacional",
                    desc: "Identificação de categoria e cálculo de campos preenchidos vs. nulos.",
                    icon: Percent
                  },
                  {
                    stage: 3,
                    letter: "Etapa C",
                    title: "Chunks & Embeddings",
                    desc: "Chunking coerente (200-800 carac.) e vetorização local 384 dims.",
                    icon: Cpu
                  },
                  {
                    stage: 4,
                    letter: "Etapa D",
                    title: "Persistência PGVector",
                    desc: "Armazenamento relacional e vetorial no Supabase com índice HNSW.",
                    icon: Database
                  }
                ].map((item) => {
                  const isDone = currentStage > item.stage || (currentStage === 4 && ingestionResult !== null);
                  const isCurrent = currentStage === item.stage && isProcessing;
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.stage}
                      style={{
                        padding: 18,
                        borderRadius: "var(--radius-md)",
                        background: isCurrent
                          ? "rgba(99, 102, 241, 0.15)"
                          : isDone
                          ? "rgba(16, 185, 129, 0.08)"
                          : "var(--bg-card-subtle)",
                        border: `1px solid ${
                          isCurrent
                            ? "var(--indigo-500)"
                            : isDone
                            ? "rgba(16, 185, 129, 0.3)"
                            : "var(--border-subtle)"
                        }`,
                        position: "relative",
                        transition: "all 0.3s ease"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: isCurrent ? "var(--indigo-400)" : isDone ? "var(--emerald-400)" : "var(--text-muted)",
                            textTransform: "uppercase"
                          }}
                        >
                          {item.letter}
                        </span>
                        {isDone ? (
                          <CheckCircle2 size={18} color="var(--emerald-400)" />
                        ) : isCurrent ? (
                          <RefreshCw size={18} color="var(--indigo-400)" className="spin-animation" />
                        ) : (
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--border-subtle)" }} />
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <Icon size={18} color={isCurrent ? "var(--indigo-400)" : isDone ? "var(--emerald-400)" : "var(--text-secondary)"} />
                        <h4 style={{ fontSize: "0.92rem", fontWeight: 600 }}>{item.title}</h4>
                      </div>

                      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                        {item.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PAINEL DE MÉTRICAS E RELATÓRIO DE SUCESSO */}
            {ingestionResult && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                  <div className="glass-panel" style={{ padding: 20 }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 6 }}>
                      ARQUIVOS ANALISADOS
                    </div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#fff" }}>
                      {ingestionResult.arquivos_sucesso} / {ingestionResult.total_arquivos}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--emerald-400)", marginTop: 4 }}>
                      {ingestionResult.arquivos_falha === 0
                        ? "100% dos arquivos lidos sem erro"
                        : `${ingestionResult.arquivos_falha} arquivo(s) com erro isolado`}
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: 20 }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 6 }}>
                      TAXA DE PREENCHIMENTO
                    </div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--indigo-400)" }}>
                      {ingestionResult.percentual_global_sucesso}%
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
                      Sucesso na extração estruturada
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: 20 }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 6 }}>
                      CAMPOS POPULADOS VS NULOS
                    </div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#fff" }}>
                      {ingestionResult.campos_preenchidos}{" "}
                      <span style={{ fontSize: "1rem", color: "var(--text-muted)" }}>
                        / {ingestionResult.campos_nulos} nulos
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
                      Total de {ingestionResult.total_campos} campos mapeados
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: 20 }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 6 }}>
                      CHUNKS & VETORES GERADOS
                    </div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--cyan-500)" }}>
                      {ingestionResult.total_chunks_gerados}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
                      Vetores densos (384 dimensões)
                    </div>
                  </div>
                </div>

                {/* Tabela de Arquivos Processados */}
                <div className="glass-panel" style={{ padding: 24, overflowX: "auto" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 16 }}>
                    Detalhamento dos Arquivos Processados
                  </h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left", color: "var(--text-muted)" }}>
                        <th style={{ padding: "10px 14px" }}>Arquivo</th>
                        <th style={{ padding: "10px 14px" }}>Categoria</th>
                        <th style={{ padding: "10px 14px" }}>Preenchimento</th>
                        <th style={{ padding: "10px 14px" }}>Chunks</th>
                        <th style={{ padding: "10px 14px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingestionResult.detalhes.map((doc, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: "1px solid var(--border-subtle)",
                            background: idx % 2 === 0 ? "transparent" : "rgba(255, 255, 255, 0.02)"
                          }}
                        >
                          <td style={{ padding: "12px 14px", fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <FileText size={16} color="var(--indigo-400)" />
                              {doc.filename}
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span className="badge badge-info">{doc.category || "geral"}</span>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div
                                style={{
                                  width: 80,
                                  height: 6,
                                  background: "rgba(255,255,255,0.1)",
                                  borderRadius: 3,
                                  overflow: "hidden"
                                }}
                              >
                                <div
                                  style={{
                                    width: `${doc.percentual_sucesso || 0}%`,
                                    height: "100%",
                                    background: "var(--emerald-400)"
                                  }}
                                />
                              </div>
                              <span>{doc.percentual_sucesso || 0}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px", color: "var(--cyan-500)", fontWeight: 600 }}>
                            {doc.chunks_gerados || 0}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            {doc.success ? (
                              <span className="badge badge-success">PROCESSADO</span>
                            ) : (
                              <span className="badge badge-danger">ERRO ISOLADO</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TELA 2: PERGUNTA / RAG CHATBOT */}
        {/* ==================================================================== */}
        {activeTab === "rag" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Validação Prévia da Base */}
            {!dbStatus.has_chunks && (
              <div
                className="glass-panel"
                style={{
                  padding: 32,
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  background: "rgba(245, 158, 11, 0.08)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: 16
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "rgba(245, 158, 11, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <ShieldAlert size={32} color="var(--amber-500)" />
                </div>
                <div>
                  <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--amber-500)", marginBottom: 8 }}>
                    Prepare antes a BASE na tela de Ingestão.
                  </h3>
                  <p style={{ color: "var(--text-secondary)", maxWidth: 600, fontSize: "0.92rem" }}>
                    Nenhum trecho documental vetorial foi localizado no Supabase. Para realizar consultas semânticas fundamentadas e inferência LLM estrita, execute a ingestão dos arquivos primeiro.
                  </p>
                </div>
                <button
                  className="btn-primary"
                  onClick={() => setActiveTab("ingestion")}
                  style={{ marginTop: 8 }}
                >
                  <ArrowRight size={18} />
                  Ir para a Tela de Ingestão
                </button>
              </div>
            )}

            {/* Interface Chatbot e Painel de Evidências */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 24, alignItems: "start" }}>
              {/* Coluna da Esquerda: Chat Conversacional */}
              <div className="glass-panel" style={{ display: "flex", flexDirection: "column", height: 680, padding: 20 }}>
                {/* Header do Chat */}
                <div
                  style={{
                    paddingBottom: 16,
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Chatbot Especialista RAG</h3>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Inferência estrita baseada nas evidências &bull; Modelo openrouter/auto (temp = 0)
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {messages.length > 0 && (
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setMessages([]);
                          setCurrentTrace(null);
                          setRagStep(0);
                        }}
                        style={{ fontSize: "0.78rem", padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}
                        title="Limpar histórico da conversa"
                      >
                        <Trash2 size={14} color="var(--rose-500)" />
                        Limpar Conversa
                      </button>
                    )}
                    <span className="badge badge-info">TOP_K = 5</span>
                  </div>
                </div>

                {/* BARRA DO CAMINHO DA CONSULTA RAG (4 ETAPAS) */}
                <div
                  style={{
                    padding: "12px 14px",
                    marginTop: 12,
                    marginBottom: 8,
                    borderRadius: "var(--radius-md)",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.76rem", fontWeight: 700, color: "var(--indigo-400)" }}>
                      <Zap size={14} />
                      CAMINHO DA PERGUNTA (PIPELINE RAG EM TEMPO REAL)
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      {isQuerying ? "Processando fluxo..." : currentTrace ? "Última requisição concluída" : "Aguardando pergunta"}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {/* 1. Embedding */}
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        background: ragStep >= 1 ? "rgba(99, 102, 241, 0.15)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${ragStep >= 1 ? "var(--indigo-500)" : "var(--border-subtle)"}`,
                        transition: "all 0.3s"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: ragStep >= 1 ? "var(--indigo-400)" : "var(--text-muted)" }}>
                          1. Embedding
                        </span>
                        {currentTrace?.embedding ? (
                          <CheckCircle2 size={12} color="var(--emerald-400)" />
                        ) : ragStep === 1 ? (
                          <RefreshCw size={12} color="var(--indigo-400)" className="spin-animation" />
                        ) : null}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>
                        {currentTrace?.embedding
                          ? `${currentTrace.embedding.dimensions}d (${currentTrace.embedding.time_ms}ms)`
                          : "SentenceTransformers"}
                      </div>
                    </div>

                    {/* 2. Retrieval */}
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        background: ragStep >= 2 ? "rgba(6, 182, 212, 0.15)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${ragStep >= 2 ? "var(--cyan-500)" : "var(--border-subtle)"}`,
                        transition: "all 0.3s"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: ragStep >= 2 ? "var(--cyan-500)" : "var(--text-muted)" }}>
                          2. Retrieval
                        </span>
                        {currentTrace?.retrieval ? (
                          <CheckCircle2 size={12} color="var(--emerald-400)" />
                        ) : ragStep === 2 ? (
                          <RefreshCw size={12} color="var(--cyan-500)" className="spin-animation" />
                        ) : null}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>
                        {currentTrace?.retrieval
                          ? `${currentTrace.retrieval.candidates_found} chunks (Max: ${currentTrace.retrieval.highest_score})`
                          : "Supabase PGVector"}
                      </div>
                    </div>

                    {/* 3. Prompt Aumentado */}
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        background: ragStep >= 3 ? "rgba(245, 158, 11, 0.15)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${ragStep >= 3 ? "var(--amber-500)" : "var(--border-subtle)"}`,
                        transition: "all 0.3s"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: ragStep >= 3 ? "var(--amber-500)" : "var(--text-muted)" }}>
                          3. Prompt Aug.
                        </span>
                        {currentTrace?.prompt_augmented ? (
                          <CheckCircle2 size={12} color="var(--emerald-400)" />
                        ) : ragStep === 3 ? (
                          <RefreshCw size={12} color="var(--amber-500)" className="spin-animation" />
                        ) : null}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>
                        {currentTrace?.prompt_augmented
                          ? `${currentTrace.prompt_augmented.evidence_count} trechos injetados`
                          : "Contexto sistêmico"}
                      </div>
                    </div>

                    {/* 4. LLM Ativa */}
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        background: ragStep >= 4 ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${ragStep >= 4 ? "var(--emerald-400)" : "var(--border-subtle)"}`,
                        transition: "all 0.3s"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: ragStep >= 4 ? "var(--emerald-400)" : "var(--text-muted)" }}>
                          4. LLM Ativa
                        </span>
                        {currentTrace?.llm ? (
                          <CheckCircle2 size={12} color="var(--emerald-400)" />
                        ) : ragStep === 4 ? (
                          <RefreshCw size={12} color="var(--emerald-400)" className="spin-animation" />
                        ) : null}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {currentTrace?.llm
                          ? `${currentTrace.llm.model_used.split("/").pop()} (${currentTrace.llm.time_ms}ms)`
                          : "OpenRouter (temp=0)"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mensagens */}
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "16px 4px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16
                  }}
                >
                  {messages.length === 0 ? (
                    <div
                      style={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-muted)",
                        textAlign: "center",
                        gap: 12
                      }}
                    >
                      <Sparkles size={36} color="var(--indigo-400)" />
                      <div>
                        <p style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                          Faça uma pergunta sobre os documentos indexados
                        </p>
                        <p style={{ fontSize: "0.82rem" }}>
                          As respostas serão geradas exclusivamente com base nas evidências recuperadas pelo PGVector.
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.map((m, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                          maxWidth: "85%"
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--text-muted)",
                            marginBottom: 4,
                            marginLeft: m.role === "user" ? "auto" : 4
                          }}
                        >
                          {m.role === "user" ? "Você" : `Assistente (${m.model_used || "OpenRouter"})`}
                        </div>
                        <div
                          style={{
                            padding: "14px 18px",
                            borderRadius: "var(--radius-md)",
                            background:
                              m.role === "user"
                                ? "var(--indigo-500)"
                                : m.is_fallback
                                ? "rgba(244, 63, 94, 0.12)"
                                : "var(--bg-secondary)",
                            border: `1px solid ${
                              m.role === "user"
                                ? "transparent"
                                : m.is_fallback
                                ? "rgba(244, 63, 94, 0.3)"
                                : "var(--border-subtle)"
                            }`,
                            color: m.role === "user" ? "#fff" : m.is_fallback ? "#fecdd3" : "var(--text-primary)",
                            fontSize: "0.92rem",
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap"
                          }}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))
                  )}

                  {isQuerying && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)", padding: 8 }}>
                      <RefreshCw size={16} className="spin-animation" />
                      <span style={{ fontSize: "0.85rem" }}>
                        Vetorizando query, buscando candidatos e gerando inferência...
                      </span>
                    </div>
                  )}
                </div>

                {/* Sugestões de Perguntas Rápidas */}
                <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)", marginBottom: 12 }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8 }}>
                    SUGESTÕES RÁPIDAS DE TESTE:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {sampleQuestions.map((q, idx) => (
                      <button
                        key={idx}
                        className="btn-secondary"
                        onClick={() => handleSendQuery(q)}
                        disabled={isQuerying}
                        style={{ fontSize: "0.75rem", padding: "6px 10px" }}
                      >
                        {q.length > 45 ? `${q.substring(0, 45)}...` : q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input de Pergunta */}
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendQuery()}
                    placeholder="Digite sua dúvida sobre a base..."
                    disabled={isQuerying}
                    style={{
                      flex: 1,
                      height: 46,
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      padding: "0 16px",
                      color: "#fff",
                      fontSize: "0.92rem"
                    }}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => handleSendQuery()}
                    disabled={isQuerying || !queryInput.trim()}
                    style={{ height: 46, padding: "0 20px" }}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>

              {/* Coluna da Direita: Cards de Evidências Transparentes (TOP_K = 5) */}
              <div className="glass-panel" style={{ height: 680, padding: 20, display: "flex", flexDirection: "column" }}>
                <div style={{ paddingBottom: 14, borderBottom: "1px solid var(--border-subtle)", marginBottom: 16 }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                    <Server size={18} color="var(--cyan-500)" />
                    Evidências Recuperadas (TOP_K = 5)
                  </h3>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Scores de similaridade vetorial e coordenadas da última consulta.
                  </p>
                </div>

                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
                  {messages.filter((m) => m.role === "assistant" && m.candidates && m.candidates.length > 0).length === 0 ? (
                    <div
                      style={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-muted)",
                        textAlign: "center",
                        gap: 12
                      }}
                    >
                      <Database size={32} color="var(--text-muted)" />
                      <p style={{ fontSize: "0.82rem" }}>
                        Nenhuma busca efetuada ainda. Ao enviar uma pergunta, os 3 trechos recuperados pelo PGVector aparecerão aqui.
                      </p>
                    </div>
                  ) : (
                    (() => {
                      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.candidates);
                      const candidates = lastAssistant?.candidates || [];

                      return candidates.map((cand, idx) => {
                        const score = Number(cand.similarity || 0);
                        const scorePercent = Math.min(100, Math.max(0, Math.round(score * 100)));

                        return (
                          <div
                            key={idx}
                            style={{
                              padding: 14,
                              borderRadius: "var(--radius-md)",
                              background: "var(--bg-secondary)",
                              border: "1px solid var(--border-subtle)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 10
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>
                                ID: {cand.id ? String(cand.id).substring(0, 8) : `CH-${idx + 1}`}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.82rem",
                                  fontWeight: 700,
                                  color: score >= 0.7 ? "var(--emerald-400)" : "var(--amber-500)"
                                }}
                              >
                                Score: {score.toFixed(2)}
                              </span>
                            </div>

                            {/* Barra de Progresso do Score */}
                            <div
                              style={{
                                width: "100%",
                                height: 5,
                                background: "rgba(255,255,255,0.1)",
                                borderRadius: 3,
                                overflow: "hidden"
                              }}
                            >
                              <div
                                style={{
                                  width: `${scorePercent}%`,
                                  height: "100%",
                                  background: score >= 0.7 ? "var(--emerald-400)" : "var(--amber-500)"
                                }}
                              />
                            </div>

                            <p
                              style={{
                                fontSize: "0.82rem",
                                color: "var(--text-primary)",
                                lineHeight: 1.45,
                                background: "rgba(0,0,0,0.25)",
                                padding: 10,
                                borderRadius: "var(--radius-sm)",
                                fontStyle: "italic"
                              }}
                            >
                              &ldquo;{cand.texto}&rdquo;
                            </p>

                            {cand.metadados && (
                              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "flex", gap: 10 }}>
                                <span>Origem: {cand.metadados.origem || "arquivo"}</span>
                                <span>Categoria: {cand.metadados.categoria || "geral"}</span>
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "16px 24px",
          textAlign: "center",
          fontSize: "0.8rem",
          color: "var(--text-muted)"
        }}
      >
        Digital College &bull; Módulo 2 / Unidade 3 &bull; Aplicação RAG com Next.js, PGVector e OpenRouter
      </footer>
    </div>
  );
}
