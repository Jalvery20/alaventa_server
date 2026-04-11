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
  @IsString({ message: 'El tipo debe ser una cadena de texto' })
  @IsIn(['Point'], { message: 'El tipo debe ser Point' })
  type: string;

  @IsArray({ message: 'Las coordenadas deben ser un array' })
  @ArrayMaxSize(2, { message: 'Las coordenadas deben tener máximo 2 valores' })
  @IsNumber({}, { each: true, message: 'Cada coordenada debe ser un número' })
  coordinates: number[]; // [longitude, latitude]
}

// DTO para opciones de entrega
export class DeliveryOptionsDTO {
  @IsBoolean({ message: 'El campo pickup debe ser un booleano' })
  pickup: boolean;

  @IsBoolean({ message: 'El campo delivery debe ser un booleano' })
  delivery: boolean;
}

export class ScheduleDTO {
  @IsString({ message: 'El día debe ser una cadena de texto' })
  @IsIn(
    ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    { message: 'El día debe ser un día de la semana válido' },
  )
  day: string;

  @IsString({ message: 'La hora de apertura debe ser una cadena de texto' })
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora de apertura debe tener formato HH:mm',
  })
  openingTime: string;

  @IsString({ message: 'La hora de cierre debe ser una cadena de texto' })
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora de cierre debe tener formato HH:mm',
  })
  closingTime: string;
}

export class DeliveryOptionDTO {
  @IsString({ message: 'La zona debe ser una cadena de texto' })
  @MinLength(1, { message: 'La zona es requerida' })
  @MaxLength(100, { message: 'La zona no debe exceder 100 caracteres' })
  zone: string;

  @IsNumber({}, { message: 'El precio debe ser un número' })
  @Min(0, { message: 'El precio debe ser mayor o igual a 0' })
  price: number;
}

export class ExchangeRatesDTO {
  @IsBoolean({ message: 'El campo enabled debe ser un booleano' })
  @IsOptional()
  enabled?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === null || value === 'null' ? null : value))
  @ValidateIf((o) => o.usdToCup !== null)
  @IsNumber({}, { message: 'La tasa USD debe ser un número' })
  @Min(0, { message: 'La tasa USD debe ser mayor o igual a 0' })
  usdToCup?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === null || value === 'null' ? null : value))
  @ValidateIf((o) => o.eurToCup !== null)
  @IsNumber({}, { message: 'La tasa EUR debe ser un número' })
  @Min(0, { message: 'La tasa EUR debe ser mayor o igual a 0' })
  eurToCup?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === null || value === 'null' ? null : value))
  @ValidateIf((o) => o.mlcToCup !== null)
  @IsNumber({}, { message: 'La tasa MLC debe ser un número' })
  @Min(0, { message: 'La tasa MLC debe ser mayor o igual a 0' })
  mlcToCup?: number | null;
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
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @Length(4, 100, { message: 'El nombre debe tener entre 5 y 100 caracteres' })
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password: string;

  @IsPhoneNumber(undefined, { message: 'El número de teléfono no es válido' })
  phoneNumber: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @Length(10, 200, {
    message: 'La dirección debe tener entre 10 y 200 caracteres',
  })
  address?: string;

  @IsOptional()
  @IsString({ message: 'El rol debe ser una cadena de texto' })
  @IsIn(['vendedor', 'tienda'], {
    message: 'El rol debe ser vendedor o tienda',
  })
  role?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;
}

export class CompleteUserDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @Length(4, 100, { message: 'El nombre debe tener entre 4 y 100 caracteres' })
  @Transform(({ value }) => value?.trim())
  name: string;

  @IsString({ message: 'La provincia debe ser una cadena de texto' })
  @Length(3, 50, { message: 'La provincia debe tener entre 3 y 50 caracteres' })
  province: string;

  @IsString({ message: 'El municipio debe ser una cadena de texto' })
  @Length(3, 50, { message: 'El municipio debe tener entre 3 y 50 caracteres' })
  municipality: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @Length(10, 200, {
    message: 'La dirección debe tener entre 10 y 200 caracteres',
  })
  address?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @Length(4, 100, { message: 'El nombre debe tener entre 4 y 100 caracteres' })
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsString({ message: 'La provincia debe ser una cadena de texto' })
  @Length(3, 50, { message: 'La provincia debe tener entre 3 y 50 caracteres' })
  province?: string;

  @IsOptional()
  @IsString({ message: 'El municipio debe ser una cadena de texto' })
  @Length(3, 50, { message: 'El municipio debe tener entre 3 y 50 caracteres' })
  municipality?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @Length(10, 200, {
    message: 'La dirección debe tener entre 10 y 200 caracteres',
  })
  address?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;
}

export class UpdateStoreDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @Length(4, 100, { message: 'El nombre debe tener entre 4 y 100 caracteres' })
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsString({ message: 'La provincia debe ser una cadena de texto' })
  @Length(3, 50, { message: 'La provincia debe tener entre 3 y 50 caracteres' })
  province?: string;

  @IsOptional()
  @IsString({ message: 'El municipio debe ser una cadena de texto' })
  @Length(3, 50, { message: 'El municipio debe tener entre 3 y 50 caracteres' })
  municipality?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @Length(10, 200, {
    message: 'La dirección debe tener entre 10 y 200 caracteres',
  })
  address?: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  description?: string;

  @IsOptional()
  @IsArray({ message: 'Las categorías deben ser un array' })
  @IsString({
    each: true,
    message: 'Cada categoría debe ser una cadena de texto',
  })
  @Transform(({ value }) => parseStringArray(value))
  categories?: string[];

  @IsOptional()
  @IsArray({ message: 'Los contactos deben ser un array' })
  @IsString({
    each: true,
    message: 'Cada contacto debe ser una cadena de texto',
  })
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
  @IsArray({ message: 'Los métodos de pago deben ser un array' })
  @IsString({
    each: true,
    message: 'Cada método de pago debe ser una cadena de texto',
  })
  @Transform(({ value }) => parseStringArray(value))
  paymentMethods?: string[];
}

export class UpdateUserRoleDto {
  @IsString({ message: 'El rol debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El rol es requerido' })
  @IsIn(['administrador', 'vendedor', 'tienda'], {
    message: 'El rol debe ser administrador, vendedor o tienda',
  })
  role: string;
}

export class UpdateAvailableUserDto {
  @IsBoolean({ message: 'isAllowed debe ser un booleano' })
  @IsNotEmpty({ message: 'isAllowed es requerido' })
  isAllowed: boolean;
}

export class UpdateUserExpiryDateDto {
  @IsDateString(
    {},
    { message: 'La fecha de expiración debe ser una fecha válida' },
  )
  @IsNotEmpty({ message: 'La fecha de expiración es requerida' })
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
  @IsString({ message: 'La provincia debe ser una cadena de texto' })
  @Length(3, 50, { message: 'La provincia debe tener entre 3 y 50 caracteres' })
  province?: string;

  @IsOptional()
  @IsString({ message: 'El municipio debe ser una cadena de texto' })
  @Length(3, 50, { message: 'El municipio debe tener entre 3 y 50 caracteres' })
  municipality?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber({}, { message: 'La página debe ser un número' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1' })
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber({}, { message: 'El límite debe ser un número' })
  @Min(1, { message: 'El límite debe ser mayor o igual a 1' })
  limit?: number;
}

/**
 * DTO para actualización parcial de storeDetails
 */
export class PatchStoreDetailsDto {
  @IsOptional()
  @IsString({ message: 'La imagen debe ser una cadena de texto' })
  storePic?: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MinLength(20, {
    message: 'La descripción debe tener al menos 20 caracteres',
  })
  @MaxLength(1000, {
    message: 'La descripción no debe exceder 1000 caracteres',
  })
  description?: string;

  @IsOptional()
  @IsBoolean({ message: 'is24Hours debe ser un booleano' })
  is24Hours?: boolean;

  @IsOptional()
  @IsArray({ message: 'El horario debe ser un array' })
  @ValidateNested({ each: true })
  @Type(() => ScheduleDTO)
  @ArrayMaxSize(7, { message: 'El horario no debe tener más de 7 días' })
  schedule?: ScheduleDTO[];

  @IsOptional()
  @IsArray({ message: 'Las opciones de entrega deben ser un array' })
  @ValidateNested({ each: true })
  @Type(() => DeliveryOptionDTO)
  @ArrayMaxSize(20, {
    message: 'No se pueden tener más de 20 zonas de entrega',
  })
  @Transform(({ value }) => (value === null || value === 'null' ? null : value))
  delivery?: DeliveryOptionDTO[] | null;

  @IsOptional()
  @IsArray({ message: 'Los contactos deben ser un array' })
  @IsString({
    each: true,
    message: 'Cada contacto debe ser una cadena de texto',
  })
  @ArrayMaxSize(5, { message: 'No se pueden tener más de 5 contactos' })
  contact?: string[];

  @IsOptional()
  @IsArray({ message: 'Las categorías deben ser un array' })
  @IsString({
    each: true,
    message: 'Cada categoría debe ser una cadena de texto',
  })
  @ArrayMaxSize(10, { message: 'No se pueden tener más de 10 categorías' })
  categories?: string[];

  @IsOptional()
  @IsArray({ message: 'Los métodos de pago deben ser un array' })
  @IsString({
    each: true,
    message: 'Cada método de pago debe ser una cadena de texto',
  })
  @ArrayMaxSize(10, { message: 'No se pueden tener más de 10 métodos de pago' })
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

  @IsOptional()
  @ValidateNested()
  @Type(() => ExchangeRatesDTO)
  @Transform(({ value }) => parseOptionalObject(value))
  @ValidateIf((o) => o.exchangeRates !== undefined)
  exchangeRates?: ExchangeRatesDTO;
}

/**
 * DTO principal para PATCH de tienda
 */
export class PatchStoreDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(4, { message: 'El nombre debe tener al menos 4 caracteres' })
  @MaxLength(100, { message: 'El nombre no debe exceder 100 caracteres' })
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsString({ message: 'La provincia debe ser una cadena de texto' })
  @Length(3, 50, { message: 'La provincia debe tener entre 3 y 50 caracteres' })
  province?: string;

  @IsOptional()
  @IsString({ message: 'El municipio debe ser una cadena de texto' })
  @Length(3, 50, { message: 'El municipio debe tener entre 3 y 50 caracteres' })
  municipality?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @MaxLength(200, { message: 'La dirección no debe exceder 200 caracteres' })
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
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(4, { message: 'El nombre debe tener al menos 4 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsString({ message: 'La provincia debe ser una cadena de texto' })
  @MinLength(3, { message: 'La provincia debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'La provincia no debe exceder 50 caracteres' })
  province?: string;

  @IsOptional()
  @IsString({ message: 'El municipio debe ser una cadena de texto' })
  @MinLength(3, { message: 'El municipio debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'El municipio no debe exceder 50 caracteres' })
  municipality?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
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
  @IsString({ message: 'La búsqueda debe ser una cadena de texto' })
  search?: string;

  // Filtro por rol
  @IsOptional()
  @IsIn(['all', 'administrador', 'vendedor', 'tienda'], {
    message: 'El rol debe ser all, administrador, vendedor o tienda',
  })
  role?: string;

  // Filtro por estado
  @IsOptional()
  @IsIn(['all', 'active', 'expired', 'expiring-soon', 'disabled'], {
    message: 'El estado no es válido',
  })
  status?: string;

  // Filtro por provincia
  @IsOptional()
  @IsString({ message: 'La provincia debe ser una cadena de texto' })
  province?: string;

  // Ordenamiento
  @IsOptional()
  @IsIn(['newest', 'name', 'expiry', 'products'], {
    message: 'El criterio de orden no es válido',
  })
  sortBy?: string;

  // Paginación
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber({}, { message: 'La página debe ser un número' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1' })
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber({}, { message: 'El límite debe ser un número' })
  @Min(1, { message: 'El límite debe ser mayor o igual a 1' })
  @Max(100, { message: 'El límite no debe exceder 100' })
  limit?: number;
}

/**
 * DTO para exportar usuarios
 */
export class ExportUsersQueryDto {
  @IsOptional()
  @IsIn(['all', 'administrador', 'vendedor', 'tienda'], {
    message: 'El rol debe ser all, administrador, vendedor o tienda',
  })
  role?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'expired', 'expiring-soon', 'disabled'], {
    message: 'El estado no es válido',
  })
  status?: string;

  @IsOptional()
  @IsString({ message: 'La provincia debe ser una cadena de texto' })
  province?: string;
}
