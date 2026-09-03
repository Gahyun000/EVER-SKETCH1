---
name: ui-development-standard
description: Apply the Uniever AI Team mandatory UI standard when planning, designing, prototyping, implementing, reviewing, or testing web screens, admin pages, dashboards, list/detail/registration flows, modals, analysis progress views, and action buttons. Use for every new project with a frontend and for any change that affects screen structure, interaction, display rules, or menu behavior.
---

# Uniever UI Development Standard

Use this skill together with the approved requirements, screen design, Markdown screen design, API design, and project `AGENTS.md`. Stop implementation and update those documents first when they are missing, contradictory, or not testable.

## Required Inputs

Confirm these inputs before editing UI code:

- Approved requirements and acceptance criteria
- Screen IDs and menu inventory
- Approved Markdown screen design for normal and exceptional states
- API contracts and permission matrix
- Project design system or existing component patterns

Do not invent menus, fields, permissions, business rules, status values, or success criteria.

## Workflow

1. Read the approved inputs and map every screen to requirement, API, permission, and test IDs.
2. Create or update the menu-specific screen matrix.
3. Apply the common screen rules.
4. Apply the relevant list, detail, registration, analysis, modal, and button rules.
5. Implement loading, empty, validation-error, server-error, permission-denied, long-text, and narrow-screen states.
6. Compare the result with the approved Markdown screen design.
7. Run the completion checks. Do not report completion while any mandatory check fails.

## Common Screen Rules

Apply all of the following:

1. Display dates and times in Korea Standard Time using a 24-hour format unless an approved requirement explicitly says otherwise.
2. Use project-owned confirmation dialogs. Do not use browser-native `alert`, `confirm`, or `prompt` for workflow decisions.
3. Keep modal interaction isolated:
   - Lock background scrolling while the modal is open.
   - Allow scrolling inside the modal when content exceeds its viewport.
   - Trap focus inside the modal and restore focus to the trigger after close.
   - Support keyboard operation and an explicit close action.
   - Prevent modal wheel, touch, and keyboard scrolling from moving the parent page.
4. Prevent unintended two-line table cells and one-character vertical wrapping.
   - Keep short identifiers, dates, statuses, amounts, and action labels on one line.
   - Use column sizing, minimum widths, wrapping rules, ellipsis, and tooltips intentionally.
   - Allow wrapping only for fields approved as long-form content.
5. Represent status with text or icons in addition to color.
6. Implement responsive behavior without hiding required actions or data.

## List And Search Screens

Every searchable list screen must provide:

- Start date
- End date
- Search term
- Search button
- Explicit reset behavior when needed
- Loading, empty, error, and permission-denied states
- Pagination with current page, total count, page size, and disabled boundary controls

Open details by clicking the row when the approved design uses row navigation. Do not add a duplicate "상세보기" button. Preserve keyboard accessibility by making the row or its primary link focusable and operable.

Validate the date range, normalize the search term, preserve approved filters during pagination, and define the empty-result message.

## Detail Screens

Show the selected record identity, status, source list context, permissions, and available actions. Provide an approved return path that preserves the previous list filters and page where feasible.

Do not expose edit, delete, or execution actions without the required permission and confirmation behavior.

## Registration And Edit Screens

Define and implement:

- Field labels, types, required indicators, defaults, help text, and examples
- Client and server validation rules with consistent error codes
- Duplicate detection and asynchronous validation states
- Save-in-progress protection and duplicate-submit prevention
- Unsaved-change warning on navigation or close
- Success result and destination after save
- Failure recovery without losing valid user input
- Permission-denied and concurrency-conflict handling

Use a project-owned confirmation dialog before save and modification. Do not clear the form until the server confirms success.

## Analysis And Long-Running Work

Display real-time execution logs in a project-owned modal for analysis or other long-running work.

The modal must show:

- Execution ID and analysis target
- KST 24-hour timestamp for every log entry
- Current stage, progress, status, and start time
- Structured log level and message
- Running, succeeded, failed, cancelled, and timed-out states
- User-controlled auto-scroll or pause
- Cancel action when cancellation is supported
- Clear close behavior after terminal states

Use an approved transport such as SSE, WebSocket, or bounded polling. Sanitize log content, mask secrets and personal information, cap retained rows, and preserve a server-side execution record. Closing the modal must not silently cancel or corrupt the running job.

## Buttons And Confirmations

Use the shared project button and confirmation components.

Require a project-owned confirmation dialog for:

- Execute
- Save
- Delete
- Modify

The dialog must identify the target, action, consequence, confirm label, cancel label, and in-progress state. Destructive actions require visually and textually distinct treatment. Disable repeated submission while the action is pending.

## Menu-Specific Detail

Create a matrix for every menu before implementation:

| Menu | Screen ID | Screen type | Purpose | Roles | Entry | Fields/columns | Actions | API | States | Requirement/Test IDs |
|---|---|---|---|---|---|---|---|---|---|---|

Do not treat a generic shell as completion. For each menu, define its list, detail, registration/edit, analysis, permissions, messages, exceptional states, and navigation behavior as applicable.

## Mandatory Validation

Verify each applicable item with code inspection and a rendered screen:

- [ ] Dates and times use KST 24-hour display.
- [ ] Native browser alerts and confirmations are absent.
- [ ] Modal focus, internal scroll, background scroll lock, keyboard use, and focus restoration work.
- [ ] Table cells have no unintended two-line or vertical-text breakage.
- [ ] List screens contain start date, end date, search term, search, and pagination.
- [ ] Row click opens details without a duplicate detail button.
- [ ] Registration/edit validation, duplicate submission, unsaved changes, success, and failure states work.
- [ ] Execute, save, delete, and modify use the shared confirmation component.
- [ ] Analysis shows sanitized real-time logs in a modal and terminal states are handled.
- [ ] Every menu has a completed menu-specific matrix.
- [ ] Loading, empty, error, permission, long-text, and narrow-screen states match the approved Markdown screen design.
- [ ] Screen, API, permission, requirement, and test IDs are traceable.

Treat any unchecked applicable item as a failed completion condition. Record exceptions in an approved change request; do not silently waive them.
