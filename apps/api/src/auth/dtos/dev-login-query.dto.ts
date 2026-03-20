import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString } from "class-validator";

import type { AuthPrincipal } from "@lia/shared-types";

import { USER_ROLE } from "../../common/constants/user-role.js";
import { trimAndLowercase, trimToUndefined } from "../../common/validation/string.transforms.js";

export class DevLoginQueryDto {
  @IsOptional()
  @Transform(trimAndLowercase)
  @IsIn(Object.values(USER_ROLE))
  role: AuthPrincipal["role"] = USER_ROLE.ADMIN;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  redirect?: string;
}
