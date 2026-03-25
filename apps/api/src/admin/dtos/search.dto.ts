import { Transform } from "class-transformer";
import { IsString, IsOptional, IsIn, MinLength } from "class-validator";

import { trimAndLowercase, trimToUndefined } from "../../common/validation/string.transforms.js";

export class SearchQueryDto {
  @Transform(trimAndLowercase)
  @IsString()
  @MinLength(2, { message: "Search query must be at least 2 characters" })
  q!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  types?: string; // comma-separated values: "users,patients,appointments,logs"
}
