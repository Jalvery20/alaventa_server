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
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  name?: string;

  @IsPhoneNumber(undefined, { message: 'El número de teléfono no es válido' })
  phoneNumber: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  address?: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(40, {
    message: 'La contraseña no debe tener más de 40 caracteres',
  })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$%*?.&]{8,40}$/, {
    message: 'La contraseña debe incluir al menos una letra y un número',
  })
  password: string;

  @IsString({
    message: 'La confirmación de contraseña debe ser una cadena de texto',
  })
  @MinLength(8, {
    message: 'La confirmación de contraseña debe tener al menos 8 caracteres',
  })
  @MaxLength(40, {
    message: 'La confirmación de contraseña no debe tener más de 40 caracteres',
  })
  confirmPassword: string;
}

export class LoginUserDto {
  @IsPhoneNumber(undefined, { message: 'El número de teléfono no es válido' })
  phoneNumber: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password: string;
}
