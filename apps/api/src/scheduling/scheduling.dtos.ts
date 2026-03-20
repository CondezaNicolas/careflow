import { Transform } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Matches, Min } from "class-validator";

import { trimString } from "../common/validation/string.transforms.js";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export class SearchAvailabilityQueryDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  specialistId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  from!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  to!: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === "" ? 30 : Number(value)))
  @IsInt()
  @Min(1)
  durationMinutes!: number;
}

export class CreateAvailabilityWindowRequestDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  specialistId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  startAtIso!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  endAtIso!: string;
}

export class CreateAppointmentRequestDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  specialistId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  startAtIso!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  endAtIso!: string;
}

export class RescheduleAppointmentRequestDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  specialistId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  startAtIso!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  endAtIso!: string;
}

export class AppointmentIdParamDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  id!: string;
}

export class IdempotencyKeyHeaderDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(IDEMPOTENCY_KEY_PATTERN)
  idempotencyKey!: string;
}
