import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class ExchangeRates {
  @Prop({ default: false })
  enabled: boolean;

  @Prop({ default: null })
  usdToCup: number | null; // 1 USD = X CUP

  @Prop({ default: null })
  eurToCup: number | null; // 1 EUR = X CUP

  @Prop({ default: null })
  mlcToCup: number | null; // 1 MLC = X CUP

  @Prop({ default: null })
  updatedAt: Date | null;
}

export const ExchangeRatesSchema = SchemaFactory.createForClass(ExchangeRates);

/**
 * Esquema para horarios de la tienda
 */
@Schema({ _id: false })
export class StoreSchedule {
  @Prop({ required: true })
  day: string;

  @Prop({ required: true })
  openingTime: string;

  @Prop({ required: true })
  closingTime: string;
}

export const StoreScheduleSchema = SchemaFactory.createForClass(StoreSchedule);

/**
 * Esquema para zonas de envío
 */
@Schema({ _id: false })
export class DeliveryZone {
  @Prop({ required: true })
  zone: string;

  @Prop({ required: true, min: 0 })
  price: number;
}

export const DeliveryZoneSchema = SchemaFactory.createForClass(DeliveryZone);

/**
 * Esquema para geolocalización
 */
@Schema({ _id: false })
export class GeoLocation {
  @Prop({ required: true, type: String, default: 'Point' })
  type: string;

  @Prop({ required: true, type: [Number], default: [0, 0] }) // [longitude, latitude]
  coordinates: number[];
}

export const GeoLocationSchema = SchemaFactory.createForClass(GeoLocation);

//  Opciones de entrega
@Schema({ _id: false })
export class DeliveryOptions {
  @Prop({ default: true })
  pickup: boolean; // Recogida en local

  @Prop({ default: false })
  delivery: boolean; // Entrega a domicilio
}

export const DeliveryOptionsSchema =
  SchemaFactory.createForClass(DeliveryOptions);

/**
 * Esquema para detalles de la tienda
 */
@Schema({ _id: false })
export class StoreDetails {
  @Prop({ default: '' })
  storePic: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: false })
  is24Hours: boolean;

  @Prop({ type: [StoreScheduleSchema], default: [] })
  schedule: StoreSchedule[];

  @Prop({ type: [DeliveryZoneSchema], default: null })
  delivery: DeliveryZone[] | null;

  @Prop({ type: [String], default: [] })
  contact: string[];

  @Prop({ type: [String], default: [] })
  categories: string[];

  @Prop({ type: [String], default: [] })
  paymentMethods: string[];

  @Prop({ type: GeoLocationSchema, default: null })
  location: GeoLocation | null;

  @Prop({
    type: DeliveryOptionsSchema,
    default: { pickup: true, delivery: false },
  })
  deliveryOptions: DeliveryOptions;

  @Prop({
    type: ExchangeRatesSchema,
    default: {
      enabled: false,
      usdToCup: null,
      eurToCup: null,
      mlcToCup: null,
      updatedAt: null,
    },
  })
  exchangeRates: ExchangeRates;
}

export const StoreDetailsSchema = SchemaFactory.createForClass(StoreDetails);
