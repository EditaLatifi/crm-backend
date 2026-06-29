import { IsString, IsOptional, IsEnum, IsDateString, IsNumber } from 'class-validator';
import { PhaseStatus } from '@prisma/client';

export class UpdatePhaseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(PhaseStatus)
  status?: PhaseStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  budgetHours?: number;

  @IsOptional()
  responsibleUserId?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}
