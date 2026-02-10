import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ versionKey: false })
export class Phone extends Document {
  @Prop({ required: true, unique: true })
  number: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({
    required: true,
    enum: ['vendedor', 'tienda'],
    default: 'vendedor',
  })
  role: string;
}

export const PhoneSchema = SchemaFactory.createForClass(Phone);

// Agregar índice TTL al campo createdAt
PhoneSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // 24 horas en segundos
