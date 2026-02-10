import {
  IsString,
  IsNotEmpty,
  IsPhoneNumber,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';

export class RegisterUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsPhoneNumber()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$%*?.&]{8,}$/, {
    message:
      'La contraseña debe tener al menos 8 caracteres, incluyendo números, letras mayúsculas y minúsculas',
  })
  password: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  confirmPassword: string;
}

export class LoginUserDto {
  @IsPhoneNumber()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
