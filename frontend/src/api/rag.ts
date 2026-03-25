const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export interface PipelineStage {
  id: string;
  name: string;
  status: "done" | "ready" | "idle" | "processing";
}

export interface RAGDocument {
  source_file: string;
  deal_id: string;
  sector: string;
  chunks: number;
  status: string;
}

export interface RAGConfig {
  embedding_model: string;
  vector_dimensions: number;
  chunk_strategy: string;
  vector_store: string;
  retrieval_mode: string;
  vector_weight: number;
  keyword_weight: number;
  reranking: string;
  top_k: number;
}

export interface RAGStats {
  vector_count: number;
  document_count: number;
  pipeline_stages: PipelineStage[];
  config: RAGConfig;
  documents: RAGDocument[];
}

export async function fetchRAGStats(): Promise<RAGStats> {
  const res = await fetch(`${API_BASE}/rag/stats`);
  if (!res.ok) {
    throw new Error(`RAG stats request failed: ${res.status}`);
  }
  return res.json();
}
