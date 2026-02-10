// edit-user.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';

@Injectable()
export class EditUserGuard implements CanActivate {
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
      const userId = request.params.id;
      if (decoded.userId === userId) {
        return true;
      } else {
        throw new UnauthorizedException(
          'No tienes permiso para editar este usuario',
        );
      }
    } catch (error) {
      console.log(error);
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('El token ha expirado');
      } else {
        throw new UnauthorizedException(
          'No tienes permiso para editar este usuario',
        );
      }
    }
  }
}
