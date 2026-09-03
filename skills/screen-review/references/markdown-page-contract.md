# Markdown Page-Deck Contract

Use this contract for the single canonical screen-review Markdown file. The file must be useful as plain text; a renderer is optional.

## Front matter

Begin with YAML front matter containing at least:

```yaml
---
screen_review_id: SCR-REV-001
purpose: "Review screen composition and flow before implementation"
source_snapshot: "<commit-or-document-revision> at <YYYY-MM-DD HH:mm KST>"
source_refs: [REQ-001, DES-001]
page_count: 4
owner_approval: draft
privacy: synthetic-or-masked-data-only
validation: "<commands and results>"
---
```

Use `draft`, `review`, `approved`, `blocked`, or `unavailable` only where the workflow calls for them. Keep the ID unique and preserve the source snapshot when revising the deck.

## Pages and navigation

Use one `---` separator between pages. Every page must have a unique raw HTML anchor and a visible `페이지 N / 전체` label. Use `page-N` anchors, where `N` matches the visible page number and `page_count`.

```markdown
# 화면 구성 사전검수

<a id="page-1"></a>

## 페이지 1 / 4 — 화면 흐름 개요

Purpose, scope, owner, approval, and review summary.

[다음 페이지](#page-2)

---

<a id="page-2"></a>

## 페이지 2 / 4 — SCR-001 목록 화면

...

[이전 페이지](#page-1) | [다음 페이지](#page-3)
```

The first page has a next link. Middle pages have both links. The last page has a previous link and may link back to the first page as an explicit restart. Validate every local link target, anchor count, page count, and duplicate screen ID.

## Required page content

Cover the following across four or more pages, repeating screen pages as needed:

1. Purpose, scope, source snapshot, approval, and review outcome.
2. Screen list, menu structure, entry conditions, and primary user flow.
3. Per-screen purpose, role/permission, entry/exit conditions, layout wireframe, and component placement.
4. Button/input/table/message behavior and navigation targets, including exception paths.
5. Normal, loading, empty, validation-error, server-error, permission-denied, and long-text states.
6. Requirement, screen, API, DB, and test traceability IDs with `confirmed`, `inferred`, or `unknown` status.
7. Keyboard/focus, contrast, responsive/small-screen, privacy, and consistency checks.
8. Issues, decisions, owners, due/status fields, and the approval checklist.

Use text wireframes, tables, and checkboxes so the review remains readable without HTML, Marp, presenterm, images, or network access. Do not invent missing screens, rules, or data meanings; label them `unknown` or `inferred`.

## Screen-state matrix

Include a row for every screen and state. At minimum:

| Screen ID | State | Trigger/entry | Visible behavior/message | Action/exit | Evidence | Status |
|---|---|---|---|---|---|---|
| SCR-001 | normal | authorized entry | synthetic list and controls | open detail | REQ-001 | confirmed |
| SCR-001 | loading | request pending | loading indicator and preserved context | wait/cancel | API-001 | confirmed |
| SCR-001 | empty | no records | empty explanation and next action | create/filter | REQ-002 | inferred |
| SCR-001 | validation-error | invalid input | field-level error and focus target | correct/retry | TEST-001 | confirmed |
| SCR-001 | server-error | failed request | non-sensitive error and retry | retry/back | API-001 | unknown |
| SCR-001 | permission-denied | insufficient role | access explanation without data leakage | back/request access | SEC-001 | confirmed |
| SCR-001 | long-text | oversized label/content | wrapping/truncation rule | inspect full text | DES-002 | inferred |

## Traceability and approval

For each screen, record requirement/design IDs, API/DB references, test IDs, source evidence, privacy treatment, and confidence. Keep unresolved issues explicit:

```markdown
| Issue | Decision needed | Owner | Status | Evidence |
|---|---|---|---|---|
| Unknown permission rule | Confirm role boundary | <role> | open | REQ-001 |
```

The deck is not implementation-approved until the checklist is complete and `owner_approval: approved` is recorded by the responsible owner. A draft or review deck must block implementation.

## Concrete synthetic example: `SCR-REV-001`

```markdown
---
screen_review_id: SCR-REV-001
purpose: "Review a generic inventory list flow before implementation"
source_snapshot: "DES-001 rev.2 at 2026-08-17 14:00 KST"
source_refs: [REQ-001, DES-001]
page_count: 4
owner_approval: review
privacy: synthetic-or-masked-data-only
validation: "markdown-link-check: pass; page/state checks: pass"
---

# 화면 구성 사전검수

<a id="page-1"></a>

## 페이지 1 / 4 — 화면 흐름 개요

- Flow: 목록 진입 → 합성 항목 필터 → 상세 이동
- Entry: authorized role; exact role name is `unknown`
- Evidence: REQ-001, DES-001 (`confirmed`)
- Data: `ITEM-001`, `Example item` only; no operational values

| Screen ID | Purpose | Entry | Exit |
|---|---|---|---|
| SCR-001 | Review generic items | menu or direct link | detail or back |

[다음 페이지](#page-2)

---

<a id="page-2"></a>

## 페이지 2 / 4 — SCR-001 목록 화면

```text
+------------------------------------------------+
| Items                         [Filter] [Refresh] |
| [ITEM-001] Example item       [Open]             |
+------------------------------------------------+
```

| Component | Behavior | Evidence | Status |
|---|---|---|---|
| Filter | Accept synthetic item filter and retain focus | REQ-001 | confirmed |
| Refresh | Request the current list and show loading state | API-001 | inferred |
| Open | Navigate to generic item detail | DES-001 | confirmed |

[이전 페이지](#page-1) | [다음 페이지](#page-3)

---

<a id="page-3"></a>

## 페이지 3 / 4 — SCR-001 상태 매트릭스

| Screen ID | State | Trigger/entry | Visible behavior/message | Action/exit | Evidence | Status |
|---|---|---|---|---|---|---|
| SCR-001 | normal | authorized menu entry | Show synthetic row and controls | Open detail or filter | REQ-001 | confirmed |
| SCR-001 | loading | refresh request pending | Show progress and preserve filters | Wait or cancel | API-001 | confirmed |
| SCR-001 | empty | authorized request returns no items | Show “No items” and a safe next action | Create/filter or back | REQ-002 | inferred |
| SCR-001 | validation-error | Invalid filter submitted | Show field-level message and focus target | Correct and retry | TEST-001 | confirmed |
| SCR-001 | server-error | List request fails | Show non-sensitive error and retry message | Retry or back | API-001 | unknown |
| SCR-001 | permission-denied | Role lacks list permission | Show access message without list data | Back or request access | SEC-001 | confirmed |
| SCR-001 | long-text | Item label exceeds available width | Wrap or truncate with full-text affordance | Inspect full text | DES-002 | inferred |

[이전 페이지](#page-2) | [다음 페이지](#page-4)

---

<a id="page-4"></a>

## 페이지 4 / 4 — SCR-001 승인 체크

- [ ] Requirement and navigation traceability complete
- [ ] Required state coverage complete
- [ ] Privacy and accessibility checks complete
- [ ] Owner approval recorded as `approved`

[이전 페이지](#page-3) | [처음 페이지](#page-1)
```

The example is illustrative only and must not be copied as target-project business data.
