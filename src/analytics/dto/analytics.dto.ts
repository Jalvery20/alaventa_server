import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsEnum,
  ValidateNested,
  Min,
  MinLength,
  ArrayMinSize,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderProductDto {
  @IsString({ message: 'El ID del producto debe ser una cadena de texto' })
  productId: string;

  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(1, { message: 'El nombre es requerido' })
  name: string;

  @IsNumber({}, { message: 'El precio debe ser un número' })
  @Min(0, { message: 'El precio debe ser mayor o igual a 0' })
  price: number;

  @IsEnum(['CUP', 'USD', 'MLC'], {
    message: 'La moneda debe ser CUP, USD o MLC',
  })
  currency: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @Min(1, { message: 'La cantidad debe ser mayor o igual a 1' })
  quantity: number;

  @IsOptional()
  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  category?: string;
}

class TotalsDto {
  @IsNumber({}, { message: 'El total CUP debe ser un número' })
  @Min(0, { message: 'El total CUP debe ser mayor o igual a 0' })
  CUP: number;

  @IsNumber({}, { message: 'El total MLC debe ser un número' })
  @Min(0, { message: 'El total MLC debe ser mayor o igual a 0' })
  MLC: number;

  @IsNumber({}, { message: 'El total USD debe ser un número' })
  @Min(0, { message: 'El total USD debe ser mayor o igual a 0' })
  USD: number;
}

export class CreateOrderDto {
  @IsString({
    message: 'El teléfono del vendedor debe ser una cadena de texto',
  })
  @MinLength(1, { message: 'El teléfono del vendedor es requerido' })
  sellerPhone: string;

  @IsString({ message: 'El nombre del vendedor debe ser una cadena de texto' })
  @MinLength(1, { message: 'El nombre del vendedor es requerido' })
  sellerName: string;

  @IsEnum(['administrador', 'tienda', 'vendedor'], {
    message: 'El rol del vendedor debe ser administrador, tienda o vendedor',
  })
  sellerRole: string;

  @IsArray({ message: 'Los productos deben ser un array' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => OrderProductDto)
  products: OrderProductDto[];

  @IsOptional()
  @IsString({ message: 'El método de entrega debe ser una cadena de texto' })
  deliveryMethod?: string;

  @IsOptional()
  @IsString({ message: 'La zona de entrega debe ser una cadena de texto' })
  deliveryZone?: string;

  @IsOptional()
  @IsNumber({}, { message: 'El precio de entrega debe ser un número' })
  @Min(0, { message: 'El precio de entrega debe ser mayor o igual a 0' })
  deliveryPrice?: number;

  @IsOptional()
  @IsString({ message: 'La dirección de entrega debe ser una cadena de texto' })
  deliveryAddress?: string;

  @ValidateNested()
  @Type(() => TotalsDto)
  subtotals: TotalsDto;

  @ValidateNested()
  @Type(() => TotalsDto)
  totals: TotalsDto;
}

export class AnalyticsQueryDto {
  @IsOptional()
  @IsEnum(['7d', '30d', '90d', '12m', 'all'], {
    message: 'El período debe ser 7d, 30d, 90d, 12m o all',
  })
  period?: string;

  @IsOptional()
  @IsString({
    message: 'El teléfono del vendedor debe ser una cadena de texto',
  })
  sellerPhone?: string;
}

export class OrdersPaginationDto {
  @IsOptional()
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1' })
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite debe ser mayor o igual a 1' })
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsEnum(['7d', '30d', '90d', '12m', 'all'], {
    message: 'El período debe ser 7d, 30d, 90d, 12m o all',
  })
  period?: string;

  @IsOptional()
  @IsString({
    message: 'El teléfono del vendedor debe ser una cadena de texto',
  })
  sellerPhone?: string;
}
