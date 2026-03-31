import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ versionKey: false })
export class SellerContact extends Document {
  @Prop({ type: String, required: true, index: true })
  sellerPhone: string;

  @Prop({ type: String, required: true })
  sellerName: string;

  @Prop({
    type: String,
    enum: ['tienda', 'vendedor'],
    required: true,
  })
  sellerRole: string;

  @Prop({ type: String, required: true })
  date: string; // formato 'YYYY-MM-DD' para agrupar por día

  @Prop({ type: Number, default: 0 })
  clickCount: number;
}

export const SellerContactSchema = SchemaFactory.createForClass(SellerContact);

// Índice compuesto único: un documento por vendedor/día/método
SellerContactSchema.index({ sellerPhone: 1, date: 1 }, { unique: true });

// Para consultas por período
SellerContactSchema.index({ date: -1 });

// Para ranking de vendedores más contactados
SellerContactSchema.index({ sellerPhone: 1, clickCount: -1 });
