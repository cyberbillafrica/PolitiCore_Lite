import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  activityReadScopes,
  groupScopeQueries,
  type ViewerArea,
} from "@/lib/campaign-read-scope";
import type { CampaignScope } from "@/lib/campaign-scope";

import {
  LGA,
  OTHER_LGA,
  OTHER_PU,
  OTHER_WARD,
  OTHER_ZONE,
  PU_001,
  PU_002,
  STATE,
  WARD_01,
  WARD_02,
  ZONE,
  anonDb,
  authAs,
  queryByScopes,
  seedActivity,
  seedBaselineAccess,
  seedCoordinatorAccess,
  seedUser,
} from "./helpers";
import { clearDb, getTestEnv, initTestEnv } from "./setup";

const AREA: ViewerArea = {
  polling_unit_id: PU_001,
  ward_id: WARD_01,
  lga_id: LGA,
};

const PU_SCOPE: CampaignScope = {
  level: "polling_unit",
  scope_id: PU_001,
  label: "PU 001",
  lgaIds: [LGA],
  wardIds: [WARD_01],
  pollingUnitIds: [PU_001],
};

const WARD_SCOPE: CampaignScope = {
  level: "ward",
  scope_id: WARD_01,
  label: "Ward 01",
  lgaIds: [LGA],
  wardIds: [WARD_01],
  pollingUnitIds: [PU_001, PU_002],
};

const LGA_SCOPE: CampaignScope = {
  level: "lga",
  scope_id: LGA,
  label: "Nkanu West LGA",
  lgaIds: [LGA],
  wardIds: [WARD_01, WARD_02],
  pollingUnitIds: [],
};

const activities = {
  pu: "activity-pu-own",
  ward: "activity-ward-own",
  lga: "activity-lga-own",
  zone: "activity-zone-own",
  state: "activity-state",
  otherWard: "activity-other-ward",
  otherLga: "activity-other-lga",
  puOtherWard: "activity-pu-other-ward",
};

async function seedActivities(): Promise<void> {
  await seedActivity({
    id: activities.pu,
    scope_type: "polling_unit",
    scope_id: PU_001,
    scope_ward_id: WARD_01,
    scope_chain: [STATE, ZONE, LGA, WARD_01, PU_001],
    visibility_pu_ids: [PU_001],
  });

  await seedActivity({
    id: activities.ward,
    scope_type: "ward",
    scope_id: WARD_01,
    scope_ward_id: WARD_01,
    scope_chain: [STATE, ZONE, LGA, WARD_01],
    visibility_ward_ids: [WARD_01],
  });

  await seedActivity({
    id: activities.lga,
    scope_type: "lga",
    scope_id: LGA,
    scope_chain: [STATE, ZONE, LGA],
  });

  await seedActivity({
    id: activities.zone,
    scope_type: "senatorial_zone",
    scope_id: ZONE,
    scope_chain: [STATE, ZONE],
  });

  await seedActivity({
    id: activities.state,
    scope_type: "state",
    scope_id: STATE,
    scope_chain: [STATE],
  });

  await seedActivity({
    id: activities.otherWard,
    scope_type: "ward",
    scope_id: WARD_02,
    scope_ward_id: WARD_02,
    scope_chain: [STATE, ZONE, LGA, WARD_02],
    visibility_ward_ids: [WARD_02],
  });

  await seedActivity({
    id: activities.otherLga,
    scope_type: "ward",
    scope_id: OTHER_WARD,
    scope_ward_id: OTHER_WARD,
    scope_chain: [STATE, OTHER_ZONE, OTHER_LGA, OTHER_WARD],
    visibility_ward_ids: [OTHER_WARD],
  });

  await seedActivity({
    id: activities.puOtherWard,
    scope_type: "polling_unit",
    scope_id: PU_002,
    scope_ward_id: WARD_02,
    scope_chain: [STATE, ZONE, LGA, WARD_02, PU_002],
    visibility_pu_ids: [PU_002],
  });
}

function readOwnWard(db: Firestore, wardId = WARD_01) {
  return getDocs(
    query(
      collection(db, "campaign_activities"),
      where("scope_type", "==", "ward"),
      where("scope_id", "==", wardId),
    ),
  );
}

describe("campaign_activities reads", () => {
  beforeAll(async () => {
    await initTestEnv();
  });

  afterAll(async () => {
    await getTestEnv().cleanup();
  });

  beforeEach(async () => {
    await clearDb();

    await seedUser("chika", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("chika", PU_001, WARD_01, LGA, ZONE);

    await seedUser("ward-coord", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("ward-coord", PU_001, WARD_01, LGA, ZONE);
    await seedCoordinatorAccess("ward-coord", "ward", WARD_01);

    await seedUser("lga-coord", {
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });
    await seedBaselineAccess("lga-coord", PU_001, WARD_01, LGA, ZONE);
    await seedCoordinatorAccess("lga-coord", "lga", LGA);
    await seedCoordinatorAccess("lga-coord", "ward", WARD_01);
    await seedCoordinatorAccess("lga-coord", "ward", WARD_02);

    await seedUser("admin", {
      access_role: "admin",
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });

    await seedUser("officer", {
      access_role: "election_officer",
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });

    await seedUser("social", {
      membership_types: ["social_member"],
      ward_id: WARD_01,
      polling_unit_id: PU_001,
      lga_id: LGA,
    });

    await seedActivities();
  });

  /* ---------------- plain member ---------------- */

  it("reads exactly the five baseline scopes and nothing else", async () => {
    const db = authAs("chika");
    const { groups } = groupScopeQueries(activityReadScopes(AREA, PU_SCOPE));

    const found = await queryByScopes(db, "campaign_activities", groups);

    expect(Array.from(found.keys()).sort()).toEqual(
      [
        activities.pu,
        activities.ward,
        activities.lga,
        activities.zone,
        activities.state,
      ].sort(),
    );
  });

  it("cannot read another ward in the same LGA", async () => {
    await assertFails(readOwnWard(authAs("chika"), WARD_02));
  });

  it("cannot read a polling unit outside their own", async () => {
    const db = authAs("chika");

    await assertFails(
      getDocs(
        query(
          collection(db, "campaign_activities"),
          where("scope_type", "==", "polling_unit"),
          where("scope_id", "==", PU_002),
        ),
      ),
    );
  });

  it("cannot read a ward in a different LGA", async () => {
    await assertFails(readOwnWard(authAs("chika"), OTHER_WARD));
  });

  it("still cannot run an unfiltered list read", async () => {
    await assertFails(
      getDocs(query(collection(authAs("chika"), "campaign_activities"))),
    );
  });

  /* ---------------- ward coordinator ---------------- */

  it("a ward coordinator reads ward-scoped activities in their ward", async () => {
    await assertSucceeds(readOwnWard(authAs("ward-coord")));
  });

  it("a ward coordinator reads a PU activity inside their ward by ward stamp", async () => {
    const db = authAs("ward-coord");

    const snapshot = await getDocs(
      query(
        collection(db, "campaign_activities"),
        where("scope_type", "==", "polling_unit"),
        where("scope_ward_id", "in", [WARD_01]),
      ),
    );

    expect(snapshot.docs.map((item) => item.id)).toEqual([activities.pu]);
  });

  it("a ward coordinator cannot read a PU activity in another ward", async () => {
    const db = authAs("ward-coord");

    await assertFails(
      getDocs(
        query(
          collection(db, "campaign_activities"),
          where("scope_type", "==", "polling_unit"),
          where("scope_id", "==", PU_002),
        ),
      ),
    );
  });

  /* ---------------- LGA coordinator ---------------- */

  it("an LGA coordinator reads LGA-level activities", async () => {
    const db = authAs("lga-coord");

    await assertSucceeds(
      getDocs(
        query(
          collection(db, "campaign_activities"),
          where("scope_type", "==", "lga"),
          where("scope_id", "==", LGA),
        ),
      ),
    );
  });

  it("an LGA coordinator reads every ward in the LGA", async () => {
    await assertSucceeds(readOwnWard(authAs("lga-coord"), WARD_02));
  });

  it("an LGA coordinator cannot read another LGA's ward", async () => {
    await assertFails(readOwnWard(authAs("lga-coord"), OTHER_WARD));
  });

  /* ---------------- role boundaries ---------------- */

  it("an election officer with no projection cannot read activities", async () => {
    await assertFails(readOwnWard(authAs("officer")));
  });

  it("a social-only member cannot read activities", async () => {
    await assertFails(readOwnWard(authAs("social")));
  });

  it("an admin may read the whole collection unfiltered", async () => {
    const snapshot = await assertSucceeds(
      getDocs(query(collection(authAs("admin"), "campaign_activities"))),
    );

    expect(snapshot.size).toBe(8);
  });

  it("a signed-out client cannot read activities", async () => {
    await assertFails(readOwnWard(anonDb()));
  });
});
