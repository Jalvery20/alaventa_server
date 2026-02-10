import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UploadApiResponse, UploadApiErrorResponse, v2 } from 'cloudinary';
import toStream = require('buffer-to-stream');

@Injectable()
export class CloudinaryService {
  uploadImages(
    files: Express.Multer.File[],
  ): Promise<(UploadApiResponse | UploadApiErrorResponse)[]> {
    try {
      return Promise.all(
        files.map(
          (file) =>
            new Promise<UploadApiResponse | UploadApiErrorResponse>(
              (resolve, reject) => {
                const upload = v2.uploader.upload_stream(
                  {
                    folder: 'product',
                    quality: 'auto', // Optimiza la calidad automáticamente
                    fetch_format: 'auto', // Selecciona automáticamente el mejor formato (ej. WebP si es soportado)
                  },
                  (error, result) => {
                    if (error) {
                      console.error(
                        'Error al subir imagen a Cloudinary:',
                        error,
                      );
                      return reject(error);
                    }
                    resolve(result);
                  },
                );

                toStream(file.buffer).pipe(upload);
              },
            ),
        ),
      );
    } catch (error) {
      console.error('Error al subir imágenes a Cloudinary:', error);
      throw new Error('Error al subir imágenes a Cloudinary');
    }
  }

  uploadStorePic(
    files: Express.Multer.File[],
  ): Promise<(UploadApiResponse | UploadApiErrorResponse)[]> {
    try {
      return Promise.all(
        files.map(
          (file) =>
            new Promise<UploadApiResponse | UploadApiErrorResponse>(
              (resolve, reject) => {
                const upload = v2.uploader.upload_stream(
                  {
                    folder: 'store',
                    quality: 'auto', // Optimiza la calidad automáticamente
                    fetch_format: 'auto', // Selecciona automáticamente el mejor formato (ej. WebP si es soportado)
                  },
                  (error, result) => {
                    if (error) {
                      console.error(
                        'Error al subir imagen a Cloudinary:',
                        error,
                      );
                      return reject(error);
                    }
                    resolve(result);
                  },
                );

                toStream(file.buffer).pipe(upload);
              },
            ),
        ),
      );
    } catch (error) {
      console.error('Error al subir imágenes a Cloudinary:', error);
      throw new Error('Error al subir imágenes a Cloudinary');
    }
  }

  // Función auxiliar para extraer el public_id de una URL de Cloudinary
  extractPublicIdFromUrl(url: string): string {
    const urlParts = url.split('/');
    // Obtener la carpeta y el nombre del archivo
    const folder = urlParts[urlParts.length - 2];
    const fileName = urlParts[urlParts.length - 1];
    const fileParts = fileName.split('.');
    return `${folder}/${fileParts[0]}`;
  }

  async deleteImage(publicId: string) {
    try {
      const result = await v2.uploader.destroy(publicId);

      if (result.result === 'not found' || result.result === 'ok') {
        // Considerar como éxito si la imagen no se encuentra o se elimina correctamente
        return {
          success: true,
          message: `Imagen con publicId: ${publicId} eliminada o no encontrada.`,
        };
      } else {
        throw new HttpException(
          `Error al eliminar la imagen: ${publicId}, resultado: ${result.result}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } catch (error) {
      console.error('Error al intentar eliminar la imagen:', error);
      throw new HttpException(
        `Error al intentar eliminar la imagen con publicId: ${publicId}. Detalles del error: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async eliminarImagenesCloudinary(publicIds: string[]): Promise<void> {
    for (const publicId of publicIds) {
      try {
        await this.deleteImage(publicId);
      } catch (error) {
        console.error('Error al eliminar imagen:', publicId, error);
        throw error;
      }
    }
  }
}
