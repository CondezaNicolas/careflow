import { IsOptional, IsInt, Min, Max, IsIn, ValidateIf } from "class-validator";
import { plainToInstance } from "class-transformer";

import type { ClinicalTimelineVisibilityScope } from "./clinical.types.js";

export class ClinicalTimelineQuery {
  @IsIn(["all", "clinical", "patient_shared"])
  visibilityScope!: ClinicalTimelineVisibilityScope;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ValidateIf((o) => o.offset !== undefined)
  @IsInt()
  @Min(0)
  offset?: number;

  static from(query: Record<string, unknown>): ClinicalTimelineQuery {
    return plainToInstance(ClinicalTimelineQuery, query, {
      excludeExtraneousValues: true
    });
  }
}
