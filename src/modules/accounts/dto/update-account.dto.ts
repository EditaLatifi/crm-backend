import { IsString, IsOptional, IsEmail, IsInt, Min, Max, MaxLength } from 'class-validator';

export class UpdateAccountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional() @IsString() addressStreet?: string;
  @IsOptional() @IsString() addressNumber?: string;
  @IsOptional() @IsString() @MaxLength(4) addressZip?: string;
  @IsOptional() @IsString() addressCity?: string;
  @IsOptional() @IsString() addressCanton?: string;
  @IsOptional() @IsString() address?: string;

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() vendorType?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
}
