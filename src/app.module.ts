import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { ProductModule } from './product/product.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PhoneModule } from './phone/phone.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CustomerAuthModule } from './customer-auth/customer-auth.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRootAsync({
      useFactory: async () => ({
        uri: process.env.MONGODB_CLOUD,
      }),
    }),
    CloudinaryModule,
    ProductModule,
    UsersModule,
    AuthModule,
    PhoneModule,
    AnalyticsModule,
    CustomerAuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
