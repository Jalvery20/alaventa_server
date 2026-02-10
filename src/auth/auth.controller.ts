import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  NotFoundException,
  ConflictException,
  HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../users/model/user.schema';
import { LoginUserDto, RegisterUserDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async registerUser(
    @Body(ValidationPipe) registeUserDto: RegisterUserDto,
  ): Promise<{ token: string; user: User }> {
    try {
      const user = await this.authService.registerUser(registeUserDto);
      return user;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('El número de teléfono ya está registrado');
      }
      throw error;
    }
  }

  @Post('login')
  @HttpCode(200)
  async loginUser(
    @Body(ValidationPipe) loginUserDto: LoginUserDto,
  ): Promise<{ token: string; user: User }> {
    try {
      const user = await this.authService.loginUser(loginUserDto);
      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(
          'Número de teléfono o contraseña incorrectos',
        );
      } else {
        throw new ForbiddenException(
          'Número de teléfono o contraseña incorrectos',
        );
      }
    }
  }
}
