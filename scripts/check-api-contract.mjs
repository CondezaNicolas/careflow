import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const contractPath = resolve("apps/api/openapi/openapi.json");

async function main() {
  const raw = await readFile(contractPath, "utf8");
  const contract = JSON.parse(raw);

  if (!contract.openapi || !String(contract.openapi).startsWith("3.")) {
    throw new Error("OpenAPI version must be 3.x");
  }

  if (!contract.paths || Object.keys(contract.paths).length === 0) {
    throw new Error("Contract must define at least one endpoint");
  }

  if (!contract.components?.schemas?.ErrorEnvelope) {
    throw new Error("Contract must include ErrorEnvelope schema");
  }

  assertCriticalEndpoints(contract.paths);
  assertSchedulingWriteIdempotency(contract.paths);
  assertCriticalFailureResponses(contract.paths);

  console.log("API contract lint passed");
}

function assertCriticalEndpoints(paths) {
  const required = [
    ["/auth/login", "post"],
    ["/auth/refresh", "post"],
    ["/auth/logout", "post"],
    ["/health/live", "get"],
    ["/health/ready", "get"],
    ["/ops/outbox/health", "get"],
    ["/ops/metrics", "get"],
    ["/ops/diagnostics", "get"],
    ["/scheduling/appointments", "post"],
    ["/scheduling/appointments/{id}/reschedule", "post"],
    ["/scheduling/appointments/{id}/cancel", "post"],
    ["/clinical/encounters/{encounterId}/notes", "post"],
    ["/clinical/patients/{patientId}/timeline", "get"],
    ["/patient-portal/patients/{patientId}/overview", "get"]
  ];

  for (const [path, method] of required) {
    if (!paths[path]?.[method]) {
      throw new Error(`Contract missing critical operation: ${method.toUpperCase()} ${path}`);
    }
  }
}

function assertSchedulingWriteIdempotency(paths) {
  const writePaths = [
    "/scheduling/appointments",
    "/scheduling/appointments/{id}/reschedule",
    "/scheduling/appointments/{id}/cancel"
  ];

  for (const path of writePaths) {
    const operation = paths[path]?.post;
    const idempotency = operation?.parameters?.find(
      (parameter) => parameter.in === "header" && parameter.name === "idempotency-key"
    );

    if (!idempotency) {
      throw new Error(`Contract missing idempotency-key header on POST ${path}`);
    }

    if (idempotency.required !== true || idempotency.schema?.type !== "string") {
      throw new Error(`Invalid idempotency-key header contract on POST ${path}`);
    }
  }
}

function assertCriticalFailureResponses(paths) {
  const requiredFailures = {
    "/auth/login": ["400", "401", "429"],
    "/auth/refresh": ["400", "401", "429"],
    "/auth/logout": ["400", "401", "429"],
    "/ops/outbox/health": ["403"],
    "/ops/metrics": ["403"],
    "/ops/diagnostics": ["403"],
    "/scheduling/appointments": ["400"],
    "/scheduling/appointments/{id}/reschedule": ["400", "404"],
    "/scheduling/appointments/{id}/cancel": ["400", "404"],
    "/patient-portal/patients/{patientId}/overview": ["403"]
  };

  for (const [path, statusCodes] of Object.entries(requiredFailures)) {
    const operation = paths[path]?.["get"] ?? paths[path]?.["post"];
    const responses = operation?.responses ?? {};

    for (const statusCode of statusCodes) {
      const schemaRef = responses[statusCode]?.content?.["application/json"]?.schema?.$ref;
      if (schemaRef !== "#/components/schemas/ErrorEnvelope") {
        throw new Error(`Missing ErrorEnvelope response for ${statusCode} on ${path}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
