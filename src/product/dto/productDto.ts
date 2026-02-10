import {
  IsString,
  IsInt,
  Min,
  Length,
  IsMongoId,
  IsOptional,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProductDto {
  @IsString({ message: 'El nombre del producto debe ser una cadena de texto' })
  @Length(5, 100, {
    message: 'El nombre del producto debe tener entre  5 y  100 caracteres',
  })
  name: string;

  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'El precio debe ser un número entero' })
  @Min(1, { message: 'El precio debe ser mayor o igual a 1' })
  price: number;

  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(0, { message: 'La cantidad debe ser mayor o igual a 0' })
  amount: number;

  @IsMongoId({ message: 'El vendedor debe ser un ID de MongoDB válido' })
  seller: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @Length(10, 500, {
    message: 'La descripción debe tener entre  10 y  500 caracteres',
  })
  description?: string;

  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  @Length(3, 100, {
    message: 'La categoría debe tener entre  3 y  100 caracteres',
  })
  @Transform(({ value }) => value.charAt(0).toUpperCase() + value.slice(1))
  category: string;

  @IsString({ message: 'El tipo de moneda debe ser una cadena de texto' })
  @IsIn(['CUP', 'MLC', 'USD'], {
    message: 'El tipo de moneda debe ser CUP, MLC o USD',
  })
  currencyType: string;
}
export class UpdateProductDto {
  @IsOptional()
  @IsString({ message: 'El nombre del producto debe ser una cadena de texto' })
  @Length(5, 100, {
    message: 'El nombre del producto debe tener entre  5 y  100 caracteres',
  })
  name?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'El precio debe ser un número entero' })
  @Min(1, { message: 'El precio debe ser mayor o igual a  1' })
  price?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(0, { message: 'La cantidad debe ser mayor o igual a  0' })
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
    message: 'La descripción debe tener entre  10 y  500 caracteres',
  })
  description?: string;

  @IsOptional()
  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  @Length(1, 100, {
    message: 'La categoría debe tener entre  1 y  100 caracteres',
  })
  @Transform(({ value }) => value.charAt(0).toUpperCase() + value.slice(1))
  category?: string;
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
}
