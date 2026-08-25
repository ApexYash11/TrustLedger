const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

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

async function get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  listDecisions: (params?: { status?: string; risk_level?: string; case_id?: string }) =>
    get<DecisionListResponse>("/decisions", params),
  getDecision: (taskId: string) => get<FullDecisionRecord>(`/decisions/${taskId}`),
  getReplay: (taskId: string) => get<ReplayResponse>(`/decisions/${taskId}/replay`),
  verifyDecision: (taskId: string) => get<VerifyResponse>(`/decisions/${taskId}/verify`),
};
