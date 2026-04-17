# E2E Test Scenarios — zenshin-chart

This document inventories the E2E test surface, derived from reading the
codebase (app routes, server actions, components). It is the canonical map for
what should eventually be covered by Playwright tests.

Status legend:
- ✅ implemented and passing
- 🟡 implemented but pending verification (e.g. needs credentials in CI)
- 🔜 designed, not yet implemented
- 🔁 regression test for a known bug

## Conventions

- All authenticated tests reuse a storage state produced by `auth.setup.ts`.
- Test resources are prefixed with `[E2E]` (see `helpers/test-data.ts`) so they
  can be cleaned up. The test user must have a workspace where editor-or-higher
  permissions allow chart creation.
- Both routes are kept in sync per CLAUDE.md, so most CRUD scenarios should be
  parameterised over `app/charts/[id]` and `app/workspaces/[wsId]/charts/[id]`.
- File suffix `*.public.spec.ts` runs unauthenticated (used for the login page,
  redirects, and any marketing/landing routes).

## Scenario inventory

### A. Auth & routing (public)
| ID | Scenario | Status |
|---|---|---|
| A1 | `/login` renders without crashing | ✅ `health.public.spec.ts` |
| A2 | Unauthenticated `/charts` redirects to `/login` | ✅ `health.public.spec.ts` |
| A3 | Login with valid credentials lands on a chart list page | 🟡 `auth.setup.ts` |
| A4 | Login with bad password shows an error toast | 🔜 |
| A5 | Logged-in user hitting `/login` is bounced to `/charts` | 🔜 |
| A6 | Forgot password → reset flow | 🔜 |
| A7 | Signup creates account + lands in default workspace | 🔜 |
| A8 | OAuth callback handler does not 500 on missing code | 🔜 |

### B. Chart CRUD
| ID | Scenario | Status |
|---|---|---|
| B1 | Create chart from `/charts` lands on the editor with title | ✅ `vrta-crud.spec.ts` |
| B2 | Rename chart updates the title and persists on refresh | ✅ `vrta-crud.spec.ts` |
| B3 | Delete chart removes it from the list | ✅ `vrta-crud.spec.ts` |
| B4 | Archive chart hides it from the active list | 🔜 |
| B5 | Restore archived chart returns it | 🔜 |
| B6 | Mark chart status `completed` is reflected on the badge | 🔜 |
| B7 | Workspace-scoped route mirrors B1–B6 | 🔜 |

### C. Vision / Reality CRUD
| ID | Scenario | Status |
|---|---|---|
| C1 | Add Vision item, content visible on refresh | ✅ `vrta-crud.spec.ts` |
| C2 | Add Reality item, content visible on refresh | ✅ `vrta-crud.spec.ts` |
| C3 | Edit Vision content | 🔜 |
| C4 | Delete Vision | 🔜 |
| C5 | Lock Vision prevents editing for non-owners | 🔜 |
| C6 | Vision area assignment via TagManager | 🔜 |
| C7 | Vision–Reality link toggle (`toggleVisionRealityLinkAction`) | 🔜 |

### D. Tension CRUD
| ID | Scenario | Status |
|---|---|---|
| D1 | Add Tension between a Vision and a Reality | ✅ `vrta-crud.spec.ts` |
| D2 | Tension status transitions (active → review_needed → resolved) | 🔜 |
| D3 | Tension area inherited by child Actions | 🔜 |
| D4 | Tension reorder via drag handle | 🔜 |

### E. Action CRUD
| ID | Scenario | Status |
|---|---|---|
| E1 | Add Action under a Tension | ✅ `vrta-crud.spec.ts` |
| E2 | Update action status todo→in_progress→done | 🔜 |
| E3 | Mark action complete; row reflects `is_completed` | 🔜 |
| E4 | Delete action | 🔜 |
| E5 | Telescope: action → child chart → completing child marks parent done | 🔜 |
| E6 | Action drag-drop between tensions (`moveActionToTension`) | 🔜 |
| E7 | Kanban view reflects status changes | 🔜 |

### F. Comments (regression-critical)
| ID | Scenario | Status |
|---|---|---|
| F1 | **Action comment is persisted after submit and visible on reload** | 🔁 `comments.spec.ts` (#86ex792ze) |
| F2 | Vision comment is persisted after submit and visible on reload | 🔁 `comments.spec.ts` |
| F3 | Reality comment is persisted after submit and visible on reload | 🔁 `comments.spec.ts` |
| F4 | Comment delete | 🔜 |
| F5 | Comment edit | 🔜 |
| F6 | @mention dropdown shows workspace items | 🔜 |
| F7 | @mention auto-records `item_relations` | 🔜 |

### G. Tags / Areas
| ID | Scenario | Status |
|---|---|---|
| G1 | Create Area, assign to Vision and Reality | 🔜 |
| G2 | Rename Area propagates to all linked items | 🔜 |
| G3 | Delete Area falls back items to "no area" | 🔜 |

### H. Snapshots
| ID | Scenario | Status |
|---|---|---|
| H1 | Save snapshot, list shows new entry with timestamp | 🔜 |
| H2 | Compare two snapshots renders diff | 🔜 |
| H3 | Tree snapshot button creates recursive snapshot | 🔜 |

### I. Proposal flow (Phase 1, just shipped)
| ID | Scenario | Status |
|---|---|---|
| I1 | Pending count badge appears on Proposals button when proposals exist | 🔜 |
| I2 | Open ProposalsPanel and approve a proposal applies items to chart | 🔜 |
| I3 | Reject proposal clears it from pending list | 🔜 |
| I4 | Editor cannot approve (button disabled or hidden) | 🔜 |

### J. AI Coach (just shipped)
| ID | Scenario | Status |
|---|---|---|
| J1 | AI Coach button opens panel | 🔜 |
| J2 | AI structurize creates proposals (mocked LLM response) | 🔜 |

### K. Workspace settings
| ID | Scenario | Status |
|---|---|---|
| K1 | Rename workspace from General settings | 🔜 |
| K2 | Invite member by email; pending invitation appears | 🔜 |
| K3 | Accept invitation as new user | 🔜 |
| K4 | Revoke invitation | 🔜 |
| K5 | Slack OAuth init redirects to slack.com (smoke) | 🔜 |

### L. Permission matrix (per role × per resource)
This is its own table. Each cell is one test. Recommended approach: a
parameterised spec that runs the same operation as four different test users
and asserts the expected allow/deny.

| Operation | owner | consultant | editor | viewer |
|---|---|---|---|---|
| Create chart | ✅ | ✅ | ❌ | ❌ |
| Edit V/R/T/A | ✅ | ✅ | ✅ | ❌ |
| Delete chart | ✅ | ✅ | ❌ | ❌ |
| Approve proposal | ✅ | ✅ | ❌ | ❌ |
| Manage members | ✅ | ❌ | ❌ | ❌ |
| Edit workspace settings | ✅ | ❌ | ❌ | ❌ |
| Comment | ✅ | ✅ | ✅ | ✅ |

All four `🔜` until dedicated test users exist for each role.

### M. i18n
| ID | Scenario | Status |
|---|---|---|
| M1 | Switching locale to `en` updates main nav copy | 🔜 |
| M2 | Switching locale to `ja` restores Japanese | 🔜 |

### N. Cron / API smoke
| ID | Scenario | Status |
|---|---|---|
| N1 | `GET /api/cron/slack-summary` requires bearer token | 🔜 |
| N2 | `GET /api/cron/slack-weekly` requires bearer token | 🔜 |
| N3 | `GET /api/proposals/list` returns 401 unauthenticated | 🔜 |

## Coverage status (this session)

This session set up the infrastructure (auth setup, projects, env loader) and
implemented the highest-value subset:
- A1, A2 (existing)
- A3 (auth.setup smoke)
- B1, B2, B3
- C1, C2, D1, E1
- F1, F2, F3 (the regression for #86ex792ze)

Everything marked 🔜 is on the roadmap for follow-up sessions.
