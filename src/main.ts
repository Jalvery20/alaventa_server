import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { getAllowedOrigins } from './config/allowed-origins';

async function bootstrap() {
  dotenv.config();
  const allowedOrigins = getAllowedOrigins();

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
