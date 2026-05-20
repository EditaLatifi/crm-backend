import { IsString, IsOptional, IsArray, IsNotEmpty } from 'class-validator';

export class SendEmailDto {
  @IsNotEmpty()
  to!: string | string[];

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;
}
