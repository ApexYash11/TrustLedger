import {
  FullDecisionRecord,
  ReplayResponse,
  TaskSummary,
  VerifyResponse,
} from "@/lib/api";

/* Static preview data: shown alongside live backend data so the board and
   detail pages can be evaluated as they will look with a full live agent run.
   Remove DEMO_CARDS from page.tsx and these lookups once live agent data is enough. */
export const DEMO_CARDS: TaskSummary[] = [
    { task_id: "demo-1041", case_id: "Vendor Due Diligence - Acme Corp", case_type: "Due Diligence", agent_name: "Scout Agent", status: "queued", risk_level: "medium", outcome: null, outcome_summary: "Financials, litigation history and beneficial ownership checks queued for the research pipeline.", duration_seconds: null, human_review_status: null, created_at: "2026-08-28T10:00:00Z" },
    { task_id: "demo-1042", case_id: "Sanctions Screening Refresh", case_type: "Compliance", agent_name: "Compliance Bot", status: "queued", risk_level: "low", outcome: null, outcome_summary: "Periodic re-screen of the counterparty against updated OFAC, EU and UN watchlists.", duration_seconds: null, human_review_status: null, created_at: "2026-08-28T09:15:00Z" },
    { task_id: "demo-1037", case_id: "Market Entry Study - Quick Commerce", case_type: "Market Entry", agent_name: "Research Agent Alpha", status: "running", risk_level: "high", outcome: null, outcome_summary: "Agent is mapping competitor dark-store density and delivery-fee economics across tier-1 cities.", duration_seconds: 320, human_review_status: null, created_at: "2026-08-27T09:30:00Z" },
    { task_id: "demo-1038", case_id: "Regulatory Scan - Lending Norms", case_type: "Regulatory", agent_name: "Policy Scout", status: "running", risk_level: "medium", outcome: null, outcome_summary: "Tracking RBI circulars on unsecured lending and their impact on the proposed credit line.", duration_seconds: 480, human_review_status: null, created_at: "2026-08-27T08:10:00Z" },
    { task_id: "demo-1029", case_id: "Cyber Risk Assessment - Insurance", case_type: "Risk Assessment", agent_name: "Risk Agent", status: "review_required", risk_level: "high", outcome: "escalated", outcome_summary: "Escalated: conflicting findings on third-party API exposure; routed for partner review.", duration_seconds: 95, human_review_status: "pending", created_at: "2026-08-27T11:00:00Z" },
    { task_id: "demo-1031", case_id: "ESG Disclosure Readiness - Cement", case_type: "ESG", agent_name: "Compliance Bot", status: "review_required", risk_level: "medium", outcome: "approved_with_notes", outcome_summary: "BRSR disclosures achievable with proposed emissions data; two gaps flagged for notes.", duration_seconds: 210, human_review_status: "pending", created_at: "2026-08-27T10:20:00Z" },
    { task_id: "demo-1026", case_id: "Market Entry Assessment - EV Charging", case_type: "Market Entry", agent_name: "Scout Agent", status: "review_required", risk_level: "high", outcome: "conditional", outcome_summary: "Conditional recommendation: enter via a phased pilot in the Jaipur-Udaipur corridor.", duration_seconds: 400, human_review_status: "pending", created_at: "2026-08-25T14:45:00Z" },
    { task_id: "demo-1020", case_id: "Pricing Analysis - Quick Commerce", case_type: "Pricing", agent_name: "Vision Agent", status: "completed", risk_level: "low", outcome: "approved", outcome_summary: "Recommended: 6-minute delivery fee of Rs 19 maximizes retention without breaching the Rs 24 cost floor.", duration_seconds: 145, human_review_status: "approved", created_at: "2026-08-27T10:00:00Z" },
    { task_id: "demo-1023", case_id: "ESG Disclosure Readiness - Cement", case_type: "ESG", agent_name: "Wireframe Bot", status: "completed", risk_level: "medium", outcome: "approved", outcome_summary: "Recommended: FY27 BRSR disclosures are achievable with the proposed emissions data model.", duration_seconds: 189, human_review_status: "approved", created_at: "2026-08-27T09:00:00Z" },
    { task_id: "demo-1017", case_id: "Cost Optimization Study - Manufacturing", case_type: "Cost Analysis", agent_name: "Research Agent Alpha", status: "completed", risk_level: "low", outcome: "approved", outcome_summary: "Recommended: adopt the two-shift layout; validated â‚¹3.4 crore annual saving with no capex.", duration_seconds: 160, human_review_status: "approved", created_at: "2026-08-27T08:30:00Z" },
    { task_id: "demo-1013", case_id: "Regulatory Scan - Data Privacy", case_type: "Regulatory", agent_name: "Policy Scout", status: "completed", risk_level: "medium", outcome: "rejected", outcome_summary: "Not recommended: launch the wallet feature only after DPDP compliance sign-off on the consent flow.", duration_seconds: 230, human_review_status: "approved", created_at: "2026-08-26T16:00:00Z" },
    { task_id: "demo-1011", case_id: "M&A Screening - Logistics Target", case_type: "M&A Screening", agent_name: "Scout Agent", status: "completed", risk_level: "high", outcome: "escalated", outcome_summary: "Escalated: target's pending tax litigation materially changes the valuation band; partner sign-off needed.", duration_seconds: 310, human_review_status: "approved", created_at: "2026-08-25T12:00:00Z" },
];

export function getDemoCard(taskId: string): TaskSummary | undefined {
  return DEMO_CARDS.find((c) => c.task_id === taskId);
}

const DOMAIN_BY_AGENT: Record<string, string> = {
  "Scout Agent": "due diligence",
  "Compliance Bot": "regulatory compliance",
  "Research Agent Alpha": "market research",
  "Policy Scout": "regulatory monitoring",
  "Wireframe Bot": "ESG reporting",
  "Risk Agent": "cyber risk",
  "Vision Agent": "pricing analysis",
};

function demoRecord(card: TaskSummary): FullDecisionRecord {
  const completed = card.status === "completed";
  const decided = completed || card.status === "review_required";
  const inputs: Record<string, unknown> = {
    case_type: card.case_type,
    requested_by: "Deloitte Engagement Lead",
    priority: card.risk_level ?? "medium",
    jurisdiction: "India",
  };

  const events = [
    { event_id: `${card.task_id}-e1`, sequence: 1, event_type: "task_created", timestamp: card.created_at, summary: `Task "${card.case_id}" created and queued for ${card.agent_name}.`, details: null, actor: "system" },
    { event_id: `${card.task_id}-e2`, sequence: 2, event_type: "agent_started", timestamp: card.created_at, summary: `${card.agent_name} picked up the task and began research.`, details: null, actor: card.agent_name },
    { event_id: `${card.task_id}-e3`, sequence: 3, event_type: "evidence_gathered", timestamp: card.created_at, summary: `Collected independent sources relevant to ${card.case_type.toLowerCase()}.`, details: null, actor: card.agent_name },
    ...(decided
      ? [
          { event_id: `${card.task_id}-e4`, sequence: 4, event_type: "decision_reached", timestamp: card.created_at, summary: `Outcome: ${card.outcome}. ${card.outcome_summary ?? ""}`, details: null, actor: card.agent_name },
          { event_id: `${card.task_id}-e5`, sequence: 5, event_type: "record_sealed", timestamp: card.created_at, summary: "Decision record sealed with a cryptographic hash.", details: null, actor: "system" },
        ]
      : []),
  ];

  const evidence = [
    { evidence_id: `${card.task_id}-ev1`, evidence_type: "web_page", title: `${card.case_type} market report 2026`, source: "Industry Research Desk", content_summary: `Aggregated sector data used to ground the ${card.case_type.toLowerCase()} analysis.`, relevance: "primary", retrieved_at: card.created_at },
    { evidence_id: `${card.task_id}-ev2`, evidence_type: "regulatory_filing", title: "Regulator circular digest", source: "Policy Scout index", content_summary: "Recent circulars and notifications screened for material impact on this case.", relevance: "supporting", retrieved_at: card.created_at },
    { evidence_id: `${card.task_id}-ev3`, evidence_type: "news_article", title: "Counterparty coverage scan", source: "News aggregator", content_summary: "Media coverage screened for litigation, sanctions and reputational signals.", relevance: "supporting", retrieved_at: card.created_at },
  ];

  const policy_references = [
    { policy_id: `${card.task_id}-pol1`, policy_code: "TL-POL-004", section: "3.1", title: "Evidence grounding requirement", text_excerpt: "Every recommendation must cite at least two independent sources.", application: "Satisfied: three independent sources cited for this decision." },
    { policy_id: `${card.task_id}-pol2`, policy_code: "TL-POL-011", section: "5.2", title: "Escalation thresholds", text_excerpt: "High-risk outcomes must be escalated for human review before acting.", application: card.risk_level === "high" ? "Applied: outcome escalated for partner review." : "Reviewed: risk level does not trigger mandatory escalation." },
  ];

  const decision = decided
    ? {
        outcome: card.outcome,
        outcome_summary: card.outcome_summary,
        structured_rationale: {
          primary_reason:
            card.outcome === "rejected"
              ? "Compliance prerequisites are unmet; proceeding would breach policy."
              : card.outcome === "escalated"
                ? "A material risk signal was found that requires human judgment."
                : "Evidence supports the recommendation within the defined risk band.",
        },
        confidence_score: 0.62 + (card.task_id.length % 5) * 0.06,
        decided_at: card.created_at,
      }
    : null;

  const audit_record = completed
    ? {
        audit_id: `audit-${card.task_id}`,
        record_hash: `sha256:demo${card.task_id.replace(/\D/g, "")}f3a9c1d2e4b5a6978877665544332211ffeeddccbbaa99887766554433221100`,
        previous_hash: "sha256:demoprevious0000f3a9c1d2e4b5a6978877665544332211ffeeddccbbaa99887766554",
        chain_sequence: 100 + Number(card.task_id.replace(/\D/g, "")),
        sealed_at: card.created_at,
      }
    : null;

  return {
    task: {
      task_id: card.task_id,
      case_id: card.case_id,
      case_type: card.case_type,
      status: card.status,
      risk_level: card.risk_level,
      human_review_status: card.human_review_status,
      inputs,
      created_at: card.created_at,
      completed_at: completed ? card.created_at : null,
    },
    agent: {
      name: card.agent_name,
      version: "2.4.0",
      domain: DOMAIN_BY_AGENT[card.agent_name] ?? "general research",
    },
    events,
    evidence,
    policy_references,
    decision,
    audit_record,
  };
}

const recordCache = new Map<string, FullDecisionRecord>();

export function getDemoRecord(taskId: string): FullDecisionRecord | null {
  if (recordCache.has(taskId)) return recordCache.get(taskId)!;
  const card = getDemoCard(taskId);
  if (!card) return null;
  const record = demoRecord(card);
  recordCache.set(taskId, record);
  return record;
}

export function getDemoReplay(taskId: string): ReplayResponse | null {
  const card = getDemoCard(taskId);
  if (!card) return null;
  const record = getDemoRecord(taskId)!;
  const decided = card.status === "completed" || card.status === "review_required";
  return {
    task_id: card.task_id,
    case_id: card.case_id,
    replay_steps: [
      { step: 1, timestamp: card.created_at, title: "Task received", description: `Task "${card.case_id}" was accepted and routed to ${card.agent_name}.`, evidence: [], policies: [] },
      { step: 2, timestamp: card.created_at, title: "Sources collected", description: "The agent gathered independent sources before forming any view.", evidence: record.evidence.map((e) => ({ title: e.title, summary: e.content_summary })), policies: [] },
      ...(decided
        ? [
            { step: 3, timestamp: card.created_at, title: "Policies applied", description: "Decision policies were checked against the gathered evidence.", evidence: [], policies: record.policy_references.map((p) => ({ section: p.section, title: p.title, text_excerpt: p.text_excerpt, application: p.application })) },
            { step: 4, timestamp: card.created_at, title: "Outcome reached", description: card.outcome_summary ?? "", evidence: [], policies: [] },
          ]
        : [{ step: 3, timestamp: card.created_at, title: "Research in progress", description: "The agent is still collecting and evaluating evidence.", evidence: [], policies: [] }]),
    ],
    final_decision: decided
      ? { outcome: card.outcome ?? "pending", summary: card.outcome_summary ?? "", rationale: {} }
      : null,
    integrity: {
      record_hash: record.audit_record?.record_hash ?? null,
      verified: record.audit_record ? true : null,
    },
  };
}

export function getDemoVerify(taskId: string): VerifyResponse | null {
  const card = getDemoCard(taskId);
  if (!card) return null;
  const record = getDemoRecord(taskId)!;
  if (record.audit_record) {
    return {
      task_id: card.task_id,
      verified: true,
      record_hash: record.audit_record.record_hash,
      previous_hash: record.audit_record.previous_hash,
      chain_sequence: record.audit_record.chain_sequence,
      sealed_at: record.audit_record.sealed_at,
      chain_status: "intact",
      message: "PASS - Sealed & intact",
    };
  }
  return {
    task_id: card.task_id,
    verified: false,
    record_hash: null,
    previous_hash: null,
    chain_sequence: null,
    sealed_at: null,
    chain_status: "unsealed",
    message: "This record has not been sealed yet - it is still in progress.",
  };
}
