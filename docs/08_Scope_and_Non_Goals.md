# TrustLedger — Scope & Non-Goals

> The prototype demonstrates the **core concept** with the smallest convincing surface area. Everything else is a future production consideration.

---

## Prototype Scope (IN)

The prototype **must** include:

| Item | Definition |
|------|------------|
| **One domain** | Deloitte client research |
| **One simulated agent** | ResearchAgent v1.2.0 |
| **Synthetic data only** | No real client PII |
| **One decision workflow** | Engagement received → evidence/methodology evaluated → recommendation → optional human review → seal |
| **Small record set** | 10–20 pre-seeded decision records |
| **Working dashboard** | Kanban Agent Command Center |
| **Working decision replay** | Step-through reconstruction from stored data |
| **Demonstrable hash-chain integrity** | Pass on genuine records; fail on one pre-tampered record |
| **API-first logging** | start / events / complete / get / replay / verify |

---

## Explicit Non-Goals (OUT)

The prototype will **not** attempt:

### Enterprise Authentication & Access Control

- Login, SSO, OAuth, SAML
- Full RBAC implementation
- Per-role data filtering (e.g., a QRM partner only sees engagements they own)
- Session management, password reset, MFA

*Production consideration:* Role-based access so a research analyst or partner only sees their engagements (stated in EOI).

### Production-Grade Immutable Storage

- WORM (write-once-read-many) storage
- Hardware security modules (HSM)
- Enterprise key management
- Blockchain or distributed ledger
- Database-level immutability triggers / append-only tables with cryptographic proofs

*Prototype:* Hash chaining on standard PostgreSQL, enforced in application code.

### Multiple Enterprise Integrations

- Policy repositories
- Policy repositories
- CRMs
- Document management systems
- Weather APIs (real)
- Engagement/diligence sources (real)

*Prototype:* Mock/synthetic sources referenced by name in evidence records.

### Full Multi-Agent Orchestration

- Agent scheduling, routing, or load balancing
- Multi-agent collaboration
- Agent builder / prompt editor
- Task assignment UI
- Drag-and-drop workflow designer

*TrustLedger is not an orchestration platform.* The Kanban is an audit entry point.

### Advanced Model Explainability

- SHAP / LIME visualizations
- Feature importance charts
- Attention maps
- Embedding visualizations
- Prompt / chain-of-thought display

*EOI distinction:* Explainability tools explain the model to a data scientist; TrustLedger explains the decision to a business user.

### Production Regulatory Certification

- SOC 2, ISO 27001, HIPAA certification
- SR 11-7 model-risk documentation (full)
- GDPR "right to explanation" legal implementation
- Formal compliance audit of the prototype itself

*EOI notes these as production mappings, not prototype deliverables.*

### Full-Scale Distributed Infrastructure

- Kubernetes
- Kafka / event streaming
- Microservices mesh
- Multi-region replication
- Auto-scaling
- OpenSearch / Elasticsearch cluster

### Real Customer PII

- Real names, addresses, policy numbers from actual customers
- Production datasets
- Live agent connections to production systems

### Production Deployment Architecture

- High-availability setup
- Disaster recovery
- Backup/restore procedures
- Monitoring / alerting (PagerDuty, etc.)
- CI/CD pipelines beyond basic local Docker Compose

---

## What Looks Impressive but Distracts

Do **not** build these even if they seem like good demo material:

| Feature | Why it distracts |
|---------|------------------|
| Real-time WebSocket streaming of agent thoughts | Looks like monitoring, not audit |
| Blockchain integration | Overkill; hash chain on PostgreSQL proves the concept |
| Multi-tenant org switcher | Enterprise theater, not the core story |
| Custom RBAC permission editor | Week of work for a feature evaluators won't click |
| SHAP/LIME charts | Contradicts "business user first" |
| Agent prompt editor | Positions TrustLedger as an agent builder |
| PDF compliance report generator | Nice-to-have; not needed for 4-minute demo |
| Multiple domain workflows | Dilutes the client research story |
| Mobile app | Demo is on laptop/projector |
| Email/Slack notifications | Operational feature, not audit feature |
| Analytics dashboards (charts of decision volume) | BI, not trust layer |
| Dark-mode toggle / theme engine | Polish that doesn't serve the story |

---

## Future Production Considerations

When (if) TrustLedger moves beyond the capstone prototype:

1. **Authentication & RBAC** — role-scoped record access
2. **PII redaction pipeline** — decision logic stays auditable while PII is masked
3. **Enterprise key management** — production-grade hash chain signing
4. **WORM / immutable storage** — regulatory-grade record retention
5. **OpenSearch** — search across millions of decision records
6. **Multi-domain schema extensions** — banking, healthcare, HR, government
7. **Real system connectors** — case management, policy repos, CRMs
8. **Encryption at rest and in transit** — EOI requirement for production
9. **Horizontal log storage scaling** — EOI: "log storage scales linearly"
10. **Standalone product packaging** — EOI: "replicated across business units or offered as a standalone product"

None of these are required for a convincing Capstone 2026 prototype.

---

## Scope Guardrail

Before adding any feature, ask:

> **Does this help someone understand, reconstruct, or verify an AI decision?**

If the answer is no, it does not belong in the MVP.
