# User Guide System

How the floating help works, where the content lives, and how to add a
help entry for a new page.

## The pieces

| Piece | File | Purpose |
| --- | --- | --- |
| Floating `?` button + guidance panel | `src/components/help/ContextualHelp.tsx` | The help UI, mounted once in `src/app/layout.tsx` so it appears on **every** page (public and portal). |
| Deep-link | `src/components/help/HelpLink.tsx` | `<HelpLink article="result-upload" />` opens the panel scrolled to that article (dispatches `HELP_OPEN_EVENT`). |
| Content | `src/lib/help-content.ts` | All articles, categories, role intros and the route → article map. Plain data. |
| Full manual | `src/app/portal/guide/page.tsx` | The expanded User Guide page (TOC + six sections), rendered from the same article data. |

## How the floating help works

- The button is fixed at the **bottom-right** of every page
  (`ContextualHelp` is rendered outside `MaintenanceGuard` inside
  `AuthProvider` in the root layout, so it also shows for signed-out
  visitors).
- Clicking it opens the panel:
  1. **Help for this page** — the articles mapped to the current route
     (`helpArticlesForRoute()` does a longest-prefix match against
     `HELP_ROUTE_MAP`).
  2. **Role intro** — role-aware "start here" picks (`ROLE_INTRO`), or
     `PUBLIC_INTRO` for signed-out visitors.
  3. **Searchable library** — every article grouped by category
     (`HELP_CATEGORIES`), filtered by the search box.
- The panel closes on route change and on Escape.
- It is deliberately separate from the Notification Bell (that is
  notification history; this is reference documentation).

## Where content lives

Everything lives in `src/lib/help-content.ts`:

```ts
export interface HelpArticle {
  id: string;
  title: string;
  category: string;          // one of HELP_CATEGORIES ids
  roles: HelpRole[];         // who it is most relevant to
  keywords?: string[];       // extra search terms
  body: string[];            // plain-language paragraphs
  steps?: string[];          // optional numbered how-to
  related?: HelpRelatedLink[]; // optional portal links
}
```

Articles describe what a feature does, **who** can use it, and **how**.
They must reflect the app as it actually works — no invented features.

## Adding a help entry for a new page

1. Add a `HelpArticle` to `HELP_ARTICLES` in
   `src/lib/help-content.ts` (pick an existing category or add one to
   `HELP_CATEGORIES`).
2. Register it in `HELP_ROUTE_MAP` under the page's route prefix, e.g.
   `"/portal/election/review": ["my-new-article"]`.
3. If it belongs in the full manual, add its id to
   `SECTION_ARTICLES` in `src/app/portal/guide/page.tsx` (sections:
   getting-started, members, campaign, election, admin, help).
4. Optional: add it to a `ROLE_INTRO` pick list, and link to it from a
   screen with `<HelpLink article="my-new-article" />`.

Nothing else — the floating panel picks it up automatically.

## Route coverage

`HELP_ROUTE_MAP` covers the public pages (`/`, `/login`, `/volunteer`,
`/register-inec-officer`, `/about`, `/news`, `/biography`, `/manifesto`,
`/gallery`, `/structure`, `/contact`) and every portal route (dashboard,
profile, guide, tasks, leaderboard, all campaign pages, all election
pages, and all admin pages). Detail routes fall back to their list
page's entry via the longest-prefix match (e.g.
`/portal/campaign/members/<id>` → `member-directory`).

Note: the portal has **no self-service password reset page**; the
`resetting-your-password` article states accurately that members should
contact an administrator (matching the app).
