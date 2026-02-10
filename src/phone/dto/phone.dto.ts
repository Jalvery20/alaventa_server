import { IsIn, IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';

export class PhoneDto {
  @IsPhoneNumber()
  number: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['vendedor', 'tienda'])
  role: string;
}
