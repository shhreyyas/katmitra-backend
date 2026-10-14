# Staff — current flow and planned rework

Status: planning. The "Assign staff" section on the event screen
(`katmitra-app/src/app/(features)/Booking/bookingDetails.tsx`) and the
Cook/Staff Sheet rows in the Documents sheet are commented out until this
rework lands.

## How it works today

### Data (`prisma/schema.prisma`)

- `Staff`: one row per person in a business — `name`, `phone`, a single
  `role` (`StaffRole`: CHEF, HELPER, WAITER, MANAGER, CLEANER,
  VIP_SERVICE_BOY, COUNTER_STAFF, DECORATION_STAFF), `dailyCharge`, and two
  overlapping availability fields: `status` (`AVAILABLE` / `BUSY` /
  `ON_LEAVE` / `INACTIVE`) and `isAvailable`. Delete is soft
  (`isActive = false`).
- `EventStaff`: one row per (event, staff) — `role`, `assignedByUserId`,
  `allowConflict`. Unique on `[bookingEventId, staffId]`.

### API (`src/routes/staffRoutes.js`, `src/controllers/staffController.js`)

- `GET/POST /v1/staff`, `GET/PATCH/DELETE /v1/staff/:id` — staff master.
- `GET /v1/booking-events/:eventId/staff` — current assignments.
- `GET /v1/booking-events/:eventId/staff/available?role=` — active, `AVAILABLE`,
  `isAvailable` staff of that role with no other assignment on the same
  calendar day.
- `POST /v1/booking-events/:eventId/staff` — upserts `{ staff_id, role }[]`; returns
  `CONFLICT` if any staff already works another event that day, unless
  `force: true`.
- `DELETE /v1/booking-events/:eventId/staff/:staffId` — unassign.

### App

- Settings → Staff (`Settings/Staff/staffList.tsx`, `staffForm.tsx`): staff
  master list and add/edit form.
- Event screen → "Assign staff" card (`BookingStaffSection`): per-role
  "N assigned" counts and an "Assign staff" button.
- `Booking/assignStaff.tsx`: role chips → list of available staff for that
  role → tap to select → "Save assignments". The header now has a "+"
  button that opens the staff form with the selected role pre-filled; the
  list reloads when you come back.
- Cook/Staff Sheet PDF (`bookingPdf.ts`): event, menu, notes — does not list
  the assigned staff.

## Problems with the current flow

### Bugs

1. **Un-selecting does nothing.** Save only upserts the selected staff. A
   staff member you deselect stays assigned, and Save is a no-op when
   nothing is selected, so a role can never be cleared from this screen.
   The `DELETE` endpoint exists but the app never calls it.
2. **Switching role chips drops the other roles' picks.** Selection is
   reloaded per role and Save only sends the current role, so picking chefs,
   switching to waiters and saving saves only the waiters.
3. **Conflicts use the server's calendar day, not the event's.** The day is
   computed from `eventAt` in the server's timezone (UTC). An IST event
   late at night or early morning lands on the wrong day.
4. **Soft-deleted staff stay on events.** Deleting a staff member only sets
   `isActive = false`; their existing `EventStaff` rows remain and still
   count as assigned.

### Flow gaps

5. **Same-day = conflict is too strict for catering.** The same cook or
   waiter usually works lunch *and* dinner on one booking (or one day).
   Today the second assignment is blocked unless forced. Conflicts should
   be based on time windows (event start/end), and same-booking events
   should probably not conflict at all.
6. **No headcount per role.** The event can't say "needs 1 chef, 4 helpers,
   12 waiters", so there's no "3 of 12 waiters assigned" view. The
   Manpower supply category (e.g. "Waiter 12 pers" from a recipe or a
   booking-wide item) already carries this number — the two systems should
   share it instead of duplicating it.
7. **One role per person.** A helper who also serves can't be assigned as a
   waiter; the available list filters by the staff member's own role.
8. **Two availability fields.** `status` and `isAvailable` overlap; the form
   exposes both, and either one hides the person.
9. **No cost.** `dailyCharge` is stored but never used — no labour cost per
   event or per booking, nothing on the master sheet.
10. **No output.** Assigned staff don't appear on any PDF, and staff get no
    message (WhatsApp/SMS) with the event, time and venue.
11. **N+1 queries.** The available-staff list runs one conflict query per
    staff member; the assign endpoint runs two queries per item.

## Proposed changes

To agree on before building — order is a suggestion.

### Phase 1 — make assignment correct

- Assign screen sends the full desired set across all roles in one save
  (backend replaces the event's assignments in a transaction), so
  un-selecting and switching chips both work.
- Show already-assigned staff with a "remove" action; allow saving an empty
  role.
- Compute the event day in the business's timezone (IST) for conflicts.
- Unassign (or hide) a staff member's future assignments when they're
  deleted.
- Batch the conflict check into one query.

### Phase 2 — fit how caterers actually work

- Conflict rule: overlapping time windows only; never conflict between
  events of the same booking. Show the conflicting booking/event in the
  warning instead of a generic message.
- Required headcount per role per event, pre-filled from Manpower supply
  items; the event card shows "assigned / required".
- Let a staff member be picked for any role (keep their main role as the
  default filter, with "show all").
- Merge `status` + `isAvailable` into one field (needs a migration — ask
  first).

### Phase 3 — use the data

- Labour cost per event = Σ dailyCharge of assigned staff; show on the
  master sheet (owner-only, like prices).
- Staff list on the Cook/Staff Sheet (name, role — no phone numbers, same
  rule as the vendor PDFs).
- Share an event's duty list to a staff member over WhatsApp.
- Staff-wise schedule: "who works when" across bookings.

## Open questions

1. Should the same person working lunch and dinner of one booking ever be a
   conflict?
2. Is the Manpower supply category the source of truth for required
   headcount, or should staff headcount replace Manpower items?
3. Does labour cost belong on the invoice, or only on owner-facing sheets?
4. Should staff ever get the customer's phone or name on what we send them?

## Database note

Phase 1 needs no schema change. Phase 2's field merge and headcount (a
`requiredCount` per event + role) need migrations — per `CLAUDE.md`, write
them, show them, and apply only with explicit permission, after
`bash ~/katmitra-db-backups/backup.sh`.
