import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDefined, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";

import { ASSISTANT_TOOL_NAME, type AssistantToolName } from "./assistant.types.js";
import { trimString, trimToNull } from "../common/validation/string.transforms.js";

export class AssistantToolParamDto {
  @Transform(trimString)
  @IsIn(Object.values(ASSISTANT_TOOL_NAME))
  toolName!: AssistantToolName;
}

export class AssistantWriteConfirmationDto {
  @IsBoolean()
  confirmed!: boolean;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  token?: string | null;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  reason?: string | null;
}

export class AssistantInvokeToolRequestDto {
  @IsDefined()
  input!: unknown;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantWriteConfirmationDto)
  confirmation?: AssistantWriteConfirmationDto;
}
