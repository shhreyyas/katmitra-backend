# App-Side Integration Guide — Menu Module

> **Platform:** Multi-Business Catering SaaS
> **Scope:** Mobile / Web frontend integration with Menu APIs
> **Prerequisite:** User is authenticated and holds a valid JWT token

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [App Initialisation Flow](#2-app-initialisation-flow)
3. [Menu List Screen](#3-menu-list-screen)
4. [Create Menu Item Screen](#4-create-menu-item-screen)
5. [Edit Menu Item Screen](#5-edit-menu-item-screen)
6. [Delete Menu Item](#6-delete-menu-item)
7. [Menu Detail Screen](#7-menu-detail-screen)
8. [UX Rules & Guidelines](#8-ux-rules--guidelines)
9. [Suggested UI Patterns](#9-suggested-ui-patterns)
10. [Future Enhancements](#10-future-enhancements)

---

## 1. Core Concepts

The menu system has two visibility tiers. The app must handle them differently at every interaction point.

| Type | Visibility | Editable | Deletable |
|---|---|---|---|
| **Global** | All users | No — edit triggers a private copy | No |
| **Private (My Menu)** | Creator only | Yes | Yes |

> A private copy is created automatically by the backend when a user edits a global item. The original global item is never modified.

---

## 2. App Initialisation Flow

### Step 1 — Fetch Businesses After Login

Immediately after login, fetch the user's businesses to establish the active business context.

**API:** `GET /api/v1/businesses`

Display a **Business Selection Screen** if the user has multiple businesses. Once selected, store the active business ID locally:

```json
{
  "active_business_id": "biz_001"
}
```

---

### Step 2 — Set Business Context Header

Every subsequent API request must include the active business ID as a header:

```http
x-business-id: biz_001
```

> If this header is missing, the backend will reject the request. Ensure it is attached globally via your Axios interceptor or equivalent.

---

## 3. Menu List Screen

**API:** `GET /api/v1/get-menu-list`

### Response Structure

```json
{
  "success": true,
  "data": [
    {
      "id": "menu_1",
      "name": "Paneer Butter Masala",
      "is_global": true
    },
    {
      "id": "menu_2",
      "name": "My Special Dish",
      "is_global": false,
      "created_by_me": true
    }
  ]
}
```

---

### UI Rendering by Item Type

**Global Items (`is_global: true`)**

- Display a `Global` label/badge on the item card
- Show an **"Add to My Menu"** button instead of a standard Edit icon
- Tapping Edit or "Add to My Menu" triggers the copy-on-update flow (see §5)
- Do not show a Delete option

**Private Items (`is_global: false`, `created_by_me: true`)**

- Display a `My Item` label/badge on the item card
- Show Edit and Delete actions
- Both actions are fully available

---

### Filters

Filters can be applied as query parameters:

| Filter | Query Param | Example Values |
|---|---|---|
| Category | `category` | `starter`, `main_course`, `dessert` |
| Food type | `food_type` | `veg`, `non_veg` |

**Example:**

```
GET /api/v1/get-menu-list?category=starter&food_type=veg
```

Render filter controls as **chips or a filter bar** at the top of the list. Active filters should be visually highlighted.

---

### Sorting (Recommended)

Display items in this order to surface the most actionable items first:

1. User's private items (My Items)
2. Global items

---

### Empty States

| Scenario | Message |
|---|---|
| No items at all | "Create your first menu item" with a primary CTA button |
| No items match active filters | "No items match your filters" with a "Clear filters" link |

---

## 4. Create Menu Item Screen

**API:** `POST /api/v1/create-menu`

### Form Fields

| Field | Type | Required |
|---|---|---|
| Name | Text | Yes |
| Price per person | Number | Yes |
| Category | Select | Yes |
| Food type | Select (`veg` / `non_veg`) | Yes |
| Image | URL string (`image_url`) | No |
| Description | Free text (`description`), max 5000 chars | No |
| Ingredients | Dynamic list | No |

### Behaviour

- The item is always saved as private (`is_global: false`).
- **`_id` is auto-generated** by the server (UUID). Do not send `_id` or `id` in the request body.
- `created_by` and `business_id` are set server-side — do not send them in the request body.
- On success, append the new item to the list and scroll to it.

### Ingredient Row Shape

Each entry in `ingredients` is `{ name, qty, unit, cost, supply_item_id? }` (`qty`/`cost` optional). Rows may reference a Supply catalog `INGREDIENT` item via `supply_item_id` (validated server-side, must be active and visible to the business) or be free-text.

**`qty` is the amount of that ingredient needed to prepare the dish for 100 guests — not 1 guest/plate.** Every consumer that scales this recipe for an actual event (`GET /v1/bookings/:id/events/:eventId/suggestedSupplyFromMenu`, the full-booking-PDF ingredient breakdown, and Dish ingredient totals — all in `supplyController.js`/`dishController.js`) divides `qty` by 100 before multiplying by `quantity_per_plate × guest_count`. This convention was introduced 2026-09-19; ingredient rows created before that date were migrated ×100 by a one-time data migration (`prisma/migrations/20260919120000_ingredient_qty_per_100_guests`) so they continue to compute correctly.

### Categories

**API:** `GET /api/v1/menu-categories`, `POST /api/v1/menu-categories`, `PUT /api/v1/menu-categories/:id`, `DELETE /api/v1/menu-categories/:id` (all `authMiddleware` + `businessContextMiddleware`).

A business can add its own custom category, in addition to picking from the admin-curated global list:
- `GET /api/v1/menu-categories` returns the same shape as the older, still-public `GET /api/v1/get-category` (`{ categories: [{ id, name, slug, sort_order, is_active, is_global, created_at, updated_at }] }`) — merged: every `is_global: true` row plus this business's own `is_global: false` rows.
- `POST /api/v1/menu-categories` takes `{ name }`, creates a category with `businessId`/`createdByUserId` set and `is_global: false`. Rejects with `DUPLICATE` if a category with that name (case-insensitive) is already visible to the business.
- `PUT /api/v1/menu-categories/:id` takes `{ name }` and renames a category — **only if it's this business's own private category**; a global category, or one owned by a different business, is rejected with `403 FORBIDDEN`. The `slug` is never changed by this endpoint (menu items reference categories by `category_slug`, so changing it would silently reassign every item using it).
- `DELETE /api/v1/menu-categories/:id` — same ownership rule as update. Refuses with `422 CATEGORY_IN_USE` if any menu item still references this category's slug; the business must move or delete those items first.
- **Visibility is business-wide, not per-creator** — any user of the business sees and can use (or edit/delete) a category any teammate created, unlike `MenuItem`'s stricter "private (my menu): creator only" rule in the Core Concepts table above. This is a deliberate difference; don't assume the two follow the same rule.
- A menu item's `category_slug` must resolve to either a global category or one owned by the requesting business (`menuController.js`'s `loadCategoryBySlug`) — a business cannot attach another business's private category to their own menu item.
- The old public `GET /api/v1/get-category` (no auth) is unchanged and still returns only the global set — it's kept for any caller that doesn't have business context.

---

## 5. Edit Menu Item Screen

**API:** `PUT /api/v1/update-menu-item/:id`

The edit behaviour differs based on the item type. The backend handles the distinction automatically, but the app must set the correct expectations for the user.

---

### Case 1 — Editing a Private Item

No special handling needed. Send the update request; the item is updated in place.

**Success toast:** `"Item updated successfully"`

---

### Case 2 — Editing a Global Item (Copy-on-Update)

When a user taps Edit on a global item:

1. Optionally show a confirmation prompt: *"This will save a copy to your menu. The original will remain unchanged."*
2. Send the same `PUT /api/v1/update-menu-item/:id` request with the updated fields.
3. The backend creates a new private copy; the original is untouched.

**After success:**
- Show toast: `"Item saved to your menu"`
- Refresh the menu list
- Optionally highlight or scroll to the newly created item

---

## 6. Delete Menu Item

**API:** `DELETE /api/v1/delete-menu-item/:id`

- Show a confirmation dialog before calling the API: *"Are you sure you want to delete this item?"*
- This action is only available on private items (`created_by_me: true`).
- On success, remove the item from the list immediately (optimistic UI) or after the response.

> Never show a Delete option on global items.

---

## 7. Menu Detail Screen

**API:** `GET /api/v1/get-menu-item/:id`

### Display

| Field | Notes |
|---|---|
| Name | — |
| Description | From `description` when present |
| Image | From `image_url` when present |
| Category & food type | Show as badges |
| Ingredients | Itemised list with individual costs — `qty` is the amount for 100 guests, see [Ingredient Row Shape](#ingredient-row-shape) in Section 4 |
| Estimated cost | `sum(ingredients[].cost)` |
| Profit | `price_per_person - estimated_cost` |
| Profit margin | `(profit / price_per_person) * 100` — display as `%` |

- For **global items**, show an **"Add to My Menu"** CTA at the bottom instead of Edit/Delete actions.
- For **private items**, show Edit and Delete actions.

---

## 8. UX Rules & Guidelines

### Critical Rules

| Rule | Detail |
|---|---|
| Never allow direct editing of global items | Always treat as copy-on-update. Disable the standard edit flow; show "Add to My Menu" instead |
| Always label item type | Every card must clearly show `Global` or `My Item` so users understand what they are interacting with |
| Confirm before destructive actions | Show a confirmation dialog before any Delete call |

### Error Handling

| Scenario | User-Facing Message |
|---|---|
| Network error | "No internet connection. Please try again." |
| 403 on edit/delete | "You don't have permission to modify this item." |
| 404 on load | "This item no longer exists." |
| 500 server error | "Something went wrong. Please try again later." |

---

## 9. Suggested UI Patterns

### Tab / Chip Filter Bar

Render one of these patterns at the top of the Menu List screen to allow quick filtering:

**Option A — Tabs**

```
[ All Items ]  [ My Items ]
```

**Option B — Chips (Recommended)**

```
[ All ]  [ My Items ]  [ Veg ]  [ Non-Veg ]
```

Chips allow multiple filters to be combined (e.g. My Items + Veg).

---

### Item Card Structure

```
┌──────────────────────────────────────┐
│  Paneer Butter Masala     [Global]   │
│  Main Course • Veg                   │
│  ₹15 / person                        │
│                    [ Add to My Menu ]│
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  My Special Dish          [My Item]  │
│  Starter • Non-Veg                   │
│  ₹18 / person                        │
│                       [Edit][Delete] │
└──────────────────────────────────────┘
```

---

## 10. Future Enhancements

| Feature | Notes |
|---|---|
| Favourite items | Star/bookmark menu items for quick access |
| Add to Package | Link menu items to quote/package builder (next module) |
| Cost calculator UI | Visual breakdown of ingredient cost vs. selling price |
| Image upload | Attach a photo to a menu item |
| AI menu suggestions | Suggest items based on event type or past usage |

---

## Summary

| Rule | Behaviour |
|---|---|
| Global menu | Read-only; edit triggers a private copy |
| My menu | Fully editable and deletable |
| Other users' items | Never visible — filtered server-side |
| Business context | `x-business-id` header required on every API call |

---

> **Next:** Package Builder UI Flow or Payment Flow Integration