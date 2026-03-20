import { Transform } from "class-transformer";
import { IsNotEmpty, IsString } from "class-validator";

import { trimString } from "../common/validation/string.transforms.js";

export class PatientChartParamDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  id!: string;
}
