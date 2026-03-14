import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsPhoneNumber,
  IsOptional,
  Length,
  IsIn,
  IsBoolean,
  IsDateString,
  ValidateNested,
  IsArray,
  IsNumber,
  MinLength,
  MaxLength,
  Matches,
  IsEmail,
  Min,
  ArrayMaxSize,
  ValidateIf,
  ArrayMinSize,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Max,
} from 'class-validator';

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function parseJSON(value: any, cls: any) {
  if (typeof value === 'string') {
    try {
      const parsedValue = JSON.parse(value);
      if (Array.isArray(parsedValue)) {
        return parsedValue.map((item: any) => plainToInstance(cls, item));
      }
      return [plainToInstance(cls, parsedValue)];
    } catch (error) {
      throw new Error(`Invalid JSON string: ${value}`);
    }
  }
  if (Array.isArray(value)) {
    return value.map((item: any) => plainToInstance(cls, item));
  }
  return [];
}

function parseStringArray(value: any) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`Invalid JSON string: ${value}`);
    }
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

// Transformar null string a null real
function parseNullableArray(value: any, cls: any) {
  if (value === null || value === 'null') {
    return null;
  }
  return parseJSON(value, cls);
}

function parseOptionalObject(value: any) {
  if (
    value === null ||
    value === undefined ||
    value === 'null' ||
    value === 'undefined'
  ) {
    return undefined;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return undefined;
    }
  }

  return value;
}

// ============================================
// DTOs DE OBJETOS ANIDADOS
// ============================================

// DTO para geolocalización
export class GeoLocationDTO {
  @IsString()
  @IsIn(['Point'])
  type: string;

  @IsArray()
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  coordinates: number[]; // [longitude, latitude]
}

// DTO para opciones de entrega
export class DeliveryOptionsDTO {
  @IsBoolean()
  pickup: boolean;

  @IsBoolean()
  delivery: boolean;
}

export class ScheduleDTO {
  @IsString()
  @IsIn([
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
    'Domingo',
  ])
  day: string;

  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'openingTime debe tener formato HH:mm',
  })
  openingTime: string;

  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'closingTime debe tener formato HH:mm',
  })
  closingTime: string;
}

export class DeliveryOptionDTO {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  zone: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class UpdateStoreCategoriesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe seleccionar al menos una categoría' })
  @IsString({ each: true, message: 'Cada categoría debe ser un texto' })
  @IsNotEmpty({ each: true, message: 'Las categorías no pueden estar vacías' })
  @Transform(({ value }) => {
    // Eliminar duplicados y espacios en blanco
    if (Array.isArray(value)) {
      return [
        ...new Set(
          value.map((cat) => cat.trim()).filter((cat) => cat.length > 0),
        ),
      ];
    }
    return value;
  })
  categories: string[];
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Length(5, 100)
  name?: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsPhoneNumber()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  @Length(10, 200)
  address?: string;

  @IsOptional()
  @IsString()
  @IsIn(['vendedor', 'tienda'])
  role?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;
}

export class CompleteUserDto {
  @IsString()
  @Length(5, 100)
  name: string;

  @IsString()
  @Length(3, 50)
  province: string;

  @IsString()
  @Length(3, 50)
  municipality: string;

  @IsOptional()
  @IsString()
  @Length(10, 200)
  address?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(5, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 50)
  province?: string;

  @IsOptional()
  @IsString()
  @Length(3, 50)
  municipality?: string;

  @IsOptional()
  @IsString()
  @Length(10, 200)
  address?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;
}

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @Length(5, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 50)
  province?: string;

  @IsOptional()
  @IsString()
  @Length(3, 50)
  municipality?: string;

  @IsOptional()
  @IsString()
  @Length(10, 200)
  address?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => parseStringArray(value))
  categories?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => parseStringArray(value))
  contact?: string[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DeliveryOptionDTO)
  @Transform(({ value }) => parseNullableArray(value, DeliveryOptionDTO))
  delivery?: DeliveryOptionDTO[] | null;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDTO)
  @Transform(({ value }) => parseJSON(value, ScheduleDTO))
  schedule?: ScheduleDTO[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => parseStringArray(value))
  paymentMethods?: string[];
}

export class UpdateUserRoleDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['administrador', 'vendedor', 'tienda'])
  role: string;
}

export class UpdateAvailableUserDto {
  @IsBoolean()
  @IsNotEmpty()
  isAllowed: boolean;
}

export class UpdateUserExpiryDateDto {
  @IsDateString()
  @IsNotEmpty()
  expiryDate: Date;
}

// Validador custom para confirmar contraseñas
@ValidatorConstraint({ name: 'MatchesPassword', async: false })
class MatchesPasswordConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: string, args: ValidationArguments) {
    const object = args.object as UpdatePasswordDto;
    return confirmPassword === object.newPassword;
  }

  defaultMessage() {
    return 'Las contraseñas no coinciden';
  }
}

export class UpdatePasswordDto {
  @IsString({ message: 'La contraseña actual debe ser una cadena de texto' })
  @MinLength(1, { message: 'La contraseña actual es requerida' })
  currentPassword: string;

  @IsString({ message: 'La nueva contraseña debe ser una cadena de texto' })
  @MinLength(8, {
    message: 'La nueva contraseña debe tener al menos 8 caracteres',
  })
  @MaxLength(40, {
    message: 'La nueva contraseña no debe tener más de 40 caracteres',
  })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,40}$/, {
    message: 'La nueva contraseña debe incluir letras y números',
  })
  newPassword: string;

  @IsString({
    message: 'La confirmación de la contraseña debe ser una cadena de texto',
  })
  @Validate(MatchesPasswordConstraint, {
    message: 'Las contraseñas no coinciden',
  })
  confirmPassword: string;
}

export class getStoresDto {
  @IsOptional()
  @IsString()
  @Length(3, 50)
  province?: string;

  @IsOptional()
  @IsString()
  @Length(3, 50)
  municipality?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  limit?: number;
}

/**
 * DTO para actualización parcial de storeDetails
 */
export class PatchStoreDetailsDto {
  @IsOptional()
  @IsString()
  storePic?: string;

  @IsOptional()
  @IsString()
  @MinLength(20, {
    message: 'La descripción debe tener al menos 20 caracteres',
  })
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  is24Hours?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDTO)
  @ArrayMaxSize(7)
  schedule?: ScheduleDTO[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryOptionDTO)
  @ArrayMaxSize(20)
  @Transform(({ value }) => (value === null || value === 'null' ? null : value))
  delivery?: DeliveryOptionDTO[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  contact?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  categories?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  paymentMethods?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryOptionsDTO)
  @Transform(({ value }) => parseOptionalObject(value))
  @ValidateIf((o) => o.deliveryOptions !== undefined)
  deliveryOptions?: DeliveryOptionsDTO;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoLocationDTO)
  @Transform(({ value }) => {
    if (
      value === null ||
      value === undefined ||
      value === 'null' ||
      value === 'undefined'
    ) {
      return null;
    }
    return parseOptionalObject(value);
  })
  @ValidateIf((o) => o.location !== undefined && o.location !== null)
  location?: GeoLocationDTO | null;
}

/**
 * DTO principal para PATCH de tienda
 */
export class PatchStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'El nombre debe tener al menos 5 caracteres' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 50)
  province?: string;

  @IsOptional()
  @IsString()
  @Length(3, 50)
  municipality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchStoreDetailsDto)
  storeDetails?: PatchStoreDetailsDto;
}

/**
 * DTO para actualización parcial de usuarios no-tienda
 * (vendedores y administradores)
 */
export class PatchUserDto {
  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'El nombre debe tener al menos 5 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  province?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  municipality?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Debe ser un email válido' })
  email?: string;
}

/**
 * DTO para obtener usuarios con filtros
 */
export class GetUsersQueryDto {
  // Búsqueda
  @IsOptional()
  @IsString()
  search?: string;

  // Filtro por rol
  @IsOptional()
  @IsIn(['all', 'administrador', 'vendedor', 'tienda'])
  role?: string;

  // Filtro por estado
  @IsOptional()
  @IsIn(['all', 'active', 'expired', 'expiring-soon', 'disabled'])
  status?: string;

  // Filtro por provincia
  @IsOptional()
  @IsString()
  province?: string;

  // Ordenamiento
  @IsOptional()
  @IsIn(['newest', 'name', 'expiry', 'products'])
  sortBy?: string;

  // Paginación
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * DTO para exportar usuarios
 */
export class ExportUsersQueryDto {
  @IsOptional()
  @IsIn(['all', 'administrador', 'vendedor', 'tienda'])
  role?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'expired', 'expiring-soon', 'disabled'])
  status?: string;

  @IsOptional()
  @IsString()
  province?: string;
}
