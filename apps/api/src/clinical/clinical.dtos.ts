import {
  IsIn,
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsISO8601,
  ValidateNested,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
  IsNumber,
  IsPositive
} from "class-validator";
import { Transform, Type } from "class-transformer";

import {
  CLINICAL_NOTE_VISIBILITY,
  CLINICAL_TIMELINE_VISIBILITY_SCOPE,
  type ClinicalNoteVisibility,
  type ClinicalTimelineVisibilityScope
} from "./clinical.types.js";
import { trimString, trimToNull } from "../common/validation/string.transforms.js";

export class ClinicalVitalsDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  systolicBpMmHg?: number | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  diastolicBpMmHg?: number | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  heartRateBpm?: number | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  respiratoryRateBpm?: number | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  oxygenSaturationPct?: number | null;

  @IsOptional()
  @IsNumber()
  temperatureC?: number | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  weightKg?: number | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  heightCm?: number | null;
}

export class ClinicalMedicationDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  dose!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  frequency!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  route!: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  instructions?: string | null;
}

export class ClinicalAntecedentDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  category!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  description!: string;
}

export class ClinicalAttachmentMetadataDto {
  @Transform(trimString)
  @IsUUID()
  attachmentId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsInt()
  @Min(0)
  sizeBytes!: number;
}

export class CreateClinicalEncounterRequestDto {
  @Transform(trimString)
  @IsUUID()
  patientId!: string;

  @IsISO8601()
  startedAtIso!: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsISO8601()
  endedAtIso?: string | null;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  reason?: string | null;
}

export class UpdateClinicalEncounterRequestDto {
  @IsISO8601()
  startedAtIso!: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsISO8601()
  endedAtIso?: string | null;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  reason?: string | null;
}

export class CreateClinicalNoteRequestDto {
  @Transform(trimString)
  @IsUUID()
  patientId!: string;

  @Transform(trimString)
  @IsIn(Object.values(CLINICAL_NOTE_VISIBILITY))
  visibility!: ClinicalNoteVisibility;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  subjective!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  objective!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  assessment!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  plan!: string;

  @ValidateNested()
  @Type(() => ClinicalVitalsDto)
  vitals!: ClinicalVitalsDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClinicalMedicationDto)
  medications!: ClinicalMedicationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClinicalAntecedentDto)
  antecedentes!: ClinicalAntecedentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClinicalAttachmentMetadataDto)
  attachments!: ClinicalAttachmentMetadataDto[];
}

export class UpdateClinicalNoteRequestDto {
  @Transform(trimString)
  @IsIn(Object.values(CLINICAL_NOTE_VISIBILITY))
  visibility!: ClinicalNoteVisibility;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  subjective!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  objective!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  assessment!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  plan!: string;

  @ValidateNested()
  @Type(() => ClinicalVitalsDto)
  vitals!: ClinicalVitalsDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClinicalMedicationDto)
  medications!: ClinicalMedicationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClinicalAntecedentDto)
  antecedentes!: ClinicalAntecedentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClinicalAttachmentMetadataDto)
  attachments!: ClinicalAttachmentMetadataDto[];
}

export class ClinicalTimelineQueryDto {
  @Transform(({ obj, value }) =>
    typeof value === "string"
      ? value.trim().toLowerCase()
      : typeof obj?.visibility === "string"
        ? obj.visibility.trim().toLowerCase()
        : CLINICAL_TIMELINE_VISIBILITY_SCOPE.ALL
  )
  @IsOptional()
  @IsIn(Object.values(CLINICAL_TIMELINE_VISIBILITY_SCOPE))
  visibilityScope!: ClinicalTimelineVisibilityScope;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class EncounterIdParamDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  encounterId!: string;
}

export class NoteIdParamDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  noteId!: string;
}

export class PatientIdParamDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  patientId!: string;
}
