import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersService } from 'src/users/users.service';
import { UserSchema } from 'src/users/model/user.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PhoneService } from 'src/phone/phone.service';
import { PhoneSchema } from 'src/phone/model/phone.schema';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { ProductSchema } from 'src/product/model/product.schema';

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
