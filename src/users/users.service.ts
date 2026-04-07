import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { User } from './model/user.schema';
import {
  ExportUsersQueryDto,
  GetUsersQueryDto,
  PatchStoreDto,
  PatchUserDto,
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
import * as bcrypt from 'bcryptjs';
import { Product } from '../product/model/product.schema';

export interface PlatformStats {
  // Usuarios
  users: {
    total: number;
    newThisMonth: number;
    expired: number;
    expiringSoon: number;
    byRole: {
      administrador: number;
      tienda: number;
      vendedor: number;
    };
  };

  // Productos
  products: {
    total: number;
    available: number;
    outOfStock: number;
  };

  // Crecimiento
  growth: {
    usersThisMonth: number;
    usersLastMonth: number;
    usersPercentage: number;
  };

  // Usuarios recientes
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
    storeImg: string | null;
  }>;
}

interface UserWithProductCount {
  _id: string;
  name: string;
  role: string;
  phoneNumber: string;
  email?: string;
  province: string;
  municipality: string;
  address?: string;
  createdAt: Date;
  isAllowed: boolean;
  expiryDate?: Date;
  productsCount: number;
  storeDetails?: {
    storePic?: string;
    description?: string;
  };
}

export interface GetUsersResponse {
  success: boolean;
  data: UserWithProductCount[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    total: number;
    active: number;
    expired: number;
    expiringSoon: number;
    disabled: number;
    byRole: {
      administrador: number;
      tienda: number;
      vendedor: number;
    };
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
   * Usando queries separadas que sabemos que funcionan
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
      storeImg: string | null;
    }>
  > {
    // Paso 1: Obtener usuarios recientes
    const users = await this.userModel
      .find({ _id: { $ne: excludeUserId } })
      .select(
        'name phoneNumber role province municipality createdAt isAllowed expiryDate storeDetails.storePic',
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    if (users.length === 0) {
      return [];
    }

    // Paso 2: Obtener conteo de productos agrupado por seller
    const userIds = users.map((u) => u._id);

    const userIdsAsStrings = userIds.map((id) => id.toString());
    const productCounts = await this.productModel.aggregate([
      {
        $match: {
          seller: { $in: userIdsAsStrings },
        },
      },
      {
        $group: {
          _id: '$seller',
          count: { $sum: 1 },
        },
      },
    ]);

    // Crear mapa de conteos (usando string como key)
    const countMap = new Map<string, number>();
    productCounts.forEach((item) => {
      countMap.set(item._id.toString(), item.count);
    });

    // Paso 3: Combinar resultados
    return users.map((user) => ({
      _id: user._id.toString(),
      name: user.name || 'Sin nombre',
      phoneNumber: user.phoneNumber,
      role: user.role,
      province: user.province || '',
      municipality: user.municipality || '',
      createdAt: user.createdAt,
      isAllowed: user.isAllowed ?? true,
      expiryDate: user.expiryDate,
      productsCount: countMap.get(user._id.toString()) || 0,
      storeImg: user.storeDetails?.storePic || null,
    }));
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
  private async findUserByIdOrFail(
    id: string,
    checkAuth: boolean = false,
  ): Promise<User> {
    this.validateObjectId(id, 'ID de usuario');

    const user = await this.userModel
      .findById(id)
      .select('-password')
      .lean()
      .exec();

    if (!user) {
      if (checkAuth) {
        throw new UnauthorizedException('Usuario no autenticado');
      }
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }
    delete user.isAllowed;
    delete user.expiryDate;

    if (user.role === 'tienda') {
      delete user.storeDetails?.categories;
    }

    return user as unknown as User;
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
    } catch (error: any) {
      // No lanzar error, solo logear (no es crítico)
      this.logger.warn(
        `No se pudo eliminar imagen anterior de tienda: ${error.message}`,
      );
    }
  }

  /**
   * Calcular estadísticas de usuarios
   */
  private async calculateUserStats() {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [total, active, expired, expiringSoon, disabled, roleDistribution] =
      await Promise.all([
        // Total de usuarios
        this.userModel.countDocuments(),

        // Usuarios activos
        this.userModel.countDocuments({
          isAllowed: true,
          $or: [
            { expiryDate: { $gt: now } },
            { expiryDate: { $exists: false } },
          ],
        }),

        // Usuarios expirados
        this.userModel.countDocuments({
          expiryDate: { $exists: true, $lt: now },
        }),

        // Usuarios próximos a expirar
        this.userModel.countDocuments({
          isAllowed: true,
          expiryDate: { $gte: now, $lte: sevenDaysFromNow },
        }),

        // Usuarios deshabilitados
        this.userModel.countDocuments({ isAllowed: false }),

        // Distribución por rol
        this.userModel.aggregate([
          { $group: { _id: '$role', count: { $sum: 1 } } },
        ]),
      ]);

    const byRole = {
      administrador: 0,
      tienda: 0,
      vendedor: 0,
    };

    roleDistribution.forEach((item: { _id: string; count: number }) => {
      if (item._id in byRole) {
        byRole[item._id as keyof typeof byRole] = item.count;
      }
    });

    return {
      total,
      active,
      expired,
      expiringSoon,
      disabled,
      byRole,
    };
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

      // Filtro para usuarios de plataforma (sin admins)
      const platformUsersFilter = {
        role: { $ne: 'administrador' },
      };

      // Ejecutar queries en paralelo
      const [
        // === USUARIOS ===
        totalUsers,
        usersByRole,

        // Usuarios expirados (tiendas/vendedores con expiryDate < now)
        expiredUsers,

        // Usuarios que expiran en 7 días (tiendas/vendedores activos)
        expiringSoonUsers,

        // === USUARIOS ACTIVOS (para conteo por rol) ===
        activeTiendasCount,
        activeVendedoresCount,

        // === CRECIMIENTO (solo usuarios activos de plataforma) ===
        platformUsersThisMonth,
        platformUsersLastMonth,

        // === PRODUCTOS ===
        totalProducts,
        availableProducts,
        outOfStockProducts,

        // === DATOS COMPUESTOS ===
        recentUsersWithProducts,
      ] = await Promise.all([
        // Total usuarios
        this.userModel.countDocuments(),

        // Usuarios por rol (todos)
        this.userModel.aggregate([
          { $group: { _id: '$role', count: { $sum: 1 } } },
        ]),

        // Usuarios expirados (solo tiendas y vendedores)
        this.userModel.countDocuments({
          role: { $in: ['tienda', 'vendedor'] },
          expiryDate: { $exists: true, $lt: now },
        }),

        // Usuarios que expiran pronto (tiendas/vendedores activos)
        this.userModel.countDocuments({
          role: { $in: ['tienda', 'vendedor'] },
          isAllowed: true,
          expiryDate: { $exists: true, $gte: now, $lte: sevenDaysFromNow },
        }),

        // Tiendas activas (isAllowed: true, no expiradas)
        this.userModel.countDocuments({
          role: 'tienda',
          isAllowed: true,
          $or: [
            { expiryDate: { $gt: now } },
            { expiryDate: { $exists: false } },
          ],
        }),

        // Vendedores activos
        this.userModel.countDocuments({
          role: 'vendedor',
          isAllowed: true,
          $or: [
            { expiryDate: { $gt: now } },
            { expiryDate: { $exists: false } },
          ],
        }),

        // Nuevos usuarios de plataforma este mes (activos)
        this.userModel.countDocuments({
          ...platformUsersFilter,
          isAllowed: true,
          createdAt: { $gte: startOfMonth },
        }),

        // Usuarios de plataforma mes anterior (activos)
        this.userModel.countDocuments({
          ...platformUsersFilter,
          isAllowed: true,
          createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
        }),

        // Total productos
        this.productModel.countDocuments(),

        // Productos disponibles
        this.productModel.countDocuments({ amount: { $gt: 0 } }),

        // Productos agotados
        this.productModel.countDocuments({ amount: 0 }),

        // Usuarios recientes
        this.getRecentUsersWithProductCount(10, currentUserObjectId),
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

      // IMPORTANTE: Reemplazar conteo total de tiendas/vendedores con solo activos
      roleDistribution.tienda = activeTiendasCount;
      roleDistribution.vendedor = activeVendedoresCount;

      // Calcular crecimiento
      const usersPercentage = this.calculateGrowthPercentage(
        platformUsersThisMonth,
        platformUsersLastMonth,
      );

      return {
        users: {
          total: totalUsers,
          newThisMonth: platformUsersThisMonth,
          expired: expiredUsers,
          expiringSoon: expiringSoonUsers,
          byRole: roleDistribution,
        },
        products: {
          total: totalProducts,
          available: availableProducts,
          outOfStock: outOfStockProducts,
        },
        growth: {
          usersThisMonth: platformUsersThisMonth,
          usersLastMonth: platformUsersLastMonth,
          usersPercentage,
        },
        recentUsers: recentUsersWithProducts,
      };
    } catch (error) {
      this.logger.error('Error al obtener estadísticas de plataforma:', error);
      throw new InternalServerErrorException(
        'Error al obtener estadísticas de la plataforma',
      );
    }
  }

  /**
   * Obtener usuarios con filtros para UsersManager
   */
  async getUsersForManagement(
    query: GetUsersQueryDto,
    currentUserId: string,
  ): Promise<GetUsersResponse> {
    try {
      // Validar ID del usuario actual
      this.validateObjectId(currentUserId, 'ID de usuario');

      const {
        search = '',
        role = 'all',
        status = 'all',
        province = 'all',
        sortBy = 'newest',
        page = 1,
        limit = 20,
      } = query;

      const now = new Date();
      const sevenDaysFromNow = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000,
      );

      // ============================================
      // CONSTRUIR FILTRO BASE
      // ============================================

      const baseFilter: any = {
        // ✅ Excluir al usuario actual
        _id: { $ne: new Types.ObjectId(currentUserId) },
      };

      // Filtro por búsqueda
      if (search) {
        baseFilter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { municipality: { $regex: search, $options: 'i' } },
        ];
      }

      // Filtro por rol
      if (role !== 'all') {
        baseFilter.role = role;
      }

      // Filtro por provincia
      if (province !== 'all') {
        baseFilter.province = province;
      }

      // Filtro por estado
      switch (status) {
        case 'active':
          // Usar $and para combinar con el filtro de exclusión existente
          baseFilter.$and = baseFilter.$and || [];
          baseFilter.$and.push(
            { isAllowed: true },
            {
              $or: [
                { expiryDate: { $gt: now } },
                { expiryDate: { $exists: false } },
              ],
            },
          );
          break;
        case 'expired':
          baseFilter.expiryDate = { $exists: true, $lt: now };
          break;
        case 'expiring-soon':
          baseFilter.isAllowed = true;
          baseFilter.expiryDate = { $gte: now, $lte: sevenDaysFromNow };
          break;
        case 'disabled':
          baseFilter.isAllowed = false;
          break;
      }

      // ============================================
      // ORDENAMIENTO
      // ============================================

      let sortOptions: any = { createdAt: -1 };

      switch (sortBy) {
        case 'name':
          sortOptions = { name: 1 };
          break;
        case 'expiry':
          sortOptions = { expiryDate: 1 };
          break;
        case 'products':
          sortOptions = { createdAt: -1 };
          break;
      }

      // ============================================
      // EJECUTAR QUERIES EN PARALELO
      // ============================================

      const [users, totalUsers, statsData] = await Promise.all([
        // Obtener usuarios paginados
        this.userModel
          .find(baseFilter)
          .select('-password -__v')
          .sort(sortOptions)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean()
          .exec(),

        // Contar total de usuarios que cumplen el filtro
        this.userModel.countDocuments(baseFilter),

        // Obtener estadísticas
        this.calculateUserStats(),
      ]);

      // ============================================
      // OBTENER CONTEO DE PRODUCTOS
      // ============================================

      const userIds = users.map((u) => u._id.toString());

      const productCounts = await this.productModel.aggregate([
        { $match: { seller: { $in: userIds } } },
        { $group: { _id: '$seller', count: { $sum: 1 } } },
      ]);

      const countMap = new Map<string, number>();
      productCounts.forEach((item) => {
        countMap.set(item._id.toString(), item.count);
      });

      // ============================================
      // COMBINAR DATOS
      // ============================================

      const usersWithProducts: UserWithProductCount[] = users.map((user) => ({
        _id: user._id.toString(),
        name: user.name || 'Sin nombre',
        role: user.role,
        phoneNumber: user.phoneNumber,
        email: user.email,
        province: user.province || '',
        municipality: user.municipality || '',
        address: user.address,
        createdAt: user.createdAt,
        isAllowed: user.isAllowed ?? true,
        expiryDate: user.expiryDate,
        productsCount: countMap.get(user._id.toString()) || 0,
        storeDetails: user.storeDetails
          ? {
              storePic: user.storeDetails.storePic,
              description: user.storeDetails.description,
            }
          : undefined,
      }));

      // Ordenar por productos si se seleccionó
      if (sortBy === 'products') {
        usersWithProducts.sort((a, b) => b.productsCount - a.productsCount);
      }

      // ============================================
      // CALCULAR PAGINACIÓN
      // ============================================

      const totalPages = Math.ceil(totalUsers / limit);

      return {
        success: true,
        data: usersWithProducts,
        pagination: {
          page,
          limit,
          total: totalUsers,
          totalPages,
        },
        stats: statsData,
      };
    } catch (error) {
      this.logger.error('Error al obtener usuarios para gestión:', error);
      throw new InternalServerErrorException(
        'Error al obtener usuarios para gestión',
      );
    }
  }

  /**
   * Habilitar/Deshabilitar múltiples usuarios
   */
  async bulkToggleUserStatus(
    userIds: string[],
    isAllowed: boolean,
  ): Promise<{ success: boolean; modifiedCount: number; message: string }> {
    try {
      // Validar IDs
      userIds.forEach((id) => this.validateObjectId(id, 'ID de usuario'));

      // No permitir modificar administradores
      const adminCount = await this.userModel.countDocuments({
        _id: { $in: userIds },
        role: 'administrador',
      });

      if (adminCount > 0) {
        throw new BadRequestException(
          'No se puede modificar el estado de administradores',
        );
      }

      // Actualizar usuarios
      const result = await this.userModel.updateMany(
        { _id: { $in: userIds } },
        { $set: { isAllowed } },
      );

      return {
        success: true,
        modifiedCount: result.modifiedCount,
        message: `${result.modifiedCount} usuario(s) ${isAllowed ? 'habilitado(s)' : 'deshabilitado(s)'} correctamente`,
      };
    } catch (error) {
      this.logger.error('Error en actualización masiva de usuarios:', error);
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error al actualizar usuarios masivamente',
      );
    }
  }

  /**
   * Eliminar múltiples usuarios
   */
  async bulkDeleteUsers(userIds: string[]): Promise<{
    success: boolean;
    deletedCount: number;
    deletedProductsCount: number;
    message: string;
  }> {
    try {
      // Validar IDs
      userIds.forEach((id) => this.validateObjectId(id, 'ID de usuario'));

      // No permitir eliminar administradores
      const adminCount = await this.userModel.countDocuments({
        _id: { $in: userIds },
        role: 'administrador',
      });

      if (adminCount > 0) {
        throw new BadRequestException('No se pueden eliminar administradores');
      }

      // Obtener productos para eliminar imágenes después
      const products = await this.productModel
        .find({ seller: { $in: userIds } })
        .select('imgUrl')
        .lean()
        .exec();

      // Obtener imágenes de tiendas
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('storeDetails.storePic')
        .lean()
        .exec();

      const storeImages = users
        .filter((u) => u.storeDetails?.storePic)
        .map((u) => u.storeDetails.storePic);

      // Eliminar de DB primero
      const [deletedProducts, deletedUsers] = await Promise.all([
        this.productModel.deleteMany({ seller: { $in: userIds } }),
        this.userModel.deleteMany({ _id: { $in: userIds } }),
      ]);

      // Eliminar imágenes en background
      setImmediate(async () => {
        try {
          // Eliminar imágenes de productos
          if (products.length > 0) {
            await this.deleteProductImages(products as unknown as Product[]);
          }

          // Eliminar imágenes de tiendas
          for (const imageUrl of storeImages) {
            await this.deleteStoreImageInBackground(imageUrl);
          }

          this.logger.log(
            `Eliminadas imágenes de ${products.length} productos y ${storeImages.length} tiendas`,
          );
        } catch (error) {
          this.logger.error('Error al eliminar imágenes:', error);
        }
      });

      return {
        success: true,
        deletedCount: deletedUsers.deletedCount,
        deletedProductsCount: deletedProducts.deletedCount,
        message: `${deletedUsers.deletedCount} usuario(s) y ${deletedProducts.deletedCount} producto(s) eliminados correctamente`,
      };
    } catch (error) {
      this.logger.error('Error en eliminación masiva de usuarios:', error);
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error al eliminar usuarios masivamente',
      );
    }
  }

  /**
   * Extender fecha de expiración de usuario
   */
  async extendUserExpiry(
    id: string,
    days: number = 30,
  ): Promise<{ success: boolean; newExpiryDate: Date; message: string }> {
    try {
      this.validateObjectId(id, 'ID de usuario');

      const user = await this.userModel.findById(id).exec();

      if (!user) {
        throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
      }

      if (user.role === 'administrador') {
        throw new BadRequestException(
          'Los administradores no tienen fecha de expiración',
        );
      }

      // Calcular nueva fecha
      const now = new Date();
      const currentExpiry = user.expiryDate || now;
      const newExpiryDate = new Date(
        Math.max(currentExpiry.getTime(), now.getTime()) +
          days * 24 * 60 * 60 * 1000,
      );

      // Actualizar usuario
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          id,
          {
            expiryDate: newExpiryDate,
            isAllowed: true, // Habilitar al extender
          },
          { new: true },
        )
        .exec();

      return {
        success: true,
        newExpiryDate: updatedUser.expiryDate,
        message: `Suscripción extendida por ${days} días`,
      };
    } catch (error) {
      this.logger.error('Error al extender expiración:', error);
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error al extender fecha de expiración',
      );
    }
  }

  /**
   * Exportar usuarios con filtros
   */
  async exportUsers(query: ExportUsersQueryDto) {
    try {
      const { role = 'all', status = 'all', province = 'all' } = query;

      const now = new Date();
      const sevenDaysFromNow = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000,
      );

      // Construir filtro
      const filter: any = {};

      if (role !== 'all') {
        filter.role = role;
      }

      if (province !== 'all') {
        filter.province = province;
      }

      switch (status) {
        case 'active':
          filter.isAllowed = true;
          filter.$or = [
            { expiryDate: { $gt: now } },
            { expiryDate: { $exists: false } },
          ];
          break;
        case 'expired':
          filter.expiryDate = { $exists: true, $lt: now };
          break;
        case 'expiring-soon':
          filter.isAllowed = true;
          filter.expiryDate = { $gte: now, $lte: sevenDaysFromNow };
          break;
        case 'disabled':
          filter.isAllowed = false;
          break;
      }

      // Obtener usuarios - SOLO EXCLUSIÓN
      const users = await this.userModel
        .find(filter)
        .select('-password -__v') // ✅ Solo exclusión
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      // Obtener conteo de productos
      const userIds = users.map((u) => u._id.toString());

      const productCounts = await this.productModel.aggregate([
        { $match: { seller: { $in: userIds } } },
        { $group: { _id: '$seller', count: { $sum: 1 } } },
      ]);

      const countMap = new Map<string, number>();
      productCounts.forEach((item) => {
        countMap.set(item._id.toString(), item.count);
      });

      // Combinar datos
      const data = users.map((user) => ({
        _id: user._id.toString(),
        name: user.name || 'Sin nombre',
        role: user.role,
        phoneNumber: user.phoneNumber,
        email: user.email || '',
        province: user.province || '',
        municipality: user.municipality || '',
        address: user.address || '',
        createdAt: user.createdAt,
        isAllowed: user.isAllowed ?? true,
        expiryDate: user.expiryDate,
        productsCount: countMap.get(user._id.toString()) || 0,
      }));

      return {
        success: true,
        count: data.length,
        data,
      };
    } catch (error) {
      this.logger.error('Error al exportar usuarios:', error);
      throw new InternalServerErrorException('Error al exportar usuarios');
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

    return { users: users as unknown as User[], total, totalPages };
  }

  /**
   * Obtener usuario por ID
   */
  async getUserById(id: string): Promise<User> {
    return this.findUserByIdOrFail(id, true);
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

    return { stores: stores as unknown as User[], total, totalPages };
  }

  /**
   * Obtener tiendas sin importar ubicación
   */
  async getAllStores() {
    const storeQuery: Record<string, any> = {
      role: 'tienda',
      isAllowed: true,
    };

    const [stores, total] = await Promise.all([
      this.userModel
        .find(storeQuery)
        .select('-password')
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.userModel.countDocuments(storeQuery),
    ]);

    if (!stores?.length) {
      throw new NotFoundException(
        'No existen tiendas en la plataforma actualmente',
      );
    }

    return { stores: stores as unknown as User[], total };
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

    return user as unknown as User;
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

    return updatedUser as unknown as User;
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
      } catch (error: any) {
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
    } catch (error: any) {
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

    return updatedUser as unknown as User;
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

    return updatedUser as unknown as User;
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

    return updatedUser as unknown as User;
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
    } catch (error: any) {
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
   * PATCH User - Actualización parcial para usuarios sin storeDetails
   * (vendedores y administradores)
   */
  async patchUser(
    id: string,
    patchUserDto: PatchUserDto,
  ): Promise<{
    success: boolean;
    data: User;
    message: string;
  }> {
    // Validar ID
    this.validateObjectId(id, 'ID de usuario');

    // Validar que el usuario existe
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`Usuario con ID: ${id} no encontrado`);
    }

    // Validar que NO sea una tienda (este servicio es para vendedores/admins)
    if (user.role === 'tienda') {
      throw new BadRequestException(
        'Use el endpoint /users/store/:id para actualizar tiendas',
      );
    }

    // Validar email único si se actualiza
    if (patchUserDto.email) {
      await this.checkEmailUnique(patchUserDto.email, id);
    }

    // Construir objeto de actualización
    const updateObject: Record<string, any> = {};

    if (patchUserDto.name !== undefined) {
      updateObject.name = patchUserDto.name;
    }
    if (patchUserDto.province !== undefined) {
      updateObject.province = patchUserDto.province;
    }
    if (patchUserDto.municipality !== undefined) {
      updateObject.municipality = patchUserDto.municipality;
    }
    if (patchUserDto.address !== undefined) {
      updateObject.address = patchUserDto.address;
    }
    if (patchUserDto.email !== undefined) {
      updateObject.email = patchUserDto.email.toLowerCase().trim();
    }

    // Verificar que hay algo que actualizar
    if (Object.keys(updateObject).length === 0) {
      throw new BadRequestException(
        'No se proporcionaron campos para actualizar',
      );
    }

    try {
      // Actualizar en DB
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          id,
          { $set: updateObject },
          { new: true, runValidators: true },
        )
        .select('-password')
        .exec();

      if (!updatedUser) {
        throw new InternalServerErrorException('Error al actualizar usuario');
      }

      return {
        success: true,
        data: updatedUser,
        message: 'Usuario actualizado correctamente',
      };
    } catch (error: any) {
      if (error.code === 11000 && error.keyPattern?.email) {
        throw new ConflictException('El email ya está registrado');
      }
      throw new InternalServerErrorException(
        `Error al actualizar usuario: ${error.message}`,
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
    } catch (error: any) {
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
            await this.deleteProductImages(products as unknown as Product[]);
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
    } catch (error: any) {
      this.logger.error(`Error al eliminar usuario ${id}:`, error);
      throw new InternalServerErrorException(
        `Error al eliminar usuario: ${error.message}`,
      );
    }
  }
}
