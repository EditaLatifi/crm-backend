import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsNumber()
  @IsOptional()
  probability?: number;
}
