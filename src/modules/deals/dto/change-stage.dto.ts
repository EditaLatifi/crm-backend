import { IsString, IsNotEmpty } from 'class-validator';

export class ChangeDealStageDto {
  @IsString()
  @IsNotEmpty()
  toStageId!: string;
}
