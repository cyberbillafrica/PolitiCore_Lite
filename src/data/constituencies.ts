/*
 * ============================================================
 * CONTEST CONSTITUENCY REFERENCE — ENUGU STATE
 * ============================================================
 *
 * The authoritative boundary for a contest is the `lga_ids` array
 * on the contest document (see `src/lib/election-scope.ts`). This
 * module is the REFERENCE used when a contest does not carry that
 * array — typically a contest created before the contest form
 * captured the LGA set.
 *
 * It maps Enugu State's real constituencies to the LGA ids used by
 * the seeded `electoral_data/enugu-state` document (ids derived
 * from the filenames in /lgas, e.g. "enugu-north", "nkanu-west").
 *
 * Precedence in `resolveContestLgaIds()`:
 *
 *   1. the contest's explicit `lga_ids` (always wins)
 *   2. this reference, matched by scope_type + name / scope_id
 *   3. unrestricted (null) — never guess beyond what is known
 *
 * Matching is done on normalized word sets so that stored names
 * like "2027 Nkanu East / Nkanu West Federal Constituency Election"
 * match the reference entry "Nkanu East / Nkanu West" regardless of
 * word order, separators, year prefixes, or the word "and".
 *
 * State constituencies are intentionally NOT listed here: their
 * composition is captured per contest through the LGA picker in the
 * admin contest form.
 */

export type ConstituencyScopeType =
  | "senatorial_zone"
  | "federal_constituency"
  | "state_constituency";

export interface ConstituencyDefinition {
  scope_type: ConstituencyScopeType;
  /** Human-readable constituency name (INEC naming). */
  name: string;
  /** The LGA ids (seeded electoral_data ids) the constituency covers. */
  lga_ids: string[];
  /** Alternate names or stored scope_ids this entry should also match. */
  aliases?: string[];
}

export const ENUGU_CONSTITUENCIES: ConstituencyDefinition[] = [
  /* ---------------- Senatorial districts (3) ---------------- */
  {
    scope_type: "senatorial_zone",
    name: "Enugu East Senatorial District",
    lga_ids: [
      "enugu-east",
      "enugu-north",
      "enugu-south",
      "isi-uzo",
      "nkanu-east",
      "nkanu-west",
    ],
    aliases: ["enugu-east"],
  },
  {
    scope_type: "senatorial_zone",
    name: "Enugu North Senatorial District",
    lga_ids: [
      "igbo-etiti",
      "igbo-eze-north",
      "igbo-eze-south",
      "nsukka",
      "udenu",
      "uzo-uwani",
    ],
    aliases: ["enugu-north"],
  },
  {
    scope_type: "senatorial_zone",
    name: "Enugu West Senatorial District",
    lga_ids: ["aninri", "awgu", "ezeagu", "oji-river", "udi"],
    aliases: ["enugu-west"],
  },

  /* ------------- Federal constituencies (8) ---------------- */
  {
    scope_type: "federal_constituency",
    name: "Enugu North / Enugu South Federal Constituency",
    lga_ids: ["enugu-north", "enugu-south"],
    aliases: ["enugu-north-and-south-fed", "enugu-north-south"],
  },
  {
    scope_type: "federal_constituency",
    name: "Enugu East / Isi-Uzo Federal Constituency",
    lga_ids: ["enugu-east", "isi-uzo"],
    aliases: ["enugu-east-isi-uzo"],
  },
  {
    scope_type: "federal_constituency",
    name: "Nkanu East / Nkanu West Federal Constituency",
    lga_ids: ["nkanu-east", "nkanu-west"],
    aliases: ["nkanu-east-west-fed"],
  },
  {
    scope_type: "federal_constituency",
    name: "Igbo-Etiti / Uzo-Uwani Federal Constituency",
    lga_ids: ["igbo-etiti", "uzo-uwani"],
    aliases: ["igbo-etiti-uzo-uwani"],
  },
  {
    scope_type: "federal_constituency",
    name: "Igbo-Eze North / Igbo-Eze South Federal Constituency",
    lga_ids: ["igbo-eze-north", "igbo-eze-south"],
    aliases: ["igbo-eze-north-south"],
  },
  {
    scope_type: "federal_constituency",
    name: "Nsukka / Udenu Federal Constituency",
    lga_ids: ["nsukka", "udenu"],
    aliases: ["nsukka-udenu"],
  },
  {
    scope_type: "federal_constituency",
    name: "Ezeagu / Udi Federal Constituency",
    lga_ids: ["ezeagu", "udi"],
    aliases: ["ezeagu-udi"],
  },
  {
    scope_type: "federal_constituency",
    name: "Aninri / Awgu / Oji River Federal Constituency",
    lga_ids: ["aninri", "awgu", "oji-river"],
    aliases: ["aninri-awgu-oji-river"],
  },
];

/*
 * Words that describe the KIND of contest rather than which
 * constituency it is. They are stripped before matching so that
 * "2027 Enugu North and South Federal Constituency Election"
 * matches "Enugu North / Enugu South Federal Constituency".
 */
const STOPWORDS = new Set([
  "and",
  "of",
  "the",
  "fed",
  "federal",
  "constituency",
  "senatorial",
  "district",
  "zone",
  "state",
  "house",
  "assembly",
  "representatives",
  "election",
  "rep",
  "reps",
  "2027",
]);

/**
 * Normalize a contest name / scope_id / alias into a word-set key.
 *
 * Lowercases, treats "&" as "and", strips punctuation and kind
 * words, deduplicates the remaining words and sorts them, so
 * "Nkanu-East/West Fed" and "West Nkanu East" produce the same key.
 */
export function normalizeScopeKey(value: string): string {
  const words = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOPWORDS.has(word));

  return Array.from(new Set(words)).sort().join(" ");
}

function entryKeys(entry: ConstituencyDefinition): string[] {
  return [entry.name, ...(entry.aliases ?? [])].map(normalizeScopeKey);
}

/**
 * Look up the LGA set for a contest from the constituency reference.
 *
 * Matches on scope_type first, then on the contest's name and
 * scope_id against the entry name and its aliases. Returns an empty
 * array when the contest is not a known constituency — callers must
 * treat that as "no reference", never as "covers nothing".
 */
export function lookupConstituencyLgaIds(contest: {
  scope_type?: string | null;
  scope_id?: string | null;
  name?: string | null;
}): string[] {
  const scopeType = String(contest.scope_type ?? "");
  const candidates = ENUGU_CONSTITUENCIES.filter(
    (entry) => entry.scope_type === scopeType,
  );

  const keys = [contest.name ?? "", contest.scope_id ?? ""]
    .map(normalizeScopeKey)
    .filter((key) => key.length > 0);

  if (keys.length === 0) return [];

  for (const entry of candidates) {
    const normalized = entryKeys(entry);
    if (keys.some((key) => normalized.includes(key))) {
      return [...entry.lga_ids];
    }
  }

  return [];
}

/**
 * The reference entry a contest matches, if any. Used by the admin
 * contest form to suggest the constituency's LGAs.
 */
export function lookupConstituency(contest: {
  scope_type?: string | null;
  scope_id?: string | null;
  name?: string | null;
}): ConstituencyDefinition | null {
  const scopeType = String(contest.scope_type ?? "");
  const candidates = ENUGU_CONSTITUENCIES.filter(
    (entry) => entry.scope_type === scopeType,
  );

  const keys = [contest.name ?? "", contest.scope_id ?? ""]
    .map(normalizeScopeKey)
    .filter((key) => key.length > 0);

  if (keys.length === 0) return null;

  for (const entry of candidates) {
    const normalized = entryKeys(entry);
    if (keys.some((key) => normalized.includes(key))) {
      return entry;
    }
  }

  return null;
}
