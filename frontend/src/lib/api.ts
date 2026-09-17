export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** Custom error that preserves the HTTP status code for callers to inspect. */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, path: string, code?: string) {
    super(`API error ${status}: ${path}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface TaskSummary {
  task_id: string;
  case_id: string;
  case_type: string;
  agent_name: string;
  status: string;
  risk_level: string | null;
  outcome: string | null;
  outcome_summary: string | null;
  duration_seconds: number | null;
  human_review_status: string | null;
  created_at: string;
  /** The question this task answers; the board headlines it over case_id. */
  research_question: string | null;
  /** True once the record is on the hash chain — every mutation is refused. */
  sealed: boolean;
}

export interface DecisionListResponse {
  decisions: TaskSummary[];
  total: number;
}

export interface EventOut {
  event_id: string;
  sequence: number;
  event_type: string;
  timestamp: string;
  summary: string;
  details: Record<string, unknown> | null;
  actor: string;
}

export interface EvidenceOut {
  evidence_id: string;
  evidence_type: string;
  title: string;
  source: string;
  content_summary: string;
  relevance: string | null;
  retrieved_at: string;
}

export interface PolicyRefOut {
  policy_id: string;
  policy_code: string;
  section: string;
  title: string;
  text_excerpt: string;
  application: string;
}

export interface AuditRecordInfo {
  audit_id: string;
  record_hash: string;
  previous_hash: string;
  chain_sequence: number;
  sealed_at: string;
}

export interface FullDecisionRecord {
  task: Record<string, unknown>;
  agent: Record<string, unknown>;
  events: EventOut[];
  evidence: EvidenceOut[];
  policy_references: PolicyRefOut[];
  decision: Record<string, unknown> | null;
  audit_record: AuditRecordInfo | null;
}

export interface ReplayStep {
  step: number;
  timestamp: string;
  title: string;
  description: string;
  evidence: { title?: string; summary?: string }[];
  policies: { section?: string; title?: string; text_excerpt?: string; application?: string }[];
}

export interface ReplayResponse {
  task_id: string;
  case_id: string;
  replay_steps: ReplayStep[];
  final_decision: { outcome: string; summary: string; rationale: Record<string, unknown> } | null;
  integrity: { record_hash: string | null; verified: boolean | null };
}

export interface VerifyResponse {
  task_id: string;
  verified: boolean;
  record_hash: string | null;
  previous_hash: string | null;
  chain_sequence: number | null;
  sealed_at: string | null;
  chain_status: string;
  message: string;
}

async function apiError(res: Response, path: string): Promise<ApiError> {
  const payload = await res.json().catch(() => null);
  const detail = payload?.detail ?? payload;
  return new ApiError(res.status, path, typeof detail?.code === "string" ? detail.code : undefined);
}

async function get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw await apiError(res, path);
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw await apiError(res, path);
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { method: "DELETE", cache: "no-store" });
  if (!res.ok) throw await apiError(res, path);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw await apiError(res, path);
  return res.json();
}

export interface AgentOut {
  agent_id: string;
  name: string;
  version: string;
  domain: string;
  description: string | null;
}

export const api = {
  listAgents: () => get<{ agents: AgentOut[]; total: number }>("/agents"),
  listDecisions: (params?: { status?: string; risk_level?: string; case_id?: string }) =>
    get<DecisionListResponse>("/decisions", params),
  getDecision: (taskId: string) => get<FullDecisionRecord>(`/decisions/${taskId}`),
  getReplay: (taskId: string) => get<ReplayResponse>(`/decisions/${taskId}/replay`),
  verifyDecision: (taskId: string) => get<VerifyResponse>(`/decisions/${taskId}/verify`),
  updateDecisionStatus: (taskId: string, status: string) =>
    patch<{ task_id: string; status: string }>(`/decisions/${taskId}/status`, { status }),
  deleteDecision: (taskId: string) => del(`/decisions/${taskId}`),
  queueDecision: (body: { agent_id: string; case_id: string; case_type: string; inputs: Record<string, unknown> }) =>
    post<{ task_id: string; status: string; created_at: string }>("/decisions/queue", body),
  streamResearch: (
    body: { query: string; agent_domain?: string; client_name?: string; case_type?: string },
    onEvent: (ev: { type: string; token?: string; message?: string; task_id?: string; case_id?: string; status?: string; outcome?: string }) => void,
    onError?: (msg: string) => void,
  ) => {
    const url = `${API_URL.replace(/\/api\/v1\/?$/, "")}/api/v1/research/stream`;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok || !res.body) throw new Error(`Research stream failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim());
            onEvent(ev);
          } catch {}
        }
      }
    }).catch((e) => { onError?.(String(e)); throw e; });
  },
};
