import { IsString } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  dealId!: string;

  @IsString()
  content!: string;
}
