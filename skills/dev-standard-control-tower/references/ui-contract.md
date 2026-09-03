# Markdown screen design and UI contract

Before G2 approval, produce a project-specific Markdown screen design for every major screen and link elements to screen and requirement IDs. Include normal, loading, empty, validation error, server error, permission denied, long-text, and narrow-screen states. Markdown is the screen agreement; it does not replace API, DB, accessibility, security, or performance tests.

The Markdown design must include a component/state table and an ASCII wireframe. Use Mermaid when a flow, navigation, state transition, or information relationship is clearer as a diagram. Do not create HTML prototypes as a required gate artifact.

Required behavior:

- Display KST in 24-hour form unless an approved requirement differs.
- Use project-owned confirmation components for execute, save, delete, and modify; no native `alert`, `confirm`, or `prompt` for workflow decisions.
- Lock background scroll, trap/restore focus, support keyboard use, and contain scrolling in modals.
- Prevent unintended two-line/one-character vertical table wrapping; use intentional widths, ellipsis, wrapping, and tooltips.
- Search lists include start/end dates, search term, search, loading/empty/error/permission states, and pagination.
- If row click opens detail, do not add a duplicate detail button; preserve keyboard access.
- Registration/edit covers labels/types/required/defaults, client and server validation, duplicate checks, pending/double-submit control, unsaved warning, success navigation, failure input preservation, permission, and concurrency conflict.
- Long-running analysis uses a sanitized real-time log modal with execution ID, target, KST timestamps, stage, progress, status, cancellation where supported, bounded retained rows, and durable server state. Closing the modal must not silently cancel work.
- Status is conveyed with text/icon as well as color; responsive layouts retain required actions and information.

Create a menu matrix containing menu, screen ID/type, purpose, role, entry, fields, actions, API, states, requirement IDs, and test IDs. Review the Markdown tables and diagrams at the target narrow-screen width; unchecked applicable items fail the gate.
