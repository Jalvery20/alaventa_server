import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserSchema } from '../users/model/user.schema';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PhoneSchema } from '../phone/model/phone.schema';
import { ProductSchema } from '../product/model/product.schema';
import { UsersService } from '../users/users.service';
import { PhoneService } from '../phone/phone.service';

@Module({
  imports: [
    CloudinaryModule,
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'Phone', schema: PhoneSchema },
      { name: 'Product', schema: ProductSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [AuthService, UsersService, PhoneService],
  controllers: [AuthController],
})
export class AuthModule {}
