import { Transform } from "class-transformer";
import { IsEmail, IsString, MinLength, Matches, IsOptional, IsEnum } from "class-validator";

import { USER_ROLE, type UserRole } from "../../common/constants/user-role.js";
import {
  trimAndLowercase,
  trimString,
  trimToUndefined
} from "../../common/validation/string.transforms.js";

export class RegisterDto {
  @Transform(trimAndLowercase)
  @IsEmail()
  email!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: "Password must contain at least one uppercase letter" })
  @Matches(/[a-z]/, { message: "Password must contain at least one lowercase letter" })
  @Matches(/[0-9]/, { message: "Password must contain at least one number" })
  password!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsEnum(USER_ROLE)
  role?: UserRole;
}
