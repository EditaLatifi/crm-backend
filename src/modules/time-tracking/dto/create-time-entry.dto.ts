import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateTimeEntryDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  startedAt!: string;

  @IsString()
  @IsNotEmpty()
  endedAt!: string;

  @IsInt()
  @Min(1)
  @Max(840) // 14 hours * 60 minutes = 840 minutes max per entry
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  overBudgetReason?: string;
}
