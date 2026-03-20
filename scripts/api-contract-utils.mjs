import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

export const OPENAPI_CONTRACT_PATH = resolve("apps/api/openapi/openapi.json");
export const POSTMAN_COLLECTION_PATH = resolve("docs/lia-clinic-api.postman_collection.json");
export const RUNTIME_ROUTES_PATH = resolve("apps/api/openapi/runtime-routes.json");

const API_SRC_PATH = resolve("apps/api/src");
const CONTROLLER_FILE_SUFFIX = ".controller.ts";
const HTTP_METHOD = {
  DELETE: "delete",
  GET: "get",
  PATCH: "patch",
  POST: "post",
  PUT: "put"
};

export async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeStableJson(filePath, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  const current = await readFile(filePath, "utf8").catch(() => null);

  if (current === next) {
    return false;
  }

  await writeFile(filePath, next, "utf8");
  return true;
}

export async function buildRuntimeRouteSnapshot() {
  const controllerFiles = await collectControllerFiles(API_SRC_PATH);
  const operations = [];

  for (const filePath of controllerFiles) {
    const fileContent = await readFile(filePath, "utf8");
    const controllerPath = extractControllerPath(fileContent);

    for (const operation of extractControllerOperations(fileContent)) {
      operations.push({
        controller: relative(API_SRC_PATH, filePath).replaceAll("\\", "/"),
        handler: operation.handler,
        method: operation.method,
        path: joinRoutePath(controllerPath, operation.path)
      });
    }
  }

  operations.sort(compareOperation);

  return {
    operations,
    source: "apps/api/src/**/*.controller.ts"
  };
}

export function getOpenApiOperations(contract) {
  const operations = [];

  for (const [path, methods] of Object.entries(contract.paths ?? {})) {
    for (const [method, definition] of Object.entries(methods ?? {})) {
      if (!Object.values(HTTP_METHOD).includes(method)) {
        continue;
      }

      operations.push({
        method,
        operationId: definition?.operationId ?? null,
        path
      });
    }
  }

  operations.sort(compareOperation);
  return operations;
}

export function getPostmanOperations(collection) {
  const operations = [];
  walkPostmanItems(collection.item ?? [], operations);
  operations.sort(compareOperation);
  return operations;
}

export function diffOperations(expected, actual) {
  const expectedKeys = new Set(expected.map(toOperationKey));
  const actualKeys = new Set(actual.map(toOperationKey));

  return {
    missing: expected.filter((operation) => !actualKeys.has(toOperationKey(operation))),
    extra: actual.filter((operation) => !expectedKeys.has(toOperationKey(operation)))
  };
}

export function toOperationKey(operation) {
  return `${operation.method.toUpperCase()} ${operation.path}`;
}

async function collectControllerFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const controllerFiles = [];

  for (const entry of entries) {
    const entryPath = resolve(directoryPath, entry.name);

    if (entry.isDirectory()) {
      controllerFiles.push(...(await collectControllerFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(CONTROLLER_FILE_SUFFIX)) {
      controllerFiles.push(entryPath);
    }
  }

  return controllerFiles;
}

function extractControllerPath(fileContent) {
  const controllerMatch = fileContent.match(/@Controller\(([^)]*)\)/);

  if (!controllerMatch) {
    throw new Error("Controller file is missing @Controller() decorator");
  }

  return normalizeDecoratorPath(controllerMatch[1]);
}

function extractControllerOperations(fileContent) {
  const lines = fileContent.split(/\r?\n/);
  const operations = [];
  let pendingDecorators = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("@")) {
      pendingDecorators.push(trimmed);
      continue;
    }

    const handlerMatch = trimmed.match(/^(?:async\s+)?([A-Za-z0-9_]+)\s*\(/);
    if (handlerMatch) {
      const httpDecorator = getHttpDecorator(pendingDecorators);

      if (httpDecorator) {
        operations.push({
          handler: handlerMatch[1],
          method: HTTP_METHOD[httpDecorator.name.toUpperCase()],
          path: normalizeDecoratorPath(httpDecorator.path)
        });
      }

      pendingDecorators = [];
      continue;
    }

    if (trimmed !== "") {
      pendingDecorators = [];
    }
  }

  return operations;
}

function getHttpDecorator(decorators) {
  for (let index = decorators.length - 1; index >= 0; index -= 1) {
    const match = decorators[index].match(/^@(Get|Post|Put|Patch|Delete)\((.*)\)$/);
    if (match) {
      return {
        name: match[1],
        path: match[2]
      };
    }
  }

  return null;
}

function normalizeDecoratorPath(value) {
  const trimmed = value.trim();

  if (trimmed === "" || trimmed === "undefined") {
    return "";
  }

  const quotedPath = trimmed.match(/^(["'])(.*)\1$/s);
  if (!quotedPath) {
    throw new Error(`Unsupported controller route value: ${trimmed}`);
  }

  return normalizeRoutePath(quotedPath[2]);
}

function normalizeRoutePath(routePath) {
  if (!routePath) {
    return "";
  }

  return routePath
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith(":")) {
        return `{${segment.slice(1)}}`;
      }

      if (segment.startsWith("{{") && segment.endsWith("}}")) {
        return `{${segment.slice(2, -2)}}`;
      }

      return segment;
    })
    .join("/");
}

function joinRoutePath(controllerPath, operationPath) {
  const joined = [controllerPath, operationPath].filter(Boolean).join("/");
  return `/${joined}`;
}

function walkPostmanItems(items, operations) {
  for (const item of items) {
    if (Array.isArray(item.item)) {
      walkPostmanItems(item.item, operations);
    }

    if (!item.request) {
      continue;
    }

    operations.push({
      method: String(item.request.method ?? "get").toLowerCase(),
      name: item.name ?? null,
      path: normalizePostmanPath(item.request.url)
    });
  }
}

function normalizePostmanPath(url) {
  if (typeof url === "string") {
    return normalizePostmanRawPath(url);
  }

  if (Array.isArray(url?.path) && url.path.length > 0) {
    const normalized = normalizeRoutePath(url.path.join("/"));
    return `/${normalized}`;
  }

  if (typeof url?.raw === "string") {
    return normalizePostmanRawPath(url.raw);
  }

  throw new Error("Unsupported Postman URL shape");
}

function normalizePostmanRawPath(rawUrl) {
  const withoutQuery = rawUrl.split("?")[0];
  const withoutBaseUrl = withoutQuery.replace(/^\{\{baseUrl\}\}/, "");
  return `/${normalizeRoutePath(withoutBaseUrl.replace(/^\//, ""))}`;
}

function compareOperation(left, right) {
  return toOperationKey(left).localeCompare(toOperationKey(right));
}
