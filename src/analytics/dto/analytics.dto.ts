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
  @IsString()
  productId: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsEnum(['CUP', 'USD', 'MLC'])
  currency: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  category?: string;
}

class TotalsDto {
  @IsNumber()
  @Min(0)
  CUP: number;

  @IsNumber()
  @Min(0)
  MLC: number;

  @IsNumber()
  @Min(0)
  USD: number;
}

export class CreateOrderDto {
  @IsString()
  @MinLength(1)
  sellerPhone: string;

  @IsString()
  @MinLength(1)
  sellerName: string;

  @IsEnum(['administrador', 'tienda', 'vendedor'])
  sellerRole: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderProductDto)
  products: OrderProductDto[];

  @IsOptional()
  @IsString()
  deliveryMethod?: string;

  @IsOptional()
  @IsString()
  deliveryZone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryPrice?: number;

  @IsOptional()
  @IsString()
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
  @IsEnum(['7d', '30d', '90d', '12m', 'all'])
  period?: string;

  @IsOptional()
  @IsString()
  sellerPhone?: string;
}

export class OrdersPaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsEnum(['7d', '30d', '90d', '12m', 'all'])
  period?: string;

  @IsOptional()
  @IsString()
  sellerPhone?: string;
}
