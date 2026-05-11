import { IsString, IsOptional, IsNumber, Min, Max, IsDateString } from 'class-validator';

export class UpdatePhasePaymentDto {
  @IsOptional()
  @IsString()
  label?: string;

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
