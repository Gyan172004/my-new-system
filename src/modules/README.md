# Trusted module ownership

Modules communicate through `public.ts` application-service interfaces and immutable
DTOs. Imports within one owning module may use its private application/domain/
persistence/adapters layers. Cross-module imports must target that module's
`public.ts`; public entrypoints must not expose repositories or mutable storage
records. HTTP adapters translate the canonical contracts and invoke public services.

| Planned owning module | Responsibility |
| --- | --- |
| identity-profile | Identity, candidate profile and preferences |
| problem-catalogue | Published immutable Problem Packs and version resolution |
| content-pipeline | Offline ingestion, normalization and enrichment |
| content-publishing | Content validation, review, publish and deprecation |
| interview | Backend-owned interview lifecycle and state transitions |
| conversation | Turn input/output and transcript references |
| approach-assessment | Classification, confidence and abstention |
| hints-variants | Ordered hint/variant policy and exposure |
| model-gateway | Model/audio provider adapters, policy-neutral routing and budgets |
| submissions | Submission lifecycle and execution requests |
| execution-coordination | Bounded external sandbox coordination, never local candidate execution |
| feedback | Evidence-backed evaluation and feedback |
| history | Session snapshots, events and replay views |

These map the existing HLD boundaries; directories/code appear only when their
feature needs them. No speculative public success endpoints or domain tables
are generated. The content pipeline's ingestion work remains separate from live
interview orchestration. The execution service remains outside the trusted API.

Provider SDKs stay in their owning adapters. All OpenAI model/audio calls go
through Model Gateway adapters; Clerk belongs to identity and E2B to execution
coordination. AWS hosting does not authorize SDK calls from domain/UI code.
Browser entrypoints (`use client`) must not reach server configuration, private
modules, PostgreSQL or server-only packages, even through re-exports. Type-only
imports do not waive the owning-module boundary. Keep public browser-safe DTOs
separate from server implementation exports.

`npm run check:architecture` applies dependency-cruiser import rules plus a
TypeScript AST check for client reachability, secret environment reads and
execution primitives. `npm run test:architecture` executes allowed and forbidden
fixtures in owned disposable directories. Parsing never executes fixture code.
Domain/API source cannot import VM/subprocess/worker primitives, invoke eval or
Function, or dynamically import candidate-controlled paths. Boot/test tools may
spawn the service. Static checks supplement code review and the real external
sandbox boundary; they do not make trusted in-process execution safe.
