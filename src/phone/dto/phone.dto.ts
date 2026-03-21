import { IsIn, IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';

export class PhoneDto {
  @IsPhoneNumber(undefined, { message: 'El número de teléfono no es válido' })
  number: string;

  @IsString({ message: 'El rol debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El rol es requerido' })
  @IsIn(['vendedor', 'tienda', 'administrador'], {
    message: 'El rol debe ser vendedor, tienda o administrador',
  })
  role: string;
}
