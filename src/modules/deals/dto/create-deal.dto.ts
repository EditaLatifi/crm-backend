import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { Currency } from '@prisma/client';

export class CreateDealDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  stageId!: string;

  @IsNumber()
  @IsNotEmpty()
  amount!: number;

  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;
}
