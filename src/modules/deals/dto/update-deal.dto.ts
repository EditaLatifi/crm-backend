import { IsString, IsOptional, IsNumber, IsEnum, IsDateString, IsObject, IsArray } from 'class-validator';
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

  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string;

  @IsDateString()
  @IsOptional()
  followUpDate?: string | null;

  @IsArray()
  @IsOptional()
  phases?: number[];

  @IsObject()
  @IsOptional()
  phaseBudgets?: Record<string, number>;

  @IsObject()
  @IsOptional()
  customFields?: Record<string, any>;
}
