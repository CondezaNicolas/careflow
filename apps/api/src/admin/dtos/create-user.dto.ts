import { Transform } from "class-transformer";
import { IsEmail, IsString, MinLength, IsEnum, IsUUID } from "class-validator";

import { USER_ROLE, type UserRole } from "../../common/constants/user-role.js";
import { trimAndLowercase, trimString } from "../../common/validation/string.transforms.js";

export class CreateUserRequestDto {
  @Transform(trimAndLowercase)
  @IsEmail({}, { message: "Invalid email format" })
  email!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  password!: string;

  @IsEnum(USER_ROLE, {
    message: "Invalid role. Must be one of: admin, clinician, receptionist, patient"
  })
  role!: UserRole;

  @IsString()
  @IsUUID("4", { message: "Invalid tenant ID format" })
  tenantId!: string;
}

export interface CreateUserResponseDto {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  createdAt: string;
}
