import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';

@Injectable()
export class StoreGuard {
  constructor(private jwtService: JwtService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException('Token no enviado');
    }

    try {
      const decoded = this.jwtService.verify(token);
      request.user = decoded;
      // Verificar que el usuario es un administrador
      if (decoded.role !== 'tienda') {
        throw new UnauthorizedException(
          'No tienes los permisos de tienda necesarios',
        );
      }
      return true;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('El token ha expirado');
      } else {
        throw new UnauthorizedException('Token inválido');
      }
    }
  }
}
