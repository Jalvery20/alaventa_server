import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';

async function bootstrap() {
  dotenv.config();
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const messages = errors
          .map((error) => {
            // Si constraints no existe, retornar un mensaje genérico
            if (!error.constraints) {
              return `Error de validación en el campo: ${error.property}`;
            }
            // Si existe, extraer los mensajes
            return Object.values(error.constraints).join(', ');
          })
          .filter(Boolean) // Eliminar valores vacíos
          .join('; '); // Separar múltiples errores con punto y coma

        return new BadRequestException({
          statusCode: 400,
          message: messages || 'Datos inválidos',
        });
      },
    }),
  );

  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
}

bootstrap();
