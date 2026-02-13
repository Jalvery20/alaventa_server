import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
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

export interface PlatformStats {
  // Usuarios
  users: {
    total: number;
    newThisMonth: number;
    withEmail: number;
    byRole: {
      administrador: number;
      tienda: number;
      vendedor: number;
    };
  };

  // Tiendas
  stores: {
    total: number;
    active: number;
    pending: number;
    expired: number;
    expiringSoon: number;
  };

  // Productos
  products: {
    total: number;
    available: number;
    outOfStock: number;
    averagePerStore: number;
  };

  // Crecimiento (solo tiendas y vendedores)
  growth: {
    usersThisMonth: number;
    usersLastMonth: number;
    usersPercentage: number;
    storesThisMonth: number;
    storesLastMonth: number;
    storesPercentage: number;
  };

  // Usuarios recientes (excluye al admin actual)
  recentUsers: Array<{
    _id: string;
    name: string;
    phoneNumber: string;
    role: string;
    province: string;
    municipality: string;
    createdAt: Date;
    isAllowed: boolean;
    expiryDate?: Date;
    productsCount: number;
  }>;

  // Top tiendas por productos
  topStores: Array<{
    _id: string;
    name: string;
    province: string;
    productsCount: number;
    isAllowed: boolean;
  }>;

  // Alertas
  alerts: {
    pendingApprovals: number;
    expiringSoon: number;
    expiredStores: number;
    storesWithoutProducts: number;
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Product') private readonly productModel: Model<Product>,
    private cloudinaryService: CloudinaryService,
  ) {}

  // ============================================
  // MÉTODOS AUXILIARES PRIVADOS
  // ============================================

  /**
   * Calcular porcentaje de crecimiento
   */
  private calculateGrowthPercentage(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
  }

  /**
   * Obtener usuarios recientes con conteo de productos
   * Excluye al administrador actual del listado
   */
  private async getRecentUsersWithProductCount(
    limit: number,
    excludeUserId: Types.ObjectId,
  ): Promise<
    Array<{
      _id: string;
      name: string;
      phoneNumber: string;
      role: string;
      province: string;
      municipality: string;
      createdAt: Date;
      isAllowed: boolean;
      expiryDate?: Date;
      productsCount: number;
    }>
  > {
    const users = await this.userModel.aggregate([
      // Excluir solo al usuario actual (muestra otros admins si existen)
      { $match: { _id: { $ne: excludeUserId } } },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'seller',
          as: 'products',
        },
      },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ['$name', 'Sin nombre'] },
          phoneNumber: 1,
          role: 1,
          province: { $ifNull: ['$province', ''] },
          municipality: { $ifNull: ['$municipality', ''] },
          createdAt: 1,
          isAllowed: { $ifNull: ['$isAllowed', true] },
          expiryDate: 1,
          productsCount: { $size: '$products' },
        },
      },
    ]);

    return users;
  }

  /**
   * Obtener top tiendas por cantidad de productos
   */
  private async getTopStoresByProducts(limit: number): Promise<
    Array<{
      _id: string;
      name: string;
      province: string;
      productsCount: number;
      isAllowed: boolean;
    }>
  > {
    const stores = await this.userModel.aggregate([
      { $match: { role: 'tienda' } },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'seller',
          as: 'products',
        },
      },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ['$name', 'Sin nombre'] },
          province: { $ifNull: ['$province', ''] },
          isAllowed: { $ifNull: ['$isAllowed', true] },
          productsCount: { $size: '$products' },
        },
      },
      { $sort: { productsCount: -1 } },
      { $limit: limit },
    ]);

    return stores;
  }

  /**
   * Contar tiendas sin productos
   */
  private async getStoresWithoutProducts(
    excludeUserId?: Types.ObjectId,
  ): Promise<number> {
    const matchFilter: Record<string, any> = {
      role: 'tienda',
      isAllowed: true,
    };

    if (excludeUserId) {
      matchFilter._id = { $ne: excludeUserId };
    }

    const result = await this.userModel.aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'seller',
          as: 'products',
        },
      },
      { $match: { products: { $size: 0 } } },
      { $count: 'total' },
    ]);

    return result[0]?.total || 0;
  }

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
   * Elimina imágenes de productos de Cloudinary usando bulk delete
   */
  private async deleteProductImages(products: Product[]): Promise<void> {
    if (!products?.length) return;

    const imageUrls = products.flatMap((product) => product.imgUrl || []);

    if (!imageUrls.length) return;

    const publicIds = imageUrls.map((url) =>
      this.cloudinaryService.extractPublicIdFromUrl(url),
    );

    const result = await this.cloudinaryService.bulkDeleteImages(publicIds);

    if (result.failed.length > 0) {
      this.logger.warn(
        `No se pudieron eliminar ${result.failed.length} imágenes de productos`,
        result.failed,
      );
    }
  }

  /**
   * Eliminar imagen de tienda en background (no bloquea)
   */
  private async deleteStoreImageInBackground(imageUrl: string): Promise<void> {
    if (!imageUrl) return;

    try {
      const publicId = this.cloudinaryService.extractPublicIdFromUrl(imageUrl);
      await this.cloudinaryService.deleteImage(publicId);
      this.logger.log(`Imagen de tienda eliminada: ${publicId}`);
    } catch (error) {
      // No lanzar error, solo logear (no es crítico)
      this.logger.warn(
        `No se pudo eliminar imagen anterior de tienda: ${error.message}`,
      );
    }
  }

  // ============================================
  // MÉTODOS DE LECTURA
  // ============================================

  /**
   * Obtener todas las estadísticas de la plataforma en una sola consulta
   * Optimizado con Promise.all para ejecutar queries en paralelo
   */
  async getPlatformStats(currentUserId: string): Promise<PlatformStats> {
    try {
      // Validar ID
      if (!isValidObjectId(currentUserId)) {
        throw new BadRequestException('ID de usuario inválido');
      }

      const currentUserObjectId = new Types.ObjectId(currentUserId);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      const sevenDaysFromNow = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000,
      );

      // Filtro para excluir al usuario actual (solo para listados)
      const excludeCurrentUser = { _id: { $ne: currentUserObjectId } };

      // Filtro para usuarios de plataforma (sin admins, sin el actual)
      const platformUsersFilter = {
        ...excludeCurrentUser,
        role: { $ne: 'administrador' },
      };

      // Ejecutar TODAS las queries en paralelo
      const [
        // === USUARIOS (conteos SIN excluir al actual) ===
        totalUsers,
        usersWithEmail,
        usersByRole,

        // === USUARIOS DE PLATAFORMA (sin admins, para growth) ===
        platformUsersThisMonth,
        platformUsersLastMonth,

        // === TIENDAS ===
        totalStores,
        activeStores,
        pendingStores,
        expiredStores,
        expiringSoonStores,
        storesThisMonth,
        storesLastMonth,
        storesWithoutProducts,

        // === PRODUCTOS ===
        totalProducts,
        availableProducts,
        outOfStockProducts,

        // === DATOS COMPUESTOS (excluyen al actual) ===
        recentUsersWithProducts,
        topStoresByProducts,
      ] = await Promise.all([
        // Total usuarios (SIN excluir al actual - conteo real)
        this.userModel.countDocuments(),

        // Usuarios con email (SIN excluir al actual)
        this.userModel.countDocuments({
          email: { $exists: true, $ne: null },
        }),

        // Usuarios por rol (SIN excluir al actual - conteo real)
        this.userModel.aggregate([
          { $group: { _id: '$role', count: { $sum: 1 } } },
        ]),

        // Usuarios de plataforma nuevos este mes (sin admins, sin el actual)
        this.userModel.countDocuments({
          ...platformUsersFilter,
          createdAt: { $gte: startOfMonth },
        }),

        // Usuarios de plataforma mes anterior (sin admins, sin el actual)
        this.userModel.countDocuments({
          ...platformUsersFilter,
          createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
        }),

        // Total tiendas
        this.userModel.countDocuments({ role: 'tienda' }),

        // Tiendas activas
        this.userModel.countDocuments({
          role: 'tienda',
          isAllowed: true,
          $or: [
            { expiryDate: { $gt: now } },
            { expiryDate: { $exists: false } },
          ],
        }),

        // Tiendas pendientes de aprobación
        this.userModel.countDocuments({
          role: 'tienda',
          isAllowed: false,
        }),

        // Tiendas expiradas
        this.userModel.countDocuments({
          role: 'tienda',
          expiryDate: { $lt: now },
        }),

        // Tiendas que expiran en 7 días
        this.userModel.countDocuments({
          role: 'tienda',
          isAllowed: true,
          expiryDate: { $gte: now, $lte: sevenDaysFromNow },
        }),

        // Tiendas nuevas este mes
        this.userModel.countDocuments({
          role: 'tienda',
          createdAt: { $gte: startOfMonth },
        }),

        // Tiendas mes anterior
        this.userModel.countDocuments({
          role: 'tienda',
          createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
        }),

        // Tiendas sin productos
        this.getStoresWithoutProducts(),

        // Total productos
        this.productModel.countDocuments(),

        // Productos disponibles
        this.productModel.countDocuments({ amount: { $gt: 0 } }),

        // Productos agotados
        this.productModel.countDocuments({ amount: 0 }),

        // Usuarios recientes (EXCLUYE al admin actual)
        this.getRecentUsersWithProductCount(10, currentUserObjectId),

        // Top tiendas por cantidad de productos
        this.getTopStoresByProducts(5),
      ]);

      // Procesar distribución por rol
      const roleDistribution = {
        administrador: 0,
        tienda: 0,
        vendedor: 0,
      };
      usersByRole.forEach((item: { _id: string; count: number }) => {
        if (item._id in roleDistribution) {
          roleDistribution[item._id as keyof typeof roleDistribution] =
            item.count;
        }
      });

      // Calcular crecimiento de usuarios de plataforma
      const usersPercentage = this.calculateGrowthPercentage(
        platformUsersThisMonth,
        platformUsersLastMonth,
      );

      // Calcular crecimiento de tiendas
      const storesPercentage = this.calculateGrowthPercentage(
        storesThisMonth,
        storesLastMonth,
      );

      // Calcular promedio de productos por tienda activa
      const averagePerStore =
        activeStores > 0
          ? Math.round((totalProducts / activeStores) * 10) / 10
          : 0;

      return {
        users: {
          total: totalUsers,
          newThisMonth: platformUsersThisMonth,
          withEmail: usersWithEmail,
          byRole: roleDistribution,
        },
        stores: {
          total: totalStores,
          active: activeStores,
          pending: pendingStores,
          expired: expiredStores,
          expiringSoon: expiringSoonStores,
        },
        products: {
          total: totalProducts,
          available: availableProducts,
          outOfStock: outOfStockProducts,
          averagePerStore,
        },
        growth: {
          usersThisMonth: platformUsersThisMonth,
          usersLastMonth: platformUsersLastMonth,
          usersPercentage,
          storesThisMonth,
          storesLastMonth,
          storesPercentage,
        },
        recentUsers: recentUsersWithProducts,
        topStores: topStoresByProducts,
        alerts: {
          pendingApprovals: pendingStores,
          expiringSoon: expiringSoonStores,
          expiredStores,
          storesWithoutProducts,
        },
      };
    } catch (error) {
      this.logger.error('Error al obtener estadísticas de plataforma:', error);
      throw new InternalServerErrorException(
        'Error al obtener estadísticas de la plataforma',
      );
    }
  }

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
   * Orden seguro: Subir nueva → Guardar en DB → Eliminar antigua
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

    // Guardar URL anterior para eliminar después si hay nueva imagen
    const previousStorePicUrl = user.storeDetails?.storePic;
    let newStorePicUrl = previousStorePicUrl || '';

    // Paso 1: Subir nueva imagen PRIMERO (si se proporciona)
    if (storePic) {
      try {
        const uploadResult = await this.cloudinaryService.uploadStorePic([
          storePic,
        ]);

        if (uploadResult.success.length > 0) {
          newStorePicUrl = uploadResult.success[0].secure_url;
        } else {
          throw new BadRequestException(
            'No se pudo subir la imagen de la tienda',
          );
        }
      } catch (error) {
        this.logger.error('Error al subir imagen de tienda:', error);
        throw new BadRequestException(
          `Error al subir imagen: ${error.message}`,
        );
      }
    }

    // Paso 2: Construir objeto de actualización
    const updateData = {
      name: updateStoreDto.name || user.name,
      address: updateStoreDto.address || user.address,
      province: updateStoreDto.province || user.province,
      municipality: updateStoreDto.municipality || user.municipality,
      storeDetails: {
        storePic: newStorePicUrl,
        schedule: updateStoreDto.schedule ?? user.storeDetails?.schedule,
        description:
          updateStoreDto.description ?? user.storeDetails?.description,
        categories: updateStoreDto.categories ?? user.storeDetails?.categories,
        contact: updateStoreDto.contact ?? user.storeDetails?.contact,
        delivery: updateStoreDto.delivery ?? user.storeDetails?.delivery,
      },
    };

    try {
      // Paso 3: Actualizar en DB
      const updatedUser = await this.userModel
        .findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
        .select('-password')
        .exec();

      // Paso 4: AHORA SÍ eliminar imagen anterior (en background)
      if (
        storePic &&
        previousStorePicUrl &&
        previousStorePicUrl !== newStorePicUrl
      ) {
        // No await - ejecutar en background
        this.deleteStoreImageInBackground(previousStorePicUrl);
      }

      return updatedUser;
    } catch (error) {
      //  Rollback: Si falla actualizar DB, eliminar imagen nueva
      if (
        storePic &&
        newStorePicUrl &&
        newStorePicUrl !== previousStorePicUrl
      ) {
        this.logger.warn('Ejecutando rollback de imagen nueva...');
        this.deleteStoreImageInBackground(newStorePicUrl);
      }

      throw new InternalServerErrorException(
        `Error al actualizar tienda: ${error.message}`,
      );
    }
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

  /**
   * Patch Store con manejo seguro de imágenes
   */
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

    // Guardar URL anterior
    const previousImageUrl = user.storeDetails?.storePic;
    let newImageUrl: string | null = null;

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

    // Paso 1: Subir nueva imagen PRIMERO (si se proporciona)
    if (storePic) {
      try {
        const uploadResult = await this.cloudinaryService.uploadStorePic([
          storePic,
        ]);

        if (uploadResult.success.length > 0) {
          newImageUrl = uploadResult.success[0].secure_url;
          updateObject['storeDetails.storePic'] = newImageUrl;
        } else {
          throw new BadRequestException('No se pudo subir la imagen');
        }
      } catch (error) {
        this.logger.error('Error procesando imagen:', error);
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
      // Paso 2: Actualizar en DB
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          id,
          { $set: updateObject },
          { new: true, runValidators: true },
        )
        .select('-password')
        .exec();

      // Paso 3: AHORA SÍ eliminar imagen anterior (en background)
      if (newImageUrl && previousImageUrl && previousImageUrl !== newImageUrl) {
        // No await - ejecutar en background
        this.deleteStoreImageInBackground(previousImageUrl);
      }

      return {
        success: true,
        data: updatedUser,
        message: 'Tienda actualizada correctamente',
      };
    } catch (error) {
      // Rollback: Si falla actualizar DB, eliminar imagen nueva
      if (newImageUrl) {
        this.logger.warn('Ejecutando rollback de imagen nueva...');
        this.deleteStoreImageInBackground(newImageUrl);
      }

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
   * Orden seguro: DB primero, Cloudinary después
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

    // Obtener imagen de tienda si existe
    const storePicUrl = user.storeDetails?.storePic;

    try {
      // Paso 1: Eliminar de DB primero (transaccionalmente)
      await Promise.all([
        this.productModel.deleteMany({ seller: id }).exec(),
        this.userModel.findByIdAndDelete(id).exec(),
      ]);

      // Paso 2: AHORA eliminar imágenes de Cloudinary (en background)
      // No bloquear el response, ejecutar en background
      setImmediate(async () => {
        try {
          // Eliminar imágenes de productos
          if (products.length > 0) {
            await this.deleteProductImages(products as Product[]);
            this.logger.log(
              `Eliminadas imágenes de ${products.length} productos del usuario ${id}`,
            );
          }

          // Eliminar imagen de tienda
          if (storePicUrl) {
            await this.deleteStoreImageInBackground(storePicUrl);
          }
        } catch (error) {
          // Solo logear, no lanzar (ya se eliminó de DB)
          this.logger.error(
            `Error al eliminar imágenes del usuario ${id}:`,
            error,
          );
        }
      });

      return {
        message: 'Usuario eliminado correctamente',
        deletedProductsCount: products.length,
      };
    } catch (error) {
      this.logger.error(`Error al eliminar usuario ${id}:`, error);
      throw new InternalServerErrorException(
        `Error al eliminar usuario: ${error.message}`,
      );
    }
  }
}
