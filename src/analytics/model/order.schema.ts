import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class OrderProduct {
  @Prop({ type: String, required: true })
  productId: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: Number, required: true, min: 0 })
  price: number;

  @Prop({ type: String, enum: ['CUP', 'USD', 'MLC'], default: 'CUP' })
  currency: string;

  @Prop({ type: Number, required: true, min: 1 })
  quantity: number;

  @Prop({ type: String, default: '' })
  category: string;
}

export const OrderProductSchema = SchemaFactory.createForClass(OrderProduct);

@Schema({ _id: false })
export class OrderTotals {
  @Prop({ type: Number, default: 0 })
  CUP: number;

  @Prop({ type: Number, default: 0 })
  MLC: number;

  @Prop({ type: Number, default: 0 })
  USD: number;
}

export const OrderTotalsSchema = SchemaFactory.createForClass(OrderTotals);

@Schema({ versionKey: false, timestamps: true })
export class Order extends Document {
  @Prop({ type: String, required: true, unique: true })
  transactionId: string;

  @Prop({ type: String, required: true, index: true })
  sellerPhone: string;

  @Prop({ type: String, required: true })
  sellerName: string;

  @Prop({
    type: String,
    enum: ['administrador', 'tienda', 'vendedor'],
    required: true,
  })
  sellerRole: string;

  @Prop({ type: [OrderProductSchema], required: true })
  products: OrderProduct[];

  @Prop({ type: String })
  deliveryMethod: string;

  @Prop({ type: String })
  deliveryZone: string;

  @Prop({ type: Number, default: 0 })
  deliveryPrice: number;

  @Prop({ type: String })
  deliveryAddress: string;

  @Prop({ type: OrderTotalsSchema, required: true })
  subtotals: OrderTotals;

  @Prop({ type: OrderTotalsSchema, required: true })
  totals: OrderTotals;

  @Prop({ type: Number, required: true })
  totalItems: number;

  @Prop({ type: Number, required: true })
  totalQuantity: number;

  createdAt: Date;
  updatedAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ sellerPhone: 1, createdAt: -1 });
OrderSchema.index({ 'products.category': 1 });
