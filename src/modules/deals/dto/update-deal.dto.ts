import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { Currency } from '@prisma/client';

export class UpdateDealDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  stageId?: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;
}
