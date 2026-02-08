import { IsString } from 'class-validator';

export class CreateAttachmentDto {
  @IsString()
  dealId!: string;

  @IsString()
  url!: string;

  @IsString()
  filename!: string;
}
