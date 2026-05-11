import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsDateString } from 'class-validator';

export class CreatePhasePaymentDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
