import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ProductSchema } from './model/product.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from 'src/users/model/user.schema';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
@Module({
  imports: [
    CloudinaryModule,
    MongooseModule.forFeature([{ name: 'Product', schema: ProductSchema }]),
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule {}
