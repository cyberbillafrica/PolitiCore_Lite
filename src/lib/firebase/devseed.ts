"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./config";

export async function seedCampaignTestAssignments(adminUid: string) {
  const assignments = [
    {
      tenant_id: "ifeanyi-2027",
      user_id: "ddt7T3r3MXaWlJwi11D7Gnm0vqp1",
      position: "campaign_member",
      scope_type: "ward",
      scope_id: "nkanu-west-ward-01",
      status: "active",
      assigned_by: adminUid,
    },

    {
      tenant_id: "ifeanyi-2027",
      user_id: "ddt7T3r3MXaWlJwi11D7Gnm0vqp1",
      position: "ward_coordinator",
      scope_type: "ward",
      scope_id: "nkanu-west-ward-01",
      status: "active",
      assigned_by: adminUid,
    },

    {
      tenant_id: "ifeanyi-2027",
      user_id: "ddt7T3r3MXaWlJwi11D7Gnm0vqp1",
      position: "lga_coordinator",
      scope_type: "lga",
      scope_id: "nkanu-west",
      status: "active",
      assigned_by: adminUid,
    },
  ];

  const createdIds: string[] = [];

  for (const assignment of assignments) {
    const ref = await addDoc(collection(db, "organizational_assignments"), {
      ...assignment,
      assigned_at: serverTimestamp(),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    createdIds.push(ref.id);
  }

  return createdIds;
}

