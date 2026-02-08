import { IsString, IsNotEmpty, IsDateString, IsInt, Min } from 'class-validator';

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
  durationMinutes!: number;

  @IsString()
  taskId?: string;
}
