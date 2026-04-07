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
  IsNotEmpty,
  Max,
  ValidateNested,
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

  @IsOptional()
  @Transform(({ value }) => {
    // Manejar si viene como string JSON o como array
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        // Si es un solo string, convertirlo a array
        return [value];
      }
    }
    return value;
  })
  @IsArray({ message: 'keepImages debe ser un array' })
  @IsString({ each: true, message: 'Cada URL debe ser una cadena de texto' })
  keepImages?: string[];
}

// ============================================
// SELLER PRODUCTS QUERY DTO
// ============================================

export class SellerProductsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 1)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1' })
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 20)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite debe ser mayor o igual a 1' })
  limit?: number;

  @IsOptional()
  @IsString({ message: 'La búsqueda debe ser una cadena de texto' })
  search?: string;

  @IsOptional()
  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  category?: string;

  @IsOptional()
  @IsIn(['all', 'available', 'out-of-stock', 'hidden'], {
    message: 'El estado debe ser all, available, out-of-stock o hidden',
  })
  status?: 'all' | 'available' | 'out-of-stock' | 'hidden';

  @IsOptional()
  @IsIn(['name', 'price-asc', 'price-desc', 'stock', 'newest'], {
    message: 'El criterio de orden no es válido',
  })
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

export class BulkChangeCategoryDto {
  @IsString({ message: 'La categoría de origen debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La categoría de origen es requerida' })
  fromCategory: string;

  @IsString({ message: 'La categoría de destino debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La categoría de destino es requerida' })
  toCategory: string;
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
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString({ message: 'El orden debe ser una cadena de texto' })
  @IsIn(['name', 'price', 'createdAt'])
  orderBy?: string;

  @IsOptional()
  @IsString({ message: 'El orden debe ser una cadena de texto' })
  @IsIn(['asc', 'desc'], { message: 'El orden debe ser asc o desc' })
  order?: string;

  // Subcategoría para filtrar dentro de la categoría principal
  @IsOptional()
  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  category?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  @IsNumber({}, { message: 'El precio mínimo debe ser un número' })
  @Min(0, { message: 'El precio mínimo debe ser mayor o igual a 0' })
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  @IsNumber({}, { message: 'El precio máximo debe ser un número' })
  @Min(0, { message: 'El precio máximo debe ser mayor o igual a 0' })
  maxPrice?: number;
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

export interface ProductFilter {
  seller?: string;
  category?: string;
  isVisible?: boolean;
  amount?: any;
}

export class ExportProductsDto {
  @IsOptional()
  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  category?: string;

  @IsOptional()
  @IsIn(['all', 'available', 'out-of-stock', 'hidden'], {
    message: 'El estado debe ser all, available, out-of-stock o hidden',
  })
  status?: 'all' | 'available' | 'out-of-stock' | 'hidden';

  @IsOptional()
  @IsString({ message: 'La fecha de inicio debe ser una cadena de texto' })
  dateFrom?: string; // ISO date string

  @IsOptional()
  @IsString({ message: 'La fecha de fin debe ser una cadena de texto' })
  dateTo?: string; // ISO date string
}

export class CartRecommendationsDto {
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Debe enviar al menos un producto en el carrito',
  })
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  cartItems: CartItemDto[];

  @IsOptional()
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite debe ser mayor o igual a 1' })
  @Max(20, { message: 'El límite no debe exceder 20' })
  @Type(() => Number)
  limit?: number = 8;
}

class CartItemDto {
  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La categoría es requerida' })
  category: string;

  @IsString({ message: 'El ID del vendedor debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El ID del vendedor es requerido' })
  sellerId: string; // seller ID

  @IsString({ message: 'El ID del producto debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El ID del producto es requerido' })
  productId: string; // Para excluirlo de las recomendaciones
}

export class ProductSearchDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString({ message: 'La provincia debe ser una cadena de texto' })
  province?: string;

  @IsOptional()
  @IsString({ message: 'El municipio debe ser una cadena de texto' })
  municipality?: string;

  @IsOptional()
  @IsString({ message: 'El criterio de orden debe ser una cadena de texto' })
  @IsIn(['relevance', 'price_asc', 'price_desc', 'newest', 'rating'], {
    message: 'El criterio de orden no es válido',
  })
  sortBy?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  @IsNumber({}, { message: 'El precio mínimo debe ser un número' })
  @Min(0, { message: 'El precio mínimo debe ser mayor o igual a 0' })
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  @IsNumber({}, { message: 'El precio máximo debe ser un número' })
  @Min(0, { message: 'El precio máximo debe ser mayor o igual a 0' })
  maxPrice?: number;
}

/**
 * DTO para obtener productos de tienda con filtros
 */
export class GetStoreProductsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1' })
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite debe ser mayor o igual a 1' })
  @Max(100, { message: 'El límite no debe exceder 100' })
  limit?: number;

  @IsOptional()
  @IsString({ message: 'El criterio de orden debe ser una cadena de texto' })
  @IsIn(['name', 'price', 'createdAt'], {
    message: 'El criterio de orden debe ser name, price o createdAt',
  })
  orderBy?: string;

  @IsOptional()
  @IsString({ message: 'El orden debe ser una cadena de texto' })
  @IsIn(['asc', 'desc'], { message: 'El orden debe ser asc o desc' })
  order?: string;

  @IsOptional()
  @IsString({ message: 'La categoría principal debe ser una cadena de texto' })
  p_category?: string;

  @IsOptional()
  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  category?: string;

  @IsOptional()
  @IsString({ message: 'La búsqueda debe ser una cadena de texto' })
  search?: string;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: 'El precio mínimo debe ser un número' })
  @Min(0, { message: 'El precio mínimo debe ser mayor o igual a 0' })
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: 'El precio máximo debe ser un número' })
  @Min(0, { message: 'El precio máximo debe ser mayor o igual a 0' })
  maxPrice?: number;
}
