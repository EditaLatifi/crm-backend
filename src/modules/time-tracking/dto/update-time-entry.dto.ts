import { IsString, IsOptional, IsInt, Min } from 'class-validator';

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
  durationMinutes?: number;

  @IsString()
  @IsOptional()
  taskId?: string;
}
