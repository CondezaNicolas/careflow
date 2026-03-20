import { Transform } from "class-transformer";
import { IsEmail, IsString, MinLength } from "class-validator";

import { trimAndLowercase, trimString } from "../../common/validation/string.transforms.js";

export class LoginDto {
  @Transform(trimAndLowercase)
  @IsEmail()
  email!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(8)
  password!: string;
}
