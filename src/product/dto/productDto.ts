import {
  IsString,
  IsInt,
  Min,
  Length,
  IsMongoId,
  IsOptional,
  IsIn,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  IsNumber,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// ============================================
// CREATE PRODUCT DTO
// ============================================

export class CreateProductDto {
  @IsString({ message: 'El nombre del producto debe ser una cadena de texto' })
  @Length(5, 100, {
    message: 'El nombre del producto debe tener entre 5 y 100 caracteres',
  })
  name: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'El precio debe ser un número' })
  @Min(1, { message: 'El precio debe ser mayor o igual a 1' })
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El precio original debe ser un número' })
  @Min(1, { message: 'El precio original debe ser mayor o igual a 1' })
  originalPrice?: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(0, { message: 'La cantidad debe ser mayor o igual a 0' })
  amount: number;

  @IsMongoId({ message: 'El vendedor debe ser un ID de MongoDB válido' })
  seller: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @Length(10, 500, {
    message: 'La descripción debe tener entre 10 y 500 caracteres',
  })
  description?: string;

  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  @Length(3, 100, {
    message: 'La categoría debe tener entre 3 y 100 caracteres',
  })
  category: string;

  @IsString({ message: 'El tipo de moneda debe ser una cadena de texto' })
  @IsIn(['CUP', 'MLC', 'USD'], {
    message: 'El tipo de moneda debe ser CUP, MLC o USD',
  })
  currencyType: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isVisible debe ser un booleano' })
  isVisible?: boolean;
}

// ============================================
// UPDATE PRODUCT DTO
// ============================================

export class UpdateProductDto {
  @IsOptional()
  @IsString({ message: 'El nombre del producto debe ser una cadena de texto' })
  @Length(5, 100, {
    message: 'El nombre del producto debe tener entre 5 y 100 caracteres',
  })
  name?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'El precio debe ser un número entero' })
  @Min(1, { message: 'El precio debe ser mayor o igual a 1' })
  price?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value) : null))
  originalPrice?: number | null;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(0, { message: 'La cantidad debe ser mayor o igual a 0' })
  amount?: number;

  @IsOptional()
  @IsString({ message: 'El tipo de moneda debe ser una cadena de texto' })
  @IsIn(['CUP', 'MLC', 'USD'], {
    message: 'El tipo de moneda debe ser CUP, MLC o USD',
  })
  currencyType?: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @Length(10, 500, {
    message: 'La descripción debe tener entre 10 y 500 caracteres',
  })
  description?: string;

  @IsOptional()
  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  @Length(1, 100, {
    message: 'La categoría debe tener entre 1 y 100 caracteres',
  })
  category?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean({ message: 'isVisible debe ser un booleano' })
  isVisible?: boolean;
}

// ============================================
// SELLER PRODUCTS QUERY DTO
// ============================================

export class SellerProductsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 1)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 20)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['all', 'available', 'out-of-stock', 'hidden'])
  status?: 'all' | 'available' | 'out-of-stock' | 'hidden';

  @IsOptional()
  @IsIn(['name', 'price-asc', 'price-desc', 'stock', 'newest'])
  sortBy?: 'name' | 'price-asc' | 'price-desc' | 'stock' | 'newest';
}

export class BulkDeleteDto {
  @IsArray({ message: 'productIds debe ser un array' })
  @ArrayMinSize(1, { message: 'Debe proporcionar al menos un ID de producto' })
  @IsMongoId({
    each: true,
    message: 'Cada ID debe ser un ID de MongoDB válido',
  })
  productIds: string[];
}

export class BulkVisibilityDto {
  @IsArray({ message: 'productIds debe ser un array' })
  @ArrayMinSize(1, { message: 'Debe proporcionar al menos un ID de producto' })
  @IsMongoId({
    each: true,
    message: 'Cada ID debe ser un ID de MongoDB válido',
  })
  productIds: string[];

  @IsBoolean({ message: 'isVisible debe ser un booleano' })
  isVisible: boolean;
}

export class ToggleVisibilityDto {
  @IsBoolean({ message: 'isVisible debe ser un booleano' })
  isVisible: boolean;
}

export class CategoryProductDto {
  @IsOptional()
  @IsString({ message: 'La provincia debe ser una cadena de texto' })
  province?: string;

  @IsOptional()
  @IsString({ message: 'El municipio debe ser una cadena de texto' })
  municipality?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'La página debe ser un número entero' })
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'El límite debe ser un número entero' })
  limit?: number;

  @IsOptional()
  @IsString({ message: 'El orden debe ser una cadena de texto' })
  orderBy?: string;
}

export class StoreCategoryProductDto {
  @IsOptional()
  @IsString({ message: 'La categoría debe ser un string' })
  category?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'La página debe ser un número entero' })
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'El límite debe ser un número entero' })
  limit?: number;

  @IsOptional()
  @IsString({ message: 'El orden debe ser una cadena de texto' })
  orderBy?: string;
}

export class ProductSearchDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'La página debe ser un número entero' })
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'El límite debe ser un número entero' })
  limit?: number;

  @IsOptional()
  province?: string;

  @IsOptional()
  municipality?: string;
}

export interface ProductFilter {
  seller?: string;
  category?: string;
  isVisible?: boolean;
  amount?: any;
}

export class ExportProductsDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['all', 'available', 'out-of-stock', 'hidden'])
  status?: 'all' | 'available' | 'out-of-stock' | 'hidden';

  @IsOptional()
  @IsString()
  dateFrom?: string; // ISO date string

  @IsOptional()
  @IsString()
  dateTo?: string; // ISO date string
}
