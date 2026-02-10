import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from 'src/users/model/user.schema';
import { RegisterUserDto, LoginUserDto } from './dto/auth.dto';
import { PhoneService } from 'src/phone/phone.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private phoneService: PhoneService,
  ) {}

  async registerUser(
    registerUserDto: RegisterUserDto,
  ): Promise<{ token: string; expiration: string; user: User }> {
    const { password, confirmPassword, ...userData } = registerUserDto;
    // Validar que las contraseñas coincidan
    if (password !== confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden');
    }

    const roleOrFalse = await this.phoneService.verifyPhone(
      userData.phoneNumber,
    );

    if (!roleOrFalse) {
      throw new BadRequestException(
        'Lo sentimos. No está autorizado para registrarse.',
      );
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario con la contraseña hasheada y el rol obtenido
    const userDocument = await this.usersService.createUser({
      ...userData,
      password: hashedPassword,
      role: roleOrFalse, // asigna el rol obtenido
    });

    // Convertir el documento de Mongoose en un objeto plano
    const user = userDocument.toObject();

    // Generar token JWT
    const { token, expiration } = await this.generateJwtToken(
      user.id,
      user.role,
    );

    return { token, expiration, user };
  }

  async loginUser(
    loginUserDto: LoginUserDto,
  ): Promise<{ token: string; expiration: string; user: User }> {
    const { password, phoneNumber } = loginUserDto;

    const user = await this.usersService.getUserByPhoneNumber(phoneNumber);
    if (!user) {
      throw new NotFoundException(
        'Número de teléfono o contraseña incorrectos',
      );
    } else if (user.role !== 'administrador' && !user.isAllowed) {
      throw new Error('Esta cuenta ha sido desactivada. Contacta al soporte');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Número de teléfono o contraseña incorrectos');
    }
    // Generar token JWT
    const { token, expiration } = await this.generateJwtToken(
      user.id,
      user.role,
    );

    // Convertir el documento de Mongoose en un objeto plano
    const userObject = user.toObject();

    return { token, expiration, user: userObject };
  }

  async generateJwtToken(
    userId: string,
    role: string,
  ): Promise<{ token: string; expiration: string }> {
    const payload = { userId, role };

    // Opciones de configuración del token
    const options = {
      expiresIn: '30d', // Token válido por 30 días (un mes)
    };
    // Generar el token JWT con el payload y las opciones
    try {
      const token = this.jwtService.sign(payload, options);
      const decodedToken = this.jwtService.decode(token);
      const expiration = decodedToken.exp;
      // Convertir la fecha de expiración a una cadena ISO para facilitar su lectura
      return { token, expiration: new Date(expiration * 1000).toISOString() };
    } catch (error) {
      console.error('Error generating JWT token:', error);
      throw error; // O manejar el error de otra manera
    }
  }
}
