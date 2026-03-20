import type { TransformFnParams } from "class-transformer";

export function trimString({ value }: TransformFnParams): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim();
}

export function trimToUndefined({ value }: TransformFnParams): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function trimToNull({ value }: TransformFnParams): unknown {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function trimAndLowercase({ value }: TransformFnParams): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim().toLowerCase();
}

export function trimAndLowercaseOrDefault(defaultValue: string) {
  return ({ value }: TransformFnParams): unknown => {
    if (typeof value !== "string") {
      return defaultValue;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : defaultValue;
  };
}
