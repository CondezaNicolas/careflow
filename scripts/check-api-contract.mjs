import {
  OPENAPI_CONTRACT_PATH,
  POSTMAN_COLLECTION_PATH,
  RUNTIME_ROUTES_PATH,
  buildRuntimeRouteSnapshot,
  diffOperations,
  getOpenApiOperations,
  getPostmanOperations,
  readJson,
  toOperationKey
} from "./api-contract-utils.mjs";

async function main() {
  const contract = await readJson(OPENAPI_CONTRACT_PATH);
  const postmanCollection = await readJson(POSTMAN_COLLECTION_PATH);
  const runtimeRouteSnapshot = await readJson(RUNTIME_ROUTES_PATH);
  const currentRuntimeRouteSnapshot = await buildRuntimeRouteSnapshot();

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
  assertRuntimeSnapshotCurrent(runtimeRouteSnapshot, currentRuntimeRouteSnapshot);
  assertOpenApiMatchesRuntime(contract, runtimeRouteSnapshot);
  assertPostmanRequestsMatchOpenApi(contract, postmanCollection);

  console.log(
    `API contract lint passed (${runtimeRouteSnapshot.operations.length} runtime operations, ${getPostmanOperations(postmanCollection).length} Postman requests)`
  );
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

function assertRuntimeSnapshotCurrent(expectedSnapshot, currentSnapshot) {
  const diff = diffOperations(expectedSnapshot.operations ?? [], currentSnapshot.operations ?? []);

  if (diff.missing.length === 0 && diff.extra.length === 0) {
    return;
  }

  throw new Error(
    [
      "Runtime route snapshot is stale. Run npm run contract:sync.",
      ...formatOperationDiff("Missing from snapshot", diff.missing),
      ...formatOperationDiff("Unexpected in snapshot", diff.extra)
    ].join("\n")
  );
}

function assertOpenApiMatchesRuntime(contract, runtimeSnapshot) {
  const diff = diffOperations(runtimeSnapshot.operations ?? [], getOpenApiOperations(contract));

  if (diff.missing.length === 0 && diff.extra.length === 0) {
    return;
  }

  throw new Error(
    [
      "OpenAPI contract drift detected against runtime controllers.",
      ...formatOperationDiff("Missing from apps/api/openapi/openapi.json", diff.missing),
      ...formatOperationDiff("Documented but not implemented", diff.extra)
    ].join("\n")
  );
}

function assertPostmanRequestsMatchOpenApi(contract, postmanCollection) {
  const documentedOperations = getOpenApiOperations(contract);
  const unknownRequests = getPostmanOperations(postmanCollection).filter(
    (operation) =>
      !documentedOperations.some(
        (documentedOperation) =>
          documentedOperation.method === operation.method &&
          matchesDocumentedPath(documentedOperation.path, operation.path)
      )
  );

  if (unknownRequests.length === 0) {
    return;
  }

  throw new Error(
    [
      "Postman collection references undocumented API operations.",
      ...unknownRequests.map(
        (operation) =>
          `- ${toOperationKey(operation)}${operation.name ? ` (${operation.name})` : ""}`
      )
    ].join("\n")
  );
}

function matchesDocumentedPath(documentedPath, concretePath) {
  const documentedSegments = documentedPath.split("/").filter(Boolean);
  const concreteSegments = concretePath.split("/").filter(Boolean);

  if (documentedSegments.length !== concreteSegments.length) {
    return false;
  }

  return documentedSegments.every((segment, index) => {
    if (segment.startsWith("{") && segment.endsWith("}")) {
      return concreteSegments[index].length > 0;
    }

    return segment === concreteSegments[index];
  });
}

function formatOperationDiff(label, operations) {
  if (operations.length === 0) {
    return [];
  }

  return [label, ...operations.map((operation) => `- ${toOperationKey(operation)}`)];
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
