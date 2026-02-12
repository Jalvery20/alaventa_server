import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import * as toStream from 'buffer-to-stream';

interface UploadOptions {
  folder: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number | 'auto:good' | 'auto:best' | 'auto:eco';
  format?: 'jpg' | 'png' | 'webp';
}

interface UploadResult {
  success: UploadApiResponse[];
  failed: Array<{ file: string; error: string }>;
}

interface DeleteResult {
  deleted: string[];
  failed: Array<{ publicId: string; error: string }>;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  // Configuración por defecto
  private readonly DEFAULT_CONFIG = {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    maxWidth: 2000,
    quality: 'auto:good' as const,
    format: undefined,
  };

  /**
   * Validar archivo antes de subir
   */
  private validateFile(file: Express.Multer.File): void {
    // Validar tamaño
    if (file.size > this.DEFAULT_CONFIG.maxFileSize) {
      throw new HttpException(
        `El archivo ${file.originalname} excede el tamaño máximo de ${this.DEFAULT_CONFIG.maxFileSize / 1024 / 1024}MB`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validar tipo MIME
    if (!this.DEFAULT_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      throw new HttpException(
        `Tipo de archivo no permitido: ${file.mimetype}. Solo se permiten: ${this.DEFAULT_CONFIG.allowedMimeTypes.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Subir una imagen individual a Cloudinary
   */
  private uploadSingleImage(
    file: Express.Multer.File,
    options: UploadOptions,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      // Validar archivo
      try {
        this.validateFile(file);
      } catch (error) {
        return reject(error);
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          resource_type: 'image',
          quality: options.quality || this.DEFAULT_CONFIG.quality,

          // Solo especificar formato si es uno concreto (no 'auto')
          ...(options.format ? { format: options.format } : {}),
          // Transformaciones para optimizar
          transformation: [
            {
              width: options.maxWidth || this.DEFAULT_CONFIG.maxWidth,
              crop: 'limit', // Solo reducir si es más grande
            },
            {
              quality: options.quality || this.DEFAULT_CONFIG.quality,
              fetch_format: options.format || this.DEFAULT_CONFIG.format,
            },
          ],
          // Generar thumbnails automáticamente
          eager: [
            {
              width: 300,
              height: 300,
              crop: 'fill',
              quality: 'auto:good',
              fetch_format: 'auto', // Convertirá a WebP si el navegador lo soporta
            },
            {
              width: 800,
              height: 600,
              crop: 'limit',
              quality: 'auto:good',
              fetch_format: 'auto',
            },
          ],
          eager_async: true,
        },
        (error, result) => {
          if (error) {
            this.logger.error(
              `Error al subir ${file.originalname}:`,
              error.message,
            );
            return reject(
              new HttpException(
                `Error al subir ${file.originalname}: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
            );
          }
          resolve(result);
        },
      );

      toStream(file.buffer).pipe(uploadStream);
    });
  }

  /**
   * Subir múltiples imágenes en paralelo con manejo de errores
   */
  async uploadImages(
    files: Express.Multer.File[],
    options: Partial<UploadOptions> = {},
  ): Promise<UploadResult> {
    if (!files || files.length === 0) {
      throw new HttpException(
        'No se proporcionaron archivos para subir',
        HttpStatus.BAD_REQUEST,
      );
    }

    const uploadOptions: UploadOptions = {
      folder: options.folder || 'product',
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      quality: options.quality,
      format: options.format,
    };

    // Subir todas las imágenes en paralelo con manejo individual de errores
    const results = await Promise.allSettled(
      files.map((file) => this.uploadSingleImage(file, uploadOptions)),
    );

    const success: UploadApiResponse[] = [];
    const failed: Array<{ file: string; error: string }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        success.push(result.value);
      } else {
        failed.push({
          file: files[index].originalname,
          error: result.reason?.message || 'Error desconocido',
        });
      }
    });

    // Si todas fallaron, lanzar error
    if (success.length === 0) {
      throw new HttpException(
        `No se pudo subir ninguna imagen: ${failed.map((f) => f.error).join(', ')}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Logear advertencias si algunas fallaron
    if (failed.length > 0) {
      this.logger.warn(
        `${failed.length} imagen(es) fallaron al subir:`,
        failed,
      );
    }

    return { success, failed };
  }

  /**
   * Subir imagen de tienda (wrapper para uploadImages)
   */
  async uploadStorePic(files: Express.Multer.File[]): Promise<UploadResult> {
    return this.uploadImages(files, {
      folder: 'store',
      maxWidth: 1200,
      quality: 85,
    });
  }

  /**
   * 🔥 MEJORADO: Extraer public_id de URL de Cloudinary de forma robusta
   */
  extractPublicIdFromUrl(url: string): string {
    try {
      // Método 1: Regex robusto
      const regex = /\/v\d+\/(.+)\.\w+$/;
      const match = url.match(regex);

      if (match && match[1]) {
        return match[1];
      }

      // Método 2: Fallback manual
      const urlParts = url.split('/');
      const indexOfVersion = urlParts.findIndex((part) => part.startsWith('v'));

      if (indexOfVersion !== -1) {
        const remainingParts = urlParts.slice(indexOfVersion + 1);
        const fileNameWithExtension = remainingParts.join('/');
        const fileName = fileNameWithExtension.substring(
          0,
          fileNameWithExtension.lastIndexOf('.'),
        );
        return fileName;
      }

      // Método 3: Último recurso (original)
      const folder = urlParts[urlParts.length - 2];
      const fileName = urlParts[urlParts.length - 1];
      const fileParts = fileName.split('.');
      return `${folder}/${fileParts[0]}`;
    } catch (error) {
      this.logger.error(`Error al extraer public_id de URL: ${url}`, error);
      throw new HttpException('URL de imagen inválida', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Eliminar una imagen individual
   */
  async deleteImage(
    publicId: string,
  ): Promise<{ success: boolean; publicId: string }> {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        invalidate: true, // Invalidar cache de CDN
      });

      if (result.result === 'ok' || result.result === 'not found') {
        this.logger.log(`Imagen eliminada o no encontrada: ${publicId}`);
        return { success: true, publicId };
      }

      throw new Error(`Resultado inesperado: ${result.result}`);
    } catch (error) {
      this.logger.error(`Error al eliminar imagen ${publicId}:`, error.message);
      throw new HttpException(
        `Error al eliminar imagen: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 🔥 OPTIMIZADO: Eliminar múltiples imágenes en paralelo
   */
  async eliminarImagenesCloudinary(publicIds: string[]): Promise<DeleteResult> {
    if (!publicIds || publicIds.length === 0) {
      return { deleted: [], failed: [] };
    }

    // Eliminar todas en paralelo con manejo individual de errores
    const results = await Promise.allSettled(
      publicIds.map((publicId) => this.deleteImage(publicId)),
    );

    const deleted: string[] = [];
    const failed: Array<{ publicId: string; error: string }> = [];

    results.forEach((result, index) => {
      const publicId = publicIds[index];
      if (result.status === 'fulfilled') {
        deleted.push(publicId);
      } else {
        failed.push({
          publicId,
          error: result.reason?.message || 'Error desconocido',
        });
      }
    });

    if (failed.length > 0) {
      this.logger.warn(
        `${failed.length} imagen(es) fallaron al eliminar:`,
        failed,
      );
    }

    return { deleted, failed };
  }

  /**
   * 🔥 NUEVO: Eliminar múltiples imágenes usando API bulk (más eficiente)
   */
  async bulkDeleteImages(publicIds: string[]): Promise<DeleteResult> {
    if (!publicIds || publicIds.length === 0) {
      return { deleted: [], failed: [] };
    }

    try {
      // Cloudinary permite hasta 100 imágenes por request bulk
      const chunkSize = 100;
      const chunks: string[][] = [];

      for (let i = 0; i < publicIds.length; i += chunkSize) {
        chunks.push(publicIds.slice(i, i + chunkSize));
      }

      const results = await Promise.allSettled(
        chunks.map((chunk) =>
          cloudinary.api.delete_resources(chunk, {
            invalidate: true,
          }),
        ),
      );

      const deleted: string[] = [];
      const failed: Array<{ publicId: string; error: string }> = [];

      results.forEach((result, chunkIndex) => {
        if (result.status === 'fulfilled') {
          const response = result.value;

          // Cloudinary devuelve objeto con cada publicId y su resultado
          Object.entries(response.deleted || {}).forEach(
            ([publicId, status]) => {
              if (status === 'deleted' || status === 'not_found') {
                deleted.push(publicId);
              } else {
                failed.push({ publicId, error: `Estado: ${status}` });
              }
            },
          );
        } else {
          // Si el chunk entero falla, marcar todos como fallidos
          chunks[chunkIndex].forEach((publicId) => {
            failed.push({
              publicId,
              error: result.reason?.message || 'Error en bulk delete',
            });
          });
        }
      });

      if (failed.length > 0) {
        this.logger.warn(
          `${failed.length} imagen(es) fallaron al eliminar (bulk):`,
          failed,
        );
      }

      return { deleted, failed };
    } catch (error) {
      this.logger.error('Error en bulk delete:', error);
      // Fallback a eliminación individual
      return this.eliminarImagenesCloudinary(publicIds);
    }
  }

  /**
   * 🔥 NUEVO: Obtener información de una imagen
   */
  async getImageInfo(publicId: string): Promise<any> {
    try {
      return await cloudinary.api.resource(publicId);
    } catch (error) {
      this.logger.error(
        `Error al obtener info de imagen ${publicId}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * 🔥 NUEVO: Generar URL optimizada con transformaciones
   */
  generateOptimizedUrl(
    publicId: string,
    options: {
      width?: number;
      height?: number;
      crop?: 'fill' | 'fit' | 'limit' | 'scale';
      quality?: number | 'auto';
      format?: 'auto' | 'webp' | 'jpg';
    } = {},
  ): string {
    return cloudinary.url(publicId, {
      transformation: [
        {
          width: options.width,
          height: options.height,
          crop: options.crop || 'limit',
          quality: options.quality || 'auto',
          fetch_format: options.format || 'auto',
        },
      ],
    });
  }
}
