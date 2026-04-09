import { IsString, IsOptional, IsEnum, IsDateString, IsNumber } from 'class-validator';
import { PhaseStatus } from '@prisma/client';

export class UpdatePhaseDto {
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
}
