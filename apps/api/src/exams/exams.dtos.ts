import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested
} from "class-validator";

import {
  EXAM_LIST_VISIBILITY_SCOPE,
  EXAM_STATUS,
  type ExamListVisibilityScope
} from "./exams.types.js";
import { trimString, trimToNull } from "../common/validation/string.transforms.js";

export class ExamAttachmentMetadataDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  attachmentId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes!: number;
}

export class CreateExamRequestDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  examType!: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  notes?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamAttachmentMetadataDto)
  attachments!: ExamAttachmentMetadataDto[];
}

export class UpdateExamRequestDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  examType!: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  notes?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamAttachmentMetadataDto)
  attachments!: ExamAttachmentMetadataDto[];
}

export class TransitionExamStatusRequestDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsIn(Object.values(EXAM_STATUS))
  toStatus!: (typeof EXAM_STATUS)[keyof typeof EXAM_STATUS];
}

export class ExamIdParamDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  examId!: string;
}

export class PatientIdParamDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  patientId!: string;
}

export class ListPatientExamsQueryDto {
  @IsOptional()
  @Transform(({ obj, value }) =>
    typeof value === "string"
      ? value.trim().toLowerCase()
      : typeof obj?.visibility === "string"
        ? obj.visibility.trim().toLowerCase()
        : EXAM_LIST_VISIBILITY_SCOPE.ALL
  )
  @IsIn(Object.values(EXAM_LIST_VISIBILITY_SCOPE))
  visibilityScope!: ExamListVisibilityScope;
}
