import { createInterface } from "node:readline/promises";

import { MsalDeviceCodeTokenProvider } from "../auth/msal-token-provider.js";
import { loadRuntimeConfig } from "../config/runtime.js";
import { UiEvidenceService } from "../service/ui-evidence-service.js";

const config = loadRuntimeConfig();
const service = new UiEvidenceService(config, {
  tokenProvider: new MsalDeviceCodeTokenProvider(config),
});
const plan = await service.previewSchema();
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

if (plan.schemaOperations.length === 0) {
  process.stdout.write("Destination schema is already current.\n");
  process.exit(0);
}

const readline = createInterface({ input: process.stdin, output: process.stdout });
const answer = await readline.question(
  'Review the diff above. Type "I approve this exact plan" to create missing lists/columns: ',
);
readline.close();

if (answer !== "I approve this exact plan") {
  process.stderr.write("Schema plan was not approved; no changes were made.\n");
  process.exitCode = 1;
} else {
  await service.approvePlan(plan.planId, plan.digest, answer);
  const result = await service.applySchema(plan.planId);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "succeeded") process.exitCode = 1;
}
