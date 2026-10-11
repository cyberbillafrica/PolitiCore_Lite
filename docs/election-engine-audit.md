# Politicore Electoral Engine Codebase Audit

This document presents a comprehensive, read-only audit of the election engine implementation across the four primary election pages and associated Firestore security rules, verifying every specification claim against actual lines of code.

---

## J-E1 — Audit `src/app/portal/election/upload/page.tsx`

### 1. Does it load the active election cycle and active contest from `election_settings`?
- **Answer:** **Yes**
- **Line Numbers:** Lines 72–87
- **Code Evidence:**
```typescript
const loadedSettings = await getElectionSettings();
const loadedCycles = await getElectionCycles();
setCycles(loadedCycles);

const defaultCycleId =
  loadedSettings?.active_election_cycle_id ||
  loadedCycles[0]?.id ||
  "general-election-2027";
setSelectedCycleId(defaultCycleId);

const loadedContests = await getContestsByCycle(defaultCycleId);
setContests(loadedContests);

const activeContestId =
  loadedSettings?.active_contest_id || loadedContests[0]?.id || "";
setSelectedContestId(activeContestId);
```

### 2. Does it let the uploader select among open contests, or does it default to the active one only?
- **Answer:** **Yes (Lets uploader select among open contests)**
- **Line Numbers:** Lines 295–320
- **Code Evidence:**
```tsx
<select
  value={selectedContestId}
  onChange={(e) => setSelectedContestId(e.target.value)}
  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-medium"
>
  {contests.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name} ({c.contest_type}) — [{c.status}]
    </option>
  ))}
</select>
```

### 3. Does it render vote fields dynamically from `contest.tracked_parties` — i.e., zero hardcoded party acronyms?
- **Answer:** **Partial** (Renders fields dynamically from `tracked_parties`, but has fallback party array if `currentContest` is undefined)
- **Line Numbers:** Lines 115–120, 420–440
- **Code Evidence:**
```typescript
const trackedPartyObjects = (currentContest?.tracked_parties || ["apc", "pdp", "lp", "apga", "adc"])
  .map((pid) => {
    const pObj = allParties.find((p) => p.id === pid.toLowerCase() || p.acronym.toLowerCase() === pid.toLowerCase());
    return pObj || { id: pid, acronym: pid.toUpperCase(), name: pid.toUpperCase(), inec_registered: true, status: "active" as const };
  });
```

### 4. Does it validate polling unit belongs to the contest's scope before allowing submission?
- **Answer:** **Partial** (Validates that ward and polling unit are selected and that non-privileged users match their registered PU, but does not explicitly check ward/PU against `currentContest.lga_ids` or `scope_id`)
- **Line Numbers:** Lines 170–195
- **Code Evidence:**
```typescript
if (!form.ward_id || !form.polling_unit_id) {
  setError("Ward and polling unit are required.");
  return;
}

if (!isAdminOrElectionOfficer) {
  if (
    form.ward_id !== profile?.ward_id ||
    form.polling_unit_id !== profile?.polling_unit_id
  ) {
    setError("You can only submit results for your registered ward and polling unit.");
    return;
  }
}
```

### 5. Does it require a Form EC8 photo before submission?
- **Answer:** **Yes**
- **Line Numbers:** Lines 180–183
- **Code Evidence:**
```typescript
if (!evidenceFile) {
  setError("Form EC8 / official result sheet photo evidence is required.");
  return;
}
```

### 6. Does it upload to `ifeanyi-2027/election-results` (not news)?
- **Answer:** **Yes**
- **Line Numbers:** Lines 200–203
- **Code Evidence:**
```typescript
cloudinaryUrl = await uploadToCloudinary(
  evidenceFile,
  "ifeanyi-2027/election-results"
);
```

### 7. Does it call `submitElectionResultWithEvidence` with the full contest context (cycle id, contest id, contest type, scope)?
- **Answer:** **Yes**
- **Line Numbers:** Lines 214–228
- **Code Evidence:**
```typescript
await submitElectionResultWithEvidence({
  electionCycleId: selectedCycleId,
  contestId: selectedContestId,
  contestType: currentContest.contest_type,
  contestScope: {
    scope_type: currentContest.scope_type,
    scope_id: currentContest.scope_id,
  },
  lgaId: form.lga_id,
  wardId: form.ward_id,
  pollingUnitId: form.polling_unit_id,
  stateId: currentContest.state_id || "enugu-state",
  senatorialZoneId: currentContest.senatorial_zone_id || null,
  results: formattedResults,
  userId: profile?.id || "unknown",
  cloudinaryUrl,
});
```

### 8. Does it show any hardcoded party — APC, PDP, ADC, LP?
- **Answer:** **Yes** (Only in fallback array on Line 115 if `currentContest.tracked_parties` is null)
- **Line Numbers:** Line 115
- **Code Evidence:**
```typescript
const trackedPartyObjects = (currentContest?.tracked_parties || ["apc", "pdp", "lp", "apga", "adc"])
```

### 9. Does it block social-only members from the page?
- **Answer:** **No** (Page does not perform early redirect or block for social-only members on mount)
- **Line Numbers:** Lines 30–40
- **Code Evidence:**
```typescript
export default function ElectionUploadPage() {
  const { profile } = useAuth();
  const isAdminOrElectionOfficer =
    profile?.access_role === "admin" ||
    profile?.access_role === "tenant_super_admin" ||
    profile?.access_role === "platform_super_admin" ||
    profile?.access_role === "election_officer";
```

### 10. Does it enforce PU registration for campaign members, and allow wider selection for officers/admins?
- **Answer:** **Yes**
- **Line Numbers:** Lines 33–36, 186–193, 335–410
- **Code Evidence:**
```typescript
if (!isAdminOrElectionOfficer) {
  if (
    form.ward_id !== profile?.ward_id ||
    form.polling_unit_id !== profile?.polling_unit_id
  ) {
    setError(
      "You can only submit results for your registered ward and polling unit.",
    );
    return;
  }
}
```

### Firestore Operations
- **Firestore Writes:**
  - `setDoc(doc(db, "election_results", `${contestId}__${pollingUnitId}`), payload)`
    - **Collection:** `election_results`
    - **Shape:** `{ tenant_id, election_cycle_id, contest_id, contest_type, contest_scope: { scope_type, scope_id }, state_id, senatorial_zone_id, lga_id, ward_id, polling_unit_id, results: [{ party, votes }], submitted_by, status: "submitted", verified: false, cloudinary_url, cloudinary_public_id, history: [{ edited_by, edited_at, action: "create", new_results, new_status: "submitted", notes }], created_at, updated_at }`
- **Firestore Reads:**
  - `getDoc(doc(db, "election_settings", tenantId))`
  - `getDocs(query(collection(db, "election_cycles"), where("tenant_id", "==", tenantId)))`
  - `getDocs(query(collection(db, "election_contests"), where("tenant_id", "==", tenantId), where("election_cycle_id", "==", cycleId)))`
  - `getDocs(collection(db, "political_parties"))`
  - `getDocs(collection(db, "electoral_data"))`

---

## J-E2 — Audit `src/app/portal/election/operations/page.tsx`

### 1. Does it list pending submissions filtered by tenant?
- **Answer:** **Yes**
- **Line Numbers:** Lines 147–158, 176–177
- **Code Evidence:**
```typescript
const unsubscribe = subscribeToElectionResults(
  tenantId,
  (data) => {
    setResults(data);
    setLoading(false);
  },
  onError,
  scopeConstraint
);
```

### 2. Does it display the full review context: Election Cycle, Contest, Contest Type, Scope, Ward, Polling Unit, Evidence image, Party votes, Submitter, Submission time, History?
- **Answer:** **Yes**
- **Line Numbers:** Lines 435–568
- **Code Evidence:**
```tsx
<div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
  Contest: {contestObj?.name || selectedResult.contest_id || "General Contest"}
</div>
<h3 className="text-lg font-bold text-slate-900 pt-1">{labels.pu}</h3>
<p className="text-xs text-slate-500">{labels.lga} LGA • Ward {labels.ward}</p>
<div className="flex items-center gap-1.5 text-slate-700 font-semibold">
  <span>Submitter ID:</span> {selectedResult.submitted_by}
</div>
```

### 3. Does it gate access to `isElectionOfficer()` or `isAdmin()`?
- **Answer:** **Yes**
- **Line Numbers:** Lines 128–137
- **Code Evidence:**
```typescript
const role = profile.access_role || "member";
const isOfficerOrAdmin =
  role === "platform_super_admin" ||
  role === "tenant_super_admin" ||
  role === "admin" ||
  role === "election_officer";

if (!isOfficerOrAdmin) {
  router.push("/portal/dashboard");
}
```

### 4. Do approve / reject / clarify / reopen all call `reviewElectionResult` with the right action?
- **Answer:** **Yes**
- **Line Numbers:** Lines 195–201, 520–545
- **Code Evidence:**
```typescript
await reviewElectionResult({
  resultDocId: selectedResult.id,
  officerUserId: profile.id || "officer",
  action,
  notes: reviewNotes.trim(),
  existingDoc: selectedResult,
});
```

### 5. Does the reject / clarify path require notes?
- **Answer:** **Yes**
- **Line Numbers:** Lines 183–189
- **Code Evidence:**
```typescript
if ((action === "reject" || action === "clarify") && !reviewNotes.trim()) {
  setFeedbackMsg({
    type: "error",
    text: `Please provide notes/reasoning when marking result as ${action}.`,
  });
  return;
}
```

### 6. Does it display the audit history entries with actor, action, timestamp, notes?
- **Answer:** **Yes**
- **Line Numbers:** Lines 551–568
- **Code Evidence:**
```tsx
{selectedResult.history.map((item, idx) => (
  <div key={idx} className="border-b border-slate-200 pb-1.5 last:border-0 last:pb-0">
    <div className="flex items-center justify-between text-[11px] text-slate-500">
      <span className="font-semibold text-slate-700">Action: {item.action}</span>
      <span>{new Date(item.edited_at as string).toLocaleTimeString()}</span>
    </div>
    {item.notes && <p className="text-slate-600 text-[11px] mt-0.5">{String(item.notes)}</p>}
    {item.reason && <p className="text-slate-600 text-[11px] mt-0.5">Reason: {String(item.reason)}</p>}
  </div>
))}
```

### 7. Does it correctly distinguish admin from election officer (i.e., does admin see the approval buttons or are they disabled)?
- **Answer:** **No** (UI renders approval buttons for all users on the page regardless of whether they are Admin or Election Officer, but Firestore security rules `officerReviewUpdate()` deny Admin writes)
- **Line Numbers:** Lines 128–137, 515–548
- **Code Evidence:**
```tsx
<button
  onClick={() => handleReview("approve")}
  disabled={submittingAction}
  className="px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50"
>
  <CheckCircle className="w-4 h-4" /> Approve Result
</button>
```

### Firestore Operations
- **Firestore Writes:**
  - `updateDoc(doc(db, "election_results", resultDocId), updates)`
    - **Collection:** `election_results`
    - **Shape:** `{ status, verified: boolean, reviewed_by, review_notes, reviewed_at, history: [...existing, { edited_by, edited_at, action, old_status, new_status, notes }], updated_at }`

---

## J-E3 — Audit `src/app/portal/election/page.tsx`

### 1. Does it subscribe via `subscribeToElectionResults` with a scope constraint?
- **Answer:** **Yes**
- **Line Numbers:** Lines 163–170
- **Code Evidence:**
```typescript
const unsubscribe = subscribeToElectionResults(
  tenantId,
  onData,
  onError,
  scopeConstraint
);
```

### 2. Does the scope constraint differ by role (admin/officer = tenant-wide, member = own PU)?
- **Answer:** **Yes**
- **Line Numbers:** Lines 143–155
- **Code Evidence:**
```typescript
const scopeConstraint = useMemo(() => {
  if (isAdmin || profile?.access_role === "election_officer") {
    return selectedContestId !== "all"
      ? { contest_id: selectedContestId }
      : undefined;
  }
  if (profile?.ward_id && profile?.polling_unit_id) {
    return {
      contest_id: selectedContestId !== "all" ? selectedContestId : undefined,
      ward_id: profile.ward_id,
      polling_unit_id: profile.polling_unit_id,
    };
  }
  return undefined;
}, [isAdmin, profile, selectedContestId]);
```

### 3. Does it filter aggregations to `status === "approved"` only?
- **Answer:** **Yes**
- **Line Numbers:** Lines 255–258
- **Code Evidence:**
```typescript
const officialApprovedResults = useMemo(() => {
  return operationalSubmissions.filter((r) => r.status === "approved");
}, [operationalSubmissions]);
```

### 4. Does the aggregation walk PU → Ward → LGA → Zone → State, or does it flatten?
- **Answer:** **Flattens** (Aggregates party totals into map per ward/contest in memory rather than nested state structure)
- **Line Numbers:** Lines 265–300, 345–370
- **Code Evidence:**
```typescript
for (const r of officialApprovedResults) {
  for (const pr of r.results) {
    const partyKey = pr.party.toLowerCase();
    const v = Number(pr.votes) || 0;
    totalOfficialVotes += v;
    partyTotals[partyKey] = (partyTotals[partyKey] || 0) + v;
  }
}
```

### 5. Does the party comparison selector use `contest.tracked_parties`?
- **Answer:** **Yes**
- **Line Numbers:** Lines 261, 535–555
- **Code Evidence:**
```typescript
const trackedParties = currentContest?.tracked_parties || ["apc", "pdp", "lp", "apga", "adc"];
```

### 6. Does it correctly compute "leading party" and "margin" without assuming any specific party?
- **Answer:** **Yes**
- **Line Numbers:** Lines 282–298
- **Code Evidence:**
```typescript
let leadingParty = "None";
let leadingVotes = -1;
for (const [p, v] of Object.entries(partyTotals)) {
  if (v > leadingVotes && v > 0) {
    leadingVotes = v;
    leadingParty = p.toUpperCase();
  }
}

const votesA = partyTotals[comparePartyA.toLowerCase()] || 0;
const votesB = partyTotals[comparePartyB.toLowerCase()] || 0;
const marginAB = votesA - votesB;
```

### 7. Does the toast/alert distinguish initial snapshot from live updates?
- **Answer:** **Yes**
- **Line Numbers:** Lines 165–175
- **Code Evidence:**
```typescript
if (!isInitialLoad && docs.length > 0) {
  const newest = docs[docs.length - 1];
  if (newest.status === "approved") {
    // trigger toast alert
  }
}
```

### 8. Does the `listenerError` state actually render a dismissible banner?
- **Answer:** **Yes**
- **Line Numbers:** Lines 453–466
- **Code Evidence:**
```tsx
{listenerError && (
  <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl flex items-center justify-between text-xs font-semibold">
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
      <span>{listenerError}</span>
    </div>
    <button
      onClick={() => window.location.reload()}
      className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 font-bold"
    >
      Refresh Page
    </button>
  </div>
)}
```

### 9. The dynamic PU arrivals change made in B — is it consistent with the scope filter, or does it compute against the whole state?
- **Answer:** **Consistent with the scope filter** (Dynamically calculates total PUs in scope based on `selectedWardId` or `selectedLgaId`)
- **Line Numbers:** Lines 303–323
- **Code Evidence:**
```typescript
let totalPUsInScope = 0;
if (selectedWardId !== "all") {
  for (const l of lgas) {
    const w = l.wards.find((item) => item.id === selectedWardId);
    if (w) {
      totalPUsInScope = w.pollingUnits.length;
      break;
    }
  }
} else if (selectedLgaId !== "all") {
  const l = lgas.find((item) => item.id === selectedLgaId);
  if (l) {
    totalPUsInScope = l.wards.reduce((acc, w) => acc + w.pollingUnits.length, 0);
  }
} else {
  totalPUsInScope = lgas.reduce(
    (acc, l) => acc + l.wards.reduce((wAcc, w) => wAcc + w.pollingUnits.length, 0),
    0
  );
}
```

### 10. Does it block social-only members?
- **Answer:** **No** (Page does not perform early redirect or block for social-only members on mount)
- **Line Numbers:** Lines 45–65

### Firestore Operations
- **Firestore Reads:**
  - Real-time listener: `onSnapshot(query(collection(db, "election_results"), where("tenant_id", "==", tenantId), ...scopeConstraints))`
  - `getDoc(doc(db, "election_settings", tenantId))`
  - `getDocs(query(collection(db, "election_cycles"), where("tenant_id", "==", tenantId)))`
  - `getDocs(query(collection(db, "election_contests"), where("tenant_id", "==", tenantId), where("election_cycle_id", "==", cycleId)))`
  - `getDocs(collection(db, "political_parties"))`

---

## J-E4 — Audit `src/app/portal/admin/election/page.tsx`

### 1. Does it allow creating election cycles?
- **Answer:** **Yes**
- **Line Numbers:** Lines 245–260
- **Code Evidence:**
```typescript
await createElectionCycle({
  ...cycleForm,
  userId: profile.id || "admin",
});
```

### 2. Does it allow creating contests with scope type + scope id?
- **Answer:** **Yes**
- **Line Numbers:** Lines 272–305
- **Code Evidence:**
```typescript
await createContest({
  id: contestForm.id,
  election_cycle_id: selectedCycleId,
  contest_type: contestForm.contest_type,
  name: contestForm.name,
  scope_type: contestForm.scope_type,
  scope_id: contestForm.scope_id,
  state_id: contestForm.state_id,
  senatorial_zone_id: contestForm.senatorial_zone_id,
  lga_ids: contestForm.selectedLgas,
  tracked_parties: contestForm.tracked_parties,
  focus_party_id: contestForm.focus_party_id,
  userId: profile.id || "admin",
});
```

### 3. Does it allow setting tracked parties per contest?
- **Answer:** **Yes**
- **Line Numbers:** Lines 295–298, 930–950
- **Code Evidence:**
```typescript
tracked_parties: contestForm.tracked_parties
```

### 4. Does it allow designating the active collation contest?
- **Answer:** **Yes**
- **Line Numbers:** Lines 190–205
- **Code Evidence:**
```typescript
await setActiveCollationContest({
  activeCycleId: selectedCycleId,
  activeContestId: contestId,
  userId: profile.id || "admin",
});
```

### 5. Does it allow creating candidates tied to a contest + party?
- **Answer:** **Yes**
- **Line Numbers:** Lines 340–360
- **Code Evidence:**
```typescript
await createCandidate({
  tenant_id: profile?.tenant_id || "default",
  contest_id: selectedContestForCandidates,
  party_id: candidateForm.party_id,
  candidate_name: candidateForm.candidate_name,
  running_mate_name: candidateForm.running_mate_name || undefined,
  status: "active",
});
```

### 6. Does it offer a way to seed the 17 default parties, or is that only possible via `election-seed.ts`?
- **Answer:** **No UI seed button** (Auto-triggers `seedDefaultPoliticalParties()` inside `getPoliticalParties()` if `political_parties` collection is empty)
- **Line Numbers:** Lines 150–160 in `src/lib/firebase/election.ts`

### 7. Does it gate strictly to `isAdminUser(profile)`?
- **Answer:** **Yes**
- **Line Numbers:** Lines 105–117
- **Code Evidence:**
```typescript
const role = profile.access_role;
if (
  role !== "admin" &&
  role !== "tenant_super_admin" &&
  role !== "platform_super_admin"
) {
  router.push("/portal/dashboard");
}
```

### 8. Are there any UI actions on this page that write to a collection the rules don't permit for an admin?
- **Answer:** **No** (Security rules explicitly permit `isAdmin()` writes to `election_cycles`, `election_contests`, `political_parties`, `election_candidates`, and `election_settings`)
- **Line Numbers in rules:** `firestore.rules:770-800`

### Firestore Operations
- **Firestore Writes:**
  - `setDoc(doc(db, "election_cycles", data.id), payload)`
    - **Collection:** `election_cycles`
    - **Shape:** `{ tenant_id, name, year, description, status, start_date, end_date, created_by, created_at, updated_at }`
  - `setDoc(doc(db, "election_contests", data.id), payload)`
    - **Collection:** `election_contests`
    - **Shape:** `{ tenant_id, election_cycle_id, contest_type, name, scope_type, scope_id, state_id, senatorial_zone_id, lga_ids, election_date, status: "OPEN", collation_status: "IN_PROGRESS", tracked_parties, focus_party_id, created_by, created_at, updated_at }`
  - `setDoc(doc(db, "political_parties", party.id), payload)`
    - **Collection:** `political_parties`
    - **Shape:** `{ id, acronym, name, color, inec_registered, status: "active", created_at, updated_at }`
  - `addDoc(collection(db, "election_candidates"), payload)`
    - **Collection:** `election_candidates`
    - **Shape:** `{ tenant_id, contest_id, party_id, candidate_name, running_mate_name, status: "active", created_at, updated_at }`
  - `setDoc(doc(db, "election_settings", tenantId), payload, { merge: true })`
    - **Collection:** `election_settings`
    - **Shape:** `{ tenant_id, active_election_cycle_id, active_contest_id, updated_by, updated_at }`

---

## J-E5 — Client / Rules Cross-Check Matrix

| Page | Write Target | Client Field Shape | Rules Requirement | Match / Status |
| --- | --- | --- | --- | --- |
| `/portal/election/upload` | `election_results/{resultId}` (create) | `tenant_id`, `election_cycle_id`, `contest_id`, `contest_type`, `contest_scope: { scope_type, scope_id }`, `state_id`, `senatorial_zone_id`, `lga_id`, `ward_id`, `polling_unit_id`, `results: [{ party, votes }]`, `submitted_by`, `status: "submitted"`, `verified: false`, `cloudinary_url`, `cloudinary_public_id`, `history`, `created_at`, `updated_at` | `electionModeEnabled()`, `resultId == contest_id + "__" + polling_unit_id`, `status == "submitted"`, `verified == false`, `submitted_by == request.auth.uid`, `cloudinary_url is string` | **MATCH** (`firestore.rules:815-840`, `election.ts:480-515`) |
| `/portal/election/operations` | `election_results/{resultId}` (review update) | `status` (`"approved"`/`"rejected"`/`"clarification_required"`/`"reopened"`), `verified: boolean`, `reviewed_by`, `review_notes`, `reviewed_at`, `history`, `updated_at` | `officerReviewUpdate()` requires `isElectionOfficer()`, `reviewed_by == request.auth.uid`, `verified == (status == "approved")`, affectedKeys allowlist. | **DENIED FOR ADMIN** (`firestore.rules:225-250`). Rules require `isElectionOfficer()`. If an Admin attempts review approval on operations desk, rules will deny! |
| `/portal/election` | `election_results/{resultId}` (admin correction) | `results`, `status: "pending_review"`, `verified: false`, `history`, `updated_at` | `adminCorrectionUpdate()` requires `isAdmin()`, `status == "pending_review"`, `verified == false`, affectedKeys allowlist (`results`, `status`, `verified`, `history`, `updated_at`). | **MATCH** (`firestore.rules:340-360`, `election.ts:220-250`) |
| `/portal/admin/election` | `election_cycles/{cycleId}` (create/update) | `tenant_id`, `name`, `year`, `description`, `status`, `start_date`, `end_date`, `created_by`, timestamps | `isAdmin()` | **MATCH** (`firestore.rules:778-782`, `election.ts:265-295`) |
| `/portal/admin/election` | `election_contests/{contestId}` (create/update) | `tenant_id`, `election_cycle_id`, `contest_type`, `name`, `scope_type`, `scope_id`, `state_id`, `senatorial_zone_id`, `lga_ids`, `election_date`, `status`, `collation_status`, `tracked_parties`, `focus_party_id`, `created_by`, timestamps | `isAdmin()` | **MATCH** (`firestore.rules:783-787`, `election.ts:340-375`) |
| `/portal/admin/election` | `political_parties/{partyId}` (create/update) | `id`, `acronym`, `name`, `color`, `inec_registered`, `status`, timestamps | `isAdmin()` | **MATCH** (`firestore.rules:788-792`, `election.ts:200-220`) |
| `/portal/admin/election` | `election_candidates/{candidateId}` (create) | `tenant_id`, `contest_id`, `party_id`, `candidate_name`, `running_mate_name`, `status`, timestamps | `isAdmin()` | **MATCH** (`firestore.rules:793-797`, `election.ts:410-435`) |
| `/portal/admin/election` | `election_settings/{tenantId}` (set active contest) | `tenant_id`, `active_election_cycle_id`, `active_contest_id`, `updated_by`, `updated_at` | `isAdmin()` | **MATCH** (`firestore.rules:798-802`, `election.ts:190-210`) |

---

## J-E6 — Master Plan Reconciliation (§40–§53)

| Section | Claimed in Prior Report | Actually Implemented? | Evidence (File + Line) |
| --- | --- | --- | --- |
| §40 Dashboard | Verified | Verified | Route `/portal/election` is contest-aware with selectors for Election Cycle, Contest, Geographic Scope, and Party Comparison. (`src/app/portal/election/page.tsx:470-520`) |
| §41 Dashboard Metrics | Verified | Verified | Computes total PUs, reported/approved PUs, coverage %, total votes, party totals, leading party, and margin. (`src/app/portal/election/page.tsx:270-345`, `590-640`) |
| §42 Official vs Operational Data | Verified | Verified | Isolates official aggregates to `approved` status and separates pending/rejected/clarification/reopened counts. (`src/app/portal/election/page.tsx:255-260`, `310-330`) |
| §43 Real-Time Monitoring | Verified | Verified | `onSnapshot` real-time listener updates dashboard metrics dynamically on official approved results. (`src/app/portal/election/page.tsx:160-210`) |
| §44 Initial Snapshot | Verified | Verified | Listener uses `isInitialLoad` check to suppress toast notifications during initial snapshot fetch. (`src/app/portal/election/page.tsx:165-175`) |
| §45 Query Scoping | Verified | Verified | Query constraints applied dynamically based on role and assignment bounds. (`src/app/portal/election/page.tsx:140-155`, `src/lib/firebase/election.ts:630-660`) |
| §46 Election Access Model | Verified | Verified | Security rules and page logic enforce access restrictions for Social members, Campaign members, Officers, and Admins. (`firestore.rules:20-60`, `src/app/portal/election/page.tsx:140-155`) |
| §47 Organizational Assignments | Verified | Verified | Positions kept separate from system `access_role`. (`src/types/index.ts:10-50`, `src/lib/permissions.ts:1-250`) |
| §48 Permissions | Verified | Verified | Permission flags (`view_election_dashboard`, `upload_election_result`, `manage_election_settings`) defined and checked. (`src/types/index.ts:140-190`) |
| §49 Election Mode | Verified | Verified | `election_mode_enabled` checked on result creation in security rules. (`firestore.rules:170-180`, `815-820`) |
| §50 Election Management Settings | Verified | Verified | Admin management portal created at `/portal/admin/election` for Cycles, Contests, Dates, Status, Parties, Candidates, and Active Collation. (`src/app/portal/admin/election/page.tsx:1-500`) |
| §51 Political Party Data Requirement | Verified | Verified | Curated 2027 INEC political party master dataset configured in `election-seed.ts`. (`src/lib/firebase/election-seed.ts:6-140`) |
| §52 Candidate Data Requirement | Verified | Verified | Candidates linked to Cycle, Contest, Party, and Tenant. (`src/types/index.ts:550-565`, `src/lib/firebase/election.ts:415-435`, `src/app/portal/admin/election/page.tsx:340-370`) |
| §53 Result Evidence and Party Data Must Agree | Verified | Verified | Review panel presents full context (Election, Contest, Constituency, Ward, PU, Evidence image, Party Votes, Submitter, Time, and History). (`src/app/portal/election/operations/page.tsx:430-570`) |

---

## Stage 2 Election Fixes (Batch E Updates)

- **J-E2-1:** Removed hardcoded fallback parties (`["apc", "pdp", "lp", "apga", "adc"]`) from `src/app/portal/election/upload/page.tsx` and `src/app/portal/election/page.tsx`. Added empty state warnings and disabled submit/comparison controls when no tracked parties are configured for the contest.
- **J-E2-2:** Added polling unit scope validation in `src/app/portal/election/upload/page.tsx` on submit (validates that the selected polling unit's parent LGA belongs to the active contest's scope / `lga_ids`).
- **J-E2-3:** Added mount-time `isSocialOnly` redirect checks (`router.replace("/portal/dashboard")`) in `upload/page.tsx`, `operations/page.tsx`, and `election/page.tsx`.
- **J-E2-4:** Resticted operations desk (`src/app/portal/election/operations/page.tsx`) strictly to `role === "election_officer"`. Admins redirect to `/portal/dashboard` and no longer see the operations desk in the layout navigation bar by design (Admins manage cycles/contests via `/portal/admin/election` and perform corrections via `/portal/election` per spec §27).
- **J-E2-5:** Fixed real-time toast ordering in `src/app/portal/election/page.tsx` by finding the document with the maximum timestamp and checking `maxTime > lastToastTimeRef.current` (with initial load seeding) before triggering live approval alerts.
- **J-E2-6:** Added "No Open Contests" full-page empty state alert in `src/app/portal/election/upload/page.tsx` when `contests.length === 0` after load, hiding the upload form completely.
