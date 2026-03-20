import {
  OPENAPI_CONTRACT_PATH,
  POSTMAN_COLLECTION_PATH,
  RUNTIME_ROUTES_PATH,
  buildRuntimeRouteSnapshot,
  readJson,
  writeStableJson
} from "./api-contract-utils.mjs";

async function main() {
  const contract = await readJson(OPENAPI_CONTRACT_PATH);
  const postmanCollection = await readJson(POSTMAN_COLLECTION_PATH);
  const runtimeRoutes = await buildRuntimeRouteSnapshot();

  const updates = [];

  if (await writeStableJson(OPENAPI_CONTRACT_PATH, contract)) {
    updates.push("apps/api/openapi/openapi.json");
  }

  if (await writeStableJson(POSTMAN_COLLECTION_PATH, postmanCollection)) {
    updates.push("docs/lia-clinic-api.postman_collection.json");
  }

  if (await writeStableJson(RUNTIME_ROUTES_PATH, runtimeRoutes)) {
    updates.push("apps/api/openapi/runtime-routes.json");
  }

  if (updates.length === 0) {
    console.log("API contract artifacts are already synchronized");
    return;
  }

  console.log("Updated API contract artifacts:");
  for (const update of updates) {
    console.log(`- ${update}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
