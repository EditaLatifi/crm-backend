import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class UpdateTimeEntryDto {
  @IsString()
  @IsOptional()
  startedAt?: string;

  @IsString()
  @IsOptional()
  endedAt?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(840) // 14 hours * 60 minutes = 840 minutes max per entry
  durationMinutes?: number;

  @IsString()
  @IsOptional()
  taskId?: string;
}
