import { randomUUID } from "node:crypto";

import type { Approval, ChangePlan, PlanKind, PlannedChange } from "../domain/models.js";
import { digestCanonical } from "../domain/identity.js";

export interface CreatePlanInput {
  kind: PlanKind;
  destinationSiteId: string;
  ttlMinutes: number;
  changes?: PlannedChange[];
  schemaOperations?: Array<Record<string, unknown>>;
}

export class PlanStore {
  readonly #plans = new Map<string, ChangePlan>();
  readonly #approvals = new Map<string, Approval>();
  readonly #consumed = new Set<string>();

  create(input: CreatePlanInput): ChangePlan {
    const planId = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + input.ttlMinutes * 60_000);
    const unsigned = {
      planId,
      kind: input.kind,
      destinationSiteId: input.destinationSiteId,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      changes: input.changes ?? [],
      schemaOperations: input.schemaOperations ?? [],
    };
    const plan: ChangePlan = { ...unsigned, digest: digestCanonical(unsigned) };
    this.#plans.set(plan.planId, plan);
    return plan;
  }

  get(planId: string, expectedKind?: PlanKind): ChangePlan {
    const plan = this.#plans.get(planId);
    if (!plan) throw new Error(`Unknown plan: ${planId}`);
    if (expectedKind && plan.kind !== expectedKind) {
      throw new Error(`Plan ${planId} is ${plan.kind}, expected ${expectedKind}`);
    }
    if (new Date(plan.expiresAt).getTime() <= Date.now()) {
      throw new Error(`Plan ${planId} expired at ${plan.expiresAt}; generate a new preview`);
    }
    return plan;
  }

  approve(planId: string, digest: string, actor: string, confirmation: string): Approval {
    const plan = this.get(planId);
    if (digest !== plan.digest) throw new Error("Approval digest does not match the current plan");
    if (confirmation !== "I approve this exact plan") {
      throw new Error('Confirmation must exactly equal "I approve this exact plan"');
    }
    const approval: Approval = {
      planId,
      digest,
      approvedBy: actor,
      approvedAt: new Date().toISOString(),
      confirmation,
    };
    this.#approvals.set(planId, approval);
    return approval;
  }

  requireApproval(
    planId: string,
    kind: PlanKind,
    actor: string,
  ): {
    plan: ChangePlan;
    approval: Approval;
  } {
    const plan = this.get(planId, kind);
    if (this.#consumed.has(planId)) {
      throw new Error(`Plan ${planId} has already been applied; generate a new preview`);
    }
    const approval = this.#approvals.get(planId);
    if (!approval) throw new Error(`Plan ${planId} has not been explicitly approved`);
    if (approval.digest !== plan.digest)
      throw new Error("Approval is stale because the plan changed");
    if (approval.approvedBy !== actor) {
      throw new Error("The signed-in account does not match the account that approved the plan");
    }
    return { plan, approval };
  }

  consumeApproval(
    planId: string,
    kind: PlanKind,
    actor: string,
  ): { plan: ChangePlan; approval: Approval } {
    const approved = this.requireApproval(planId, kind, actor);
    this.#consumed.add(planId);
    return approved;
  }
}
