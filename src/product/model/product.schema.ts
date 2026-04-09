import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ versionKey: false, timestamps: true })
export class Product extends Document {
  @Prop({
    type: String,
    required: [true, 'El nombre del producto es requerido'],
    minlength: [5, 'El nombre del producto debe tener al menos 5 caracteres'],
    maxlength: [
      100,
      'El nombre del producto no debe exceder los 100 caracteres',
    ],
  })
  name: string;

  @Prop({
    type: Number,
    required: [true, 'El precio es requerido'],
    min: [1, 'El precio debe ser mayor o igual a 1'],
  })
  price: number;

  @Prop({
    type: Number,
    min: [1, 'El precio original debe ser mayor o igual a 1'],
  })
  originalPrice?: number;

  @Prop({
    type: String,
    enum: ['CUP', 'USD', 'MLC', 'EUR'],
    default: 'CUP',
    required: [true, 'El tipo de moneda es requerido'],
  })
  currencyType: string;

  @Prop({
    type: Boolean,
    default: false,
  })
  applyExchangeRate: boolean;

  @Prop({
    type: Number,
    required: [true, 'La cantidad es requerida'],
    min: [0, 'La cantidad debe ser mayor o igual a 0'],
  })
  amount: number;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: [true, 'El vendedor es requerido'],
    index: true,
  })
  seller: Types.ObjectId;

  @Prop({
    type: [String],
    required: [true, 'La URL de la imagen es requerida'],
  })
  imgUrl: string[];

  @Prop({
    type: String,
    minlength: [10, 'La descripción debe tener al menos 10 caracteres'],
    maxlength: [500, 'La descripción no debe exceder los 500 caracteres'],
  })
  description?: string;

  @Prop({
    type: String,
    required: [true, 'La categoría es requerida'],
    minlength: [3, 'La categoría debe tener al menos 3 caracteres'],
    maxlength: [100, 'La categoría no debe exceder los 100 caracteres'],
    index: true, // Índice para búsquedas por categoría
  })
  category: string;

  @Prop({
    type: Boolean,
    default: true,
    index: true,
  })
  isVisible: boolean;

  // Timestamps automáticos
  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Índices compuestos para queries frecuentes
ProductSchema.index({ seller: 1, category: 1, createdAt: -1 });
ProductSchema.index({ seller: 1, isVisible: 1, amount: 1 });
ProductSchema.index({ seller: 1, createdAt: -1 });
ProductSchema.index({ category: 1, seller: 1 });
ProductSchema.index({ name: 'text' });
