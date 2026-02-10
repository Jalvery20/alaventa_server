import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { User } from './model/user.schema';
import {
  PatchStoreDto,
  UpdatePasswordDto,
  UpdateStoreCategoriesDto,
  UpdateStoreDto,
} from './dto/user.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import {
  CreateUserDto,
  UpdateAvailableUserDto,
  UpdateUserDto,
  UpdateUserExpiryDateDto,
  UpdateUserRoleDto,
} from './dto/user.dto';
import { Product } from 'src/product/model/product.schema';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Product') private readonly productModel: Model<Product>,
    private cloudinaryService: CloudinaryService,
  ) {}

  // ============================================
  // MÉTODOS AUXILIARES PRIVADOS
  // ============================================

  /**
   * Valida que el usuario sea una tienda
   */
  private async validateStoreUser(id: string): Promise<User> {
    this.validateObjectId(id, 'ID de tienda');

    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException(`Tienda con ID: ${id} no encontrada`);
    }

    if (user.role !== 'tienda') {
      throw new BadRequestException('El usuario no es una tienda');
    }

    return user;
  }

  /**
   * Verifica si un email ya está en uso por otro usuario
   */
  private async checkEmailUnique(
    email: string,
    excludeUserId?: string,
  ): Promise<void> {
    if (!email) return;

    const query: any = {
      email: email.toLowerCase().trim(),
    };

    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    const existingUser = await this.userModel.findOne(query).exec();

    if (existingUser) {
      throw new ConflictException(
        'El email ya está registrado por otro usuario',
      );
    }
  }

  /**
   * Valida ObjectId y lanza excepción si es inválido
   */
  private validateObjectId(id: string, fieldName: string = 'ID'): void {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`${fieldName} inválido: ${id}`);
    }
  }

  /**
   * Busca usuario por ID y lanza excepción si no existe
   */
  private async findUserByIdOrFail(id: string): Promise<User> {
    this.validateObjectId(id, 'ID de usuario');

    const user = await this.userModel
      .findById(id)
      .select('-password')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }
    delete user.isAllowed;
    delete user.expiryDate;

    if (user.role === 'tienda') {
      delete user.storeDetails?.categories;
    }

    return user as User;
  }

  /**
   * Elimina imágenes de productos de Cloudinary
   */
  private async deleteProductImages(products: Product[]): Promise<void> {
    if (!products?.length) return;

    const imageUrls = products.flatMap((product) => product.imgUrl || []);

    if (!imageUrls.length) return;

    const publicIds = imageUrls.map((url) =>
      this.cloudinaryService.extractPublicIdFromUrl(url),
    );

    await this.cloudinaryService.eliminarImagenesCloudinary(publicIds);
  }

  // ============================================
  // MÉTODOS DE LECTURA
  // ============================================

  /**
   * Obtener todos los usuarios con paginación
   */
  async getAllUsers(
    page: number = 1,
    limit: number = 50,
  ): Promise<{ users: User[]; total: number; totalPages: number }> {
    const [users, total] = await Promise.all([
      this.userModel
        .find()
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return { users: users as User[], total, totalPages };
  }

  /**
   * Obtener usuario por ID
   */
  async getUserById(id: string): Promise<User> {
    return this.findUserByIdOrFail(id);
  }

  /**
   * Obtener categorias de la tienda por ID
   */
  async getStoreCategories(id: string): Promise<{ categories: string[] }> {
    this.validateObjectId(id, 'ID de tienda');

    const user = await this.userModel
      .findById(id)
      .select('name role storeDetails.categories')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException(`Tienda con ID: ${id} no encontrada`);
    }

    if (user.role !== 'tienda') {
      throw new BadRequestException('El usuario no es una tienda');
    }

    const categories = user.storeDetails?.categories || [];

    return {
      categories,
    };
  }

  /**
   * Obtener usuario por número de teléfono (usado en auth)
   */
  async getUserByPhoneNumber(phoneNumber: string): Promise<User> {
    if (!phoneNumber?.trim()) {
      throw new BadRequestException('Número de teléfono requerido');
    }

    const user = await this.userModel
      .findOne({ phoneNumber: phoneNumber.trim() })
      .exec();

    if (!user) {
      throw new NotFoundException(
        `Usuario con número de teléfono: ${phoneNumber} no encontrado`,
      );
    }

    return user;
  }

  /**
   * Obtener tiendas con filtros y paginación
   */
  async getStores(
    province: string,
    municipality: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ stores: User[]; total: number; totalPages: number }> {
    const storeQuery: Record<string, any> = {
      role: 'tienda',
      isAllowed: true,
      province,
    };

    if (municipality?.toLowerCase() !== 'todos') {
      storeQuery.municipality = municipality;
    }

    const [stores, total] = await Promise.all([
      this.userModel
        .find(storeQuery)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(storeQuery),
    ]);

    if (!stores?.length) {
      throw new NotFoundException(
        'No existen tiendas en la plataforma actualmente',
      );
    }

    const totalPages = Math.ceil(total / limit);

    return { stores: stores as User[], total, totalPages };
  }

  /**
   * Obtener tienda por nombre
   */
  async getStoreByName(name: string): Promise<User> {
    if (!name?.trim()) {
      throw new BadRequestException('Nombre de tienda requerido');
    }

    const decodedName = decodeURIComponent(name.trim());

    const user = await this.userModel
      .findOne({ name: decodedName, isAllowed: true })
      .select('-password')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException(
        `No existe ninguna tienda con el nombre: ${decodedName}`,
      );
    }

    return user as User;
  }

  // ============================================
  // MÉTODOS DE CREACIÓN
  // ============================================

  /**
   * Crear nuevo usuario (usado en auth)
   */
  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const createdUser = new this.userModel(createUserDto);
    return createdUser.save();
  }

  // ============================================
  // MÉTODOS DE ACTUALIZACIÓN
  // ============================================

  /**
   * Actualizar usuario
   */
  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    this.validateObjectId(id, 'ID de usuario');

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .select('-password')
      .lean()
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }

    return updatedUser as User;
  }

  /**
   * Actualizar tienda con imagen
   */
  async updateStore(
    id: string,
    updateStoreDto: UpdateStoreDto,
    storePic?: Express.Multer.File,
  ): Promise<User> {
    this.validateObjectId(id, 'ID de usuario');

    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }

    let updatedStorePicUrl = user.storeDetails?.storePic || '';

    // Procesar nueva imagen si se proporciona
    if (storePic) {
      // Eliminar imagen anterior y subir nueva en paralelo
      const [uploadResult] = await Promise.all([
        this.cloudinaryService.uploadStorePic([storePic]),
        user.storeDetails?.storePic
          ? this.cloudinaryService
              .deleteImage(
                this.cloudinaryService.extractPublicIdFromUrl(
                  user.storeDetails.storePic,
                ),
              )
              .catch((err) =>
                console.error('Error eliminando imagen anterior:', err),
              )
          : Promise.resolve(),
      ]);

      if (uploadResult?.length > 0) {
        updatedStorePicUrl = uploadResult[0].secure_url;
      }
    }

    // Construir objeto de actualización
    const updateData = {
      name: updateStoreDto.name || user.name,
      address: updateStoreDto.address || user.address,
      province: updateStoreDto.province || user.province,
      municipality: updateStoreDto.municipality || user.municipality,
      storeDetails: {
        storePic: updatedStorePicUrl,
        schedule: updateStoreDto.schedule ?? user.storeDetails?.schedule,
        description:
          updateStoreDto.description ?? user.storeDetails?.description,
        categories: updateStoreDto.categories ?? user.storeDetails?.categories,
        contact: updateStoreDto.contact ?? user.storeDetails?.contact,
        delivery: updateStoreDto.delivery ?? user.storeDetails?.delivery,
      },
    };

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .select('-password')
      .exec();

    return updatedUser;
  }

  /**
   * Actualizar rol de usuario
   */
  async updateUserRole(
    id: string,
    updateUserRoleDto: UpdateUserRoleDto,
  ): Promise<User> {
    this.validateObjectId(id, 'ID de usuario');

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserRoleDto, { new: true })
      .select('-password')
      .lean()
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }

    return updatedUser as User;
  }

  /**
   * Actualizar disponibilidad de usuario
   */
  async updateAvailableUser(
    id: string,
    updateAvailableUserDto: UpdateAvailableUserDto,
  ): Promise<User> {
    this.validateObjectId(id, 'ID de usuario');

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateAvailableUserDto, { new: true })
      .select('-password')
      .lean()
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }

    return updatedUser as User;
  }

  /**
   * Actualizar fecha de expiración de usuario
   */
  async updateUserExpiryDate(
    id: string,
    updateUserExpiryDateDto: UpdateUserExpiryDateDto,
  ): Promise<User> {
    this.validateObjectId(id, 'ID de usuario');

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserExpiryDateDto, { new: true })
      .select('-password')
      .lean()
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }

    return updatedUser as User;
  }

  /**
   * Actualizar contraseña
   */
  async updatePassword(
    id: string,
    updatePasswordDto: UpdatePasswordDto,
  ): Promise<{ message: string }> {
    this.validateObjectId(id, 'ID de usuario');

    const { currentPassword, newPassword, confirmPassword } = updatePasswordDto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'La nueva contraseña y la confirmación no coinciden',
      );
    }

    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.userModel
      .findByIdAndUpdate(id, { password: hashedPassword })
      .exec();

    return { message: 'Contraseña actualizada correctamente' };
  }

  // ============================================
  // PATCH STORE - Con soporte para imagen
  // ============================================

  async patchStore(
    id: string,
    patchStoreDto: PatchStoreDto,
    storePic?: Express.Multer.File,
  ): Promise<{ success: boolean; data: User; message: string }> {
    // Validar que el usuario existe y es tienda
    const user = await this.validateStoreUser(id);

    // Validar email único si se actualiza
    if (patchStoreDto.email) {
      await this.checkEmailUnique(patchStoreDto.email, id);
    }

    // Construir objeto de actualización con dot notation
    const updateObject: Record<string, any> = {};

    // Campos de primer nivel
    if (patchStoreDto.name !== undefined) {
      updateObject.name = patchStoreDto.name;
    }
    if (patchStoreDto.province !== undefined) {
      updateObject.province = patchStoreDto.province;
    }
    if (patchStoreDto.municipality !== undefined) {
      updateObject.municipality = patchStoreDto.municipality;
    }
    if (patchStoreDto.address !== undefined) {
      updateObject.address = patchStoreDto.address;
    }
    if (patchStoreDto.email !== undefined) {
      updateObject.email = patchStoreDto.email.toLowerCase().trim();
    }

    // Campos anidados en storeDetails
    if (patchStoreDto.storeDetails) {
      const d = patchStoreDto.storeDetails;

      if (d.storePic !== undefined) {
        updateObject['storeDetails.storePic'] = d.storePic;
      }
      if (d.description !== undefined) {
        updateObject['storeDetails.description'] = d.description;
      }
      if (d.contact !== undefined) {
        updateObject['storeDetails.contact'] = d.contact;
      }
      if (d.delivery !== undefined) {
        updateObject['storeDetails.delivery'] = d.delivery;
      }
      if (d.schedule !== undefined) {
        updateObject['storeDetails.schedule'] = d.schedule;
      }
      if (d.paymentMethods !== undefined) {
        updateObject['storeDetails.paymentMethods'] = d.paymentMethods;
      }
      if (d.categories !== undefined) {
        updateObject['storeDetails.categories'] = d.categories;
      }

      if (d.deliveryOptions !== undefined) {
        updateObject['storeDetails.deliveryOptions'] = d.deliveryOptions;
      }

      if (d.location !== undefined) {
        updateObject['storeDetails.location'] = d.location;
      }

      if (d.is24Hours !== undefined) {
        updateObject['storeDetails.is24Hours'] = d.is24Hours;
      }
    }

    // Procesar imagen si se proporciona
    if (storePic) {
      try {
        const previousImageUrl = user.storeDetails?.storePic;

        // Subir nueva imagen y eliminar anterior en paralelo
        const [uploadResult] = await Promise.all([
          this.cloudinaryService.uploadStorePic([storePic]),
          previousImageUrl
            ? this.cloudinaryService
                .deleteImage(
                  this.cloudinaryService.extractPublicIdFromUrl(
                    previousImageUrl,
                  ),
                )
                .catch((err) =>
                  console.error('Error eliminando imagen anterior:', err),
                )
            : Promise.resolve(),
        ]);

        if (uploadResult?.length > 0) {
          updateObject['storeDetails.storePic'] = uploadResult[0].secure_url;
        }
      } catch (error) {
        console.error('Error procesando imagen:', error);
        throw new InternalServerErrorException('Error al procesar la imagen');
      }
    }

    // Verificar que hay algo que actualizar
    if (Object.keys(updateObject).length === 0) {
      throw new BadRequestException(
        'No se proporcionaron campos para actualizar',
      );
    }

    try {
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          id,
          { $set: updateObject },
          { new: true, runValidators: true },
        )
        .select('-password')
        .exec();

      return {
        success: true,
        data: updatedUser,
        message: 'Tienda actualizada correctamente',
      };
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.email) {
        throw new ConflictException('El email ya está registrado');
      }
      throw new InternalServerErrorException(
        `Error al actualizar tienda: ${error.message}`,
      );
    }
  }

  /**
   * Actualizar categorías de una tienda
   */
  async updateStoreCategories(
    id: string,
    updateStoreCategoriesDto: UpdateStoreCategoriesDto,
  ): Promise<{
    success: boolean;
    message: string;
    categories: string[];
    previousCategories: string[];
    changes: {
      added: string[];
      removed: string[];
    };
  }> {
    // Validar que el usuario existe y es tienda
    const user = await this.validateStoreUser(id);

    // Obtener categorías anteriores
    const previousCategories = user.storeDetails?.categories || [];
    const newCategories = updateStoreCategoriesDto.categories;

    // Calcular cambios para el log
    const addedCategories = newCategories.filter(
      (cat) => !previousCategories.includes(cat),
    );
    const removedCategories = previousCategories.filter(
      (cat) => !newCategories.includes(cat),
    );

    try {
      // Actualizar las categorías
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          id,
          {
            $set: { 'storeDetails.categories': newCategories },
          },
          {
            new: true,
            runValidators: true,
          },
        )
        .select('storeDetails.categories')
        .exec();

      if (!updatedUser) {
        throw new InternalServerErrorException(
          'Error al actualizar las categorías',
        );
      }

      return {
        success: true,
        message: 'Categorías actualizadas correctamente',
        categories: updatedUser.storeDetails?.categories || [],
        previousCategories,
        changes: {
          added: addedCategories,
          removed: removedCategories,
        },
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error al actualizar categorías: ${error.message}`,
      );
    }
  }

  /**
   * Resetear contraseña a valor predeterminado (solo admin)
   */
  async resetPassword(id: string): Promise<{ message: string }> {
    this.validateObjectId(id, 'ID de usuario');

    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }

    // Contraseña predeterminada
    const newPassword = 'jenni@040602';
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.userModel
      .findByIdAndUpdate(id, { password: hashedPassword })
      .exec();

    return { message: 'Contraseña reseteada correctamente' };
  }

  // ============================================
  // MÉTODOS DE ELIMINACIÓN
  // ============================================

  /**
   * Eliminar usuario y sus productos
   */
  async deleteUser(
    id: string,
  ): Promise<{ message: string; deletedProductsCount: number }> {
    this.validateObjectId(id, 'ID de usuario');

    const user = await this.userModel.findById(id).select('-password').exec();
    if (!user) {
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }

    // Obtener productos del usuario
    const products = await this.productModel
      .find({ seller: id })
      .select('imgUrl')
      .lean()
      .exec();

    try {
      // Eliminar imágenes de Cloudinary, productos y usuario en paralelo
      await Promise.all([
        this.deleteProductImages(products as Product[]),
        this.productModel.deleteMany({ seller: id }).exec(),
        this.userModel.findByIdAndDelete(id).exec(),
      ]);

      return {
        message: 'Usuario eliminado correctamente',
        deletedProductsCount: products.length,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Error al eliminar usuario: ${error.message}`,
      );
    }
  }
}
