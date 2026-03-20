import { Transform } from "class-transformer";
import { IsNotEmpty, IsString } from "class-validator";

import { trimString } from "../../common/validation/string.transforms.js";

export class RefreshDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
