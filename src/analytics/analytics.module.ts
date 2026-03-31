import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { GAAnalyticsService } from './ga-analytics.service';
import { Order, OrderSchema } from './model/order.schema';
import {
  SellerContact,
  SellerContactSchema,
} from './model/seller-contact.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: SellerContact.name, schema: SellerContactSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, GAAnalyticsService],
})
export class AnalyticsModule {}
