import { describe, expect, it } from "vitest";

import { PlanStore } from "../src/planning/plan-store.js";

describe("PlanStore", () => {
  it("requires the exact digest, confirmation, and approving actor", () => {
    const store = new PlanStore();
    const plan = store.create({
      kind: "upsert",
      destinationSiteId: "site-1",
      ttlMinutes: 30,
    });

    expect(() =>
      store.approve(plan.planId, "wrong", "account-1", "I approve this exact plan"),
    ).toThrow(/digest/u);
    expect(() => store.requireApproval(plan.planId, "upsert", "account-1")).toThrow(
      /not been explicitly approved/u,
    );

    store.approve(plan.planId, plan.digest, "account-1", "I approve this exact plan");
    expect(store.requireApproval(plan.planId, "upsert", "account-1").plan).toEqual(plan);
    expect(() => store.requireApproval(plan.planId, "upsert", "account-2")).toThrow(
      /signed-in account/u,
    );
  });

  it("does not accept approval for a different plan kind", () => {
    const store = new PlanStore();
    const plan = store.create({
      kind: "schema",
      destinationSiteId: "site-1",
      ttlMinutes: 30,
    });

    store.approve(plan.planId, plan.digest, "account-1", "I approve this exact plan");
    expect(() => store.requireApproval(plan.planId, "upsert", "account-1")).toThrow(
      /expected upsert/u,
    );
  });

  it("consumes approvals so an apply cannot be replayed", () => {
    const store = new PlanStore();
    const plan = store.create({
      kind: "upsert",
      destinationSiteId: "site-1",
      ttlMinutes: 30,
    });
    store.approve(plan.planId, plan.digest, "account-1", "I approve this exact plan");
    expect(store.consumeApproval(plan.planId, "upsert", "account-1").plan.planId).toBe(plan.planId);
    expect(() => store.consumeApproval(plan.planId, "upsert", "account-1")).toThrow(
      /already been applied/u,
    );
  });
});
