import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateAccountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional() @IsString() addressStreet?: string;
  @IsOptional() @IsString() addressNumber?: string;
  @IsOptional() @IsString() @MaxLength(4) addressZip?: string;
  @IsOptional() @IsString() addressCity?: string;
  @IsOptional() @IsString() addressCanton?: string;
}
