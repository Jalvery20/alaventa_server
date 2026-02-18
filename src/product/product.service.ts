import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Product } from './model/product.schema';
import {
  CartRecommendationsDto,
  CreateProductDto,
  ProductFilter,
  ProductSearchDto,
  SellerProductsQueryDto,
  UpdateProductDto,
} from './dto/productDto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { User } from 'src/users/model/user.schema';
import { PRODUCT_CATEGORIES } from './constants/categories.constants';

interface CategoryStats {
  category: string;
  count: number;
  percentage: number;
}

export interface DashboardStats {
  products: {
    total: number;
    available: number;
    outOfStock: number;
  };
  recentProducts: Product[];
  topCategories: CategoryStats[];
}

export interface ProductExportData {
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  currencyType: string;
  amount: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SellerProductsResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    total: number;
    available: number;
    outOfStock: number;
    hidden: number;
  };
}

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectModel('Product') private readonly productModel: Model<Product>,
    @InjectModel('User') private readonly userModel: Model<User>,
    private cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Valida un ObjectId y lanza excepción si es inválido
   */
  private validateObjectId(id: string, fieldName: string = 'ID'): void {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`${fieldName} inválido: ${id}`);
    }
  }

  /**
   * Método privado reutilizable para obtener IDs de vendedores permitidos
   */
  private async getAllowedSellerIds(
    province: string,
    municipality?: string,
  ): Promise<string[]> {
    const sellerQuery: Record<string, any> = {
      isAllowed: true,
      province,
    };

    if (municipality && municipality.toLowerCase() !== 'todos') {
      sellerQuery.municipality = municipality;
    }

    const sellers = await this.userModel
      .find(sellerQuery)
      .select('_id')
      .lean()
      .exec();

    return sellers.map((seller) => seller._id.toString());
  }

  /**
   * Método privado para eliminar imágenes de Cloudinary
   */
  private async eliminarImagenesProducto(urls: string[]): Promise<void> {
    if (!urls?.length) return;

    const publicIds = urls.map((url) =>
      this.cloudinaryService.extractPublicIdFromUrl(url),
    );
    await this.cloudinaryService.eliminarImagenesCloudinary(publicIds);
  }

  private async verifyProductOwnership(
    productId: string,
    sellerId: string,
  ): Promise<Product> {
    const product = await this.productModel.findById(productId).lean().exec();
    if (!product) {
      throw new NotFoundException(`Producto con ID ${productId} no encontrado`);
    }
    if (product.seller.toString() !== sellerId) {
      throw new ForbiddenException(
        'No tienes permiso para modificar este producto',
      );
    }
    return product;
  }

  /**
   * Eliminar imágenes en background sin bloquear response
   */
  private async eliminarImagenesEnBackground(urls: string[]): Promise<void> {
    try {
      const publicIds = urls.map((url) =>
        this.cloudinaryService.extractPublicIdFromUrl(url),
      );

      const deleteResult =
        await this.cloudinaryService.bulkDeleteImages(publicIds);

      if (deleteResult.failed.length > 0) {
        this.logger.warn(
          `No se pudieron eliminar ${deleteResult.failed.length} imagen(es) antiguas`,
          deleteResult.failed,
        );
      } else {
        this.logger.log(
          `${deleteResult.deleted.length} imagen(es) antiguas eliminadas`,
        );
      }
    } catch (error) {
      // No lanzar error, solo logear
      this.logger.error('Error al eliminar imágenes en background:', error);
    }
  }

  // ============================================
  // MÉTODOS PARA PANEL DE ADMINISTRACIÓN
  // ============================================

  async getSellerProductsWithFilters(
    sellerId: string,
    query: SellerProductsQueryDto,
  ): Promise<SellerProductsResponse> {
    this.validateObjectId(sellerId, 'ID de vendedor');

    const {
      page = 1,
      limit = 20,
      search,
      category,
      status = 'all',
      sortBy = 'newest',
    } = query;

    const filter: Record<string, any> = { seller: sellerId };

    switch (status) {
      case 'available':
        filter.amount = { $gt: 0 };
        filter.isVisible = true;
        break;
      case 'out-of-stock':
        filter.amount = 0;
        break;
      case 'hidden':
        filter.isVisible = false;
        break;
    }

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (search?.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$and = [
        {
          $or: [
            { name: searchRegex },
            { category: searchRegex },
            { description: searchRegex },
          ],
        },
      ];
    }

    const sortObject: Record<string, 1 | -1> =
      sortBy === 'name'
        ? { name: 1 }
        : sortBy === 'price-asc'
          ? { price: 1 }
          : sortBy === 'price-desc'
            ? { price: -1 }
            : sortBy === 'stock'
              ? { amount: -1 }
              : { createdAt: -1 };

    // Usar el mismo string que funciona en find()
    const [products, total, stats] = await Promise.all([
      this.productModel
        .find(filter)
        .sort(sortObject)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),

      this.productModel.countDocuments(filter),

      // Aggregate usando $expr para convertir el seller a string y comparar
      this.productModel.aggregate([
        {
          $match: {
            $expr: {
              $eq: [{ $toString: '$seller' }, sellerId],
            },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            available: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$amount', 0] },
                      { $eq: ['$isVisible', true] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            outOfStock: { $sum: { $cond: [{ $eq: ['$amount', 0] }, 1, 0] } },
            hidden: { $sum: { $cond: [{ $eq: ['$isVisible', false] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const statsResult = stats[0] || {
      total: 0,
      available: 0,
      outOfStock: 0,
      hidden: 0,
    };

    return {
      products: products as Product[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: statsResult.total,
        available: statsResult.available,
        outOfStock: statsResult.outOfStock,
        hidden: statsResult.hidden,
      },
    };
  }

  /**
   * Corregir productos con isVisible: null -> true
   * Mantiene los que tienen isVisible: false
   */
  /* async fixNullVisibility(): Promise<{
    modifiedCount: number;
    matchedCount: number;
  }> {
    const result = await this.productModel.updateMany(
      {
        $or: [{ isVisible: null }, { isVisible: { $exists: false } }],
      },
      { $set: { isVisible: true } },
    );

    this.logger.log(
      `Fixed visibility: ${result.modifiedCount} products updated out of ${result.matchedCount} matched`,
    );

    return {
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    };
  }*/

  /**
   * Obtener productos recomendados basados en el carrito
   * Obtiene la ubicación de los sellers del carrito
   * Estrategia de scoring:
   * - +10 puntos: producto de misma tienda del carrito
   * - +5 puntos: producto de misma categoría del carrito
   */
  async getCartRecommendations(
    dto: CartRecommendationsDto,
  ): Promise<Product[]> {
    const { cartItems, limit = 8 } = dto;

    const categories = [...new Set(cartItems.map((item) => item.category))];
    const storeIds = [...new Set(cartItems.map((item) => item.sellerId))];
    const productIdsToExclude = cartItems.map((item) => item.productId);

    // Validar IDs
    storeIds.forEach((id) => this.validateObjectId(id, 'ID de tienda'));
    productIdsToExclude.forEach((id) =>
      this.validateObjectId(id, 'ID de producto'),
    );

    const baseFilter = {
      _id: { $nin: productIdsToExclude },
      amount: { $gt: 0 },
      isVisible: true,
    };

    const populateOptions = {
      path: 'seller',
      select: 'name phoneNumber role storeDetails province municipality',
    };

    try {
      let recommendations: Product[] = [];
      let remainingLimit = limit;

      // PRIORIDAD 1: Productos de las mismas categorías (cualquier tienda)
      if (remainingLimit > 0) {
        const categoryProducts = await this.productModel
          .find({
            ...baseFilter,
            category: { $in: categories },
          })
          .populate(populateOptions)
          .sort({ createdAt: -1 })
          .limit(remainingLimit)
          .lean()
          .exec();

        recommendations = [...categoryProducts];
        remainingLimit = limit - recommendations.length;

        // Actualizar exclusiones para evitar duplicados
        const foundIds = categoryProducts.map((p) => p._id.toString());
        baseFilter._id = { $nin: [...productIdsToExclude, ...foundIds] };
      }

      // PRIORIDAD 2: Productos de las mismas tiendas (cualquier categoría)
      if (remainingLimit > 0) {
        const storeProducts = await this.productModel
          .find({
            ...baseFilter,
            seller: { $in: storeIds },
          })
          .populate(populateOptions)
          .sort({ createdAt: -1 })
          .limit(remainingLimit)
          .lean()
          .exec();

        recommendations = [...recommendations, ...storeProducts];
        remainingLimit = limit - recommendations.length;

        // Actualizar exclusiones
        baseFilter._id = {
          $nin: [
            ...productIdsToExclude,
            ...recommendations.map((p) => p._id.toString()),
          ],
        };
      }

      // PRIORIDAD 3 (FALLBACK): Productos recientes de cualquier tienda
      if (remainingLimit > 0) {
        const recentProducts = await this.productModel
          .find(baseFilter)
          .populate(populateOptions)
          .sort({ createdAt: -1 })
          .limit(remainingLimit)
          .lean()
          .exec();

        recommendations = [...recommendations, ...recentProducts];
      }

      return recommendations as Product[];
    } catch (error) {
      this.logger.error('Error al obtener recomendaciones:', error);
      throw new HttpException(
        'Error al obtener productos recomendados',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async toggleProductVisibility(
    productId: string,
    isVisible: boolean,
    sellerId: string,
  ): Promise<{ success: boolean; product: Product }> {
    this.validateObjectId(productId, 'ID de producto');
    await this.verifyProductOwnership(productId, sellerId);

    const updatedProduct = await this.productModel
      .findByIdAndUpdate(productId, { isVisible }, { new: true })
      .lean()
      .exec();

    return { success: true, product: updatedProduct as Product };
  }

  /**
   * Actualizar visibilidad de múltiples productos
   */
  async bulkUpdateVisibility(
    productIds: string[],
    isVisible: boolean,
    sellerId: string,
  ): Promise<{ success: boolean; modifiedCount: number }> {
    // Validar todos los IDs
    productIds.forEach((id) => this.validateObjectId(id, 'ID de producto'));

    // Verificar que todos los productos pertenecen al vendedor
    const products = await this.productModel
      .find({
        _id: { $in: productIds },
        seller: sellerId,
      })
      .select('_id')
      .lean()
      .exec();

    if (products.length !== productIds.length) {
      throw new ForbiddenException(
        'Algunos productos no te pertenecen o no existen',
      );
    }

    const result = await this.productModel.updateMany(
      { _id: { $in: productIds }, seller: sellerId },
      { isVisible },
    );

    return {
      success: true,
      modifiedCount: result.modifiedCount,
    };
  }

  /**
   * Obtener todos los productos con paginación
   */
  async obtenerTodos(
    page: number = 1,
    limit: number = 50,
  ): Promise<{ products: Product[]; total: number; totalPages: number }> {
    const [products, total] = await Promise.all([
      this.productModel
        .find()
        .select('name price category imgUrl createdAt seller')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.productModel.estimatedDocumentCount(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return { products, total, totalPages };
  }

  /**
   * Obtener producto por ID con información del vendedor
   */
  async obtenerPorId(id: string): Promise<any> {
    // Validar ObjectId
    this.validateObjectId(id, 'ID de producto');

    const producto = await this.productModel
      .findById(id)
      .populate<{ seller: User }>({
        path: 'seller',
        select: 'name phoneNumber role storeDetails province municipality',
      })
      .lean()
      .exec();

    if (!producto) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    if (!producto.seller) {
      throw new NotFoundException('Vendedor no encontrado');
    }

    // Desestructurar para separar seller del resto del producto
    const { seller, ...productoData } = producto;

    return {
      ...productoData,
      seller: {
        name: seller.name,
        province: seller.province,
        municipality: seller.municipality,
        phoneNumber: seller.phoneNumber,
        role: seller.role,
        storeDetails: {
          storePic: seller.storeDetails?.storePic,
          schedule: seller.storeDetails?.schedule,
          delivery: seller.storeDetails?.delivery,
        },
      },
    };
  }

  /**
   * Buscar productos por vendedor
   */
  async findProductByVendedor(seller: string): Promise<Product[]> {
    // Validar ObjectId
    this.validateObjectId(seller, 'ID de vendedor');

    const products = await this.productModel.find({ seller }).lean().exec();

    if (!products || products.length === 0) {
      throw new NotFoundException(
        `No se encontraron productos del vendedor con ID ${seller}`,
      );
    }

    return products;
  }

  /**
   * Buscar productos de una tienda específica con filtros
   */
  async findProductByStore(
    seller: string,
    page: number = 1,
    limit: number = 10,
    orderBy: string = 'createdAt',
    category: string = 'todos los productos',
  ): Promise<{ products: Product[]; totalPages: number }> {
    const cleanedSellerId = seller.trim();

    // Validar ObjectId
    this.validateObjectId(cleanedSellerId, 'ID de vendedor');

    const filter: ProductFilter = { seller: cleanedSellerId };

    if (category !== 'todos los productos') {
      filter.category = category;
    }

    const sortObject: any = {};
    if (orderBy !== 'createdAt') {
      sortObject[orderBy] = 1;
    }
    sortObject['createdAt'] = -1;

    // Ejecutar queries en paralelo
    const [products, totalProducts] = await Promise.all([
      this.productModel
        .find(filter)
        .sort(sortObject)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.productModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalProducts / limit);

    return {
      products,
      totalPages,
    };
  }

  /**
   * Buscar productos por nombre con filtros avanzados
   */
  async findProductByName(
    name: string,
    query: ProductSearchDto,
  ): Promise<{
    products: Product[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const cleanedName = name.trim().toLowerCase();

    if (!cleanedName) {
      throw new BadRequestException(
        'El nombre de búsqueda no puede estar vacío',
      );
    }

    const {
      page = 1,
      limit = 18,
      province = 'Villa Clara',
      municipality = 'todos',
      sortBy = 'relevance',
      minPrice,
      maxPrice,
    } = query;

    // Obtener vendedores permitidos
    const sellerIdsAllowed = await this.getAllowedSellerIds(
      province,
      municipality,
    );

    if (sellerIdsAllowed.length === 0) {
      return {
        products: [],
        total: 0,
        totalPages: 0,
        currentPage: page,
      };
    }

    // Construir filtro base
    const filter: Record<string, any> = {
      name: { $regex: cleanedName, $options: 'i' },
      seller: { $in: sellerIdsAllowed },
      isVisible: true,
      amount: { $gt: 0 },
    };

    // Filtro de rango de precios
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) {
        filter.price.$gte = minPrice;
      }
      if (maxPrice !== undefined) {
        filter.price.$lte = maxPrice;
      }
    }

    // Construir ordenamiento
    const sortObject: Record<string, 1 | -1> = {};

    switch (sortBy) {
      case 'price_asc':
        sortObject.price = 1;
        sortObject.createdAt = -1;
        break;
      case 'price_desc':
        sortObject.price = -1;
        sortObject.createdAt = -1;
        break;
      case 'newest':
        sortObject.createdAt = -1;
        break;
      case 'relevance':
      default:
        // Con $regex no se puede usar textScore
        // Ordenar por fecha como fallback para relevancia
        sortObject.createdAt = -1;
        break;
    }

    try {
      const [products, total] = await Promise.all([
        this.productModel
          .find(filter)
          .populate({
            path: 'seller',
            select:
              'name phoneNumber role storeDetails.storePic storeDetails.delivery province municipality',
          })
          .sort(sortObject)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean()
          .exec(),
        this.productModel.countDocuments(filter),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        products: products as Product[],
        total,
        totalPages,
        currentPage: page,
      };
    } catch (error) {
      this.logger.error(
        `Error en búsqueda de productos: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Error al buscar productos',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Obtener colección de productos recientes
   */
  async findCollection(
    province: string,
    municipality: string,
  ): Promise<Product[]> {
    // Usar método reutilizable para obtener vendedores permitidos
    const sellerIdsAllowed = await this.getAllowedSellerIds(
      province,
      municipality,
    );

    const products = await this.productModel
      .find({ seller: { $in: sellerIdsAllowed } })
      .populate({
        path: 'seller',
        select: 'name phoneNumber role storeDetails province municipality',
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .exec();

    if (!products || products.length === 0) {
      throw new NotFoundException('No se encontraron productos');
    }

    return products;
  }

  /**
   * Buscar productos por categoría
   */
  async findProductByCategory(
    category: string,
    page: number,
    limit: number,
    orderBy: string,
    province: string,
    municipality: string,
  ): Promise<any> {
    const cleanedCategory = category.trim();
    let categoriesToSearch = [cleanedCategory];

    const mainCategory = PRODUCT_CATEGORIES.find(
      (cat) => cat.name.toLowerCase() === cleanedCategory.toLowerCase(),
    );

    if (mainCategory) {
      categoriesToSearch = [
        mainCategory.name,
        ...mainCategory.subcategories.map((subcat) => subcat),
      ];
    }

    // Construir query
    const query: Record<string, any> = {};

    if (cleanedCategory.toLowerCase() !== 'todos los productos') {
      query.category = { $in: categoriesToSearch };
    }

    // Obtener vendedores permitidos
    const sellerIdsAllowed = await this.getAllowedSellerIds(
      province,
      municipality,
    );
    query.seller = { $in: sellerIdsAllowed };

    // Construir objeto de ordenamiento
    const sortObject: Record<string, any> = {};
    if (orderBy !== 'createdAt') {
      sortObject[orderBy] = 1;
    }
    sortObject['createdAt'] = -1;

    // Ejecutar queries en paralelo
    const [products, totalProducts] = await Promise.all([
      this.productModel
        .find(query)
        .populate({
          path: 'seller',
          select:
            'name phoneNumber role storeDetails.storePic storeDetails.delivery province municipality',
        })
        .sort(sortObject)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.productModel.countDocuments(query),
    ]);

    if (!products || products.length === 0) {
      throw new NotFoundException(
        `No se encontraron productos en la categoría '${category}'`,
      );
    }

    const totalPages = Math.ceil(totalProducts / limit);

    return {
      products,
      totalPages,
    };
  }

  /**
   * Crear nuevo producto con subida de imágenes
   */
  async crearProducto(
    productoDto: CreateProductDto,
    imagenes: Express.Multer.File[],
  ): Promise<Product> {
    // Validar seller ID
    this.validateObjectId(productoDto.seller.toString(), 'ID de vendedor');

    // Verificar que el vendedor existe y tiene permisos
    const seller = await this.userModel
      .findById(productoDto.seller)
      .lean()
      .exec();

    if (!seller) {
      throw new NotFoundException(
        `Vendedor con ID ${productoDto.seller} no encontrado`,
      );
    }

    if (!seller.isAllowed) {
      throw new ForbiddenException(
        'El vendedor no tiene permisos para crear productos',
      );
    }

    // Validar precio original si existe
    if (
      productoDto.originalPrice &&
      productoDto.originalPrice <= productoDto.price
    ) {
      throw new BadRequestException(
        'El precio original debe ser mayor al precio de venta',
      );
    }

    // Subir imágenes a Cloudinary
    const uploadResult = await this.cloudinaryService.uploadImages(imagenes, {
      folder: 'product',
      maxWidth: 2000,
      quality: 85,
    });

    // Verificar si hubo fallos
    if (uploadResult.failed.length > 0) {
      this.logger.warn(
        `${uploadResult.failed.length} imágenes fallaron`,
        uploadResult.failed,
      );
    }

    // Usar solo las exitosas
    const nuevoProducto = new this.productModel({
      ...productoDto,
      imgUrl: uploadResult.success.map((img) => img.secure_url),
    });

    try {
      return await nuevoProducto.save();
    } catch (error) {
      // Rollback: eliminar imágenes usando bulk delete (más rápido)
      const publicIds = uploadResult.success.map((img) =>
        this.cloudinaryService.extractPublicIdFromUrl(img.secure_url),
      );
      await this.cloudinaryService.bulkDeleteImages(publicIds);

      throw new BadRequestException(
        `Error al crear producto: ${error.message}`,
      );
    }
  }

  /**
   * Editar producto existente
   */
  async editarProducto(
    id: string,
    productoDto: UpdateProductDto,
    imagenes: Express.Multer.File[],
    sellerId: string,
  ): Promise<Product> {
    // Validar ObjectId
    this.validateObjectId(id, 'ID de producto');

    // Obtener producto existente
    const productoExistente = await this.productModel
      .findById(id)
      .lean()
      .exec();

    if (!productoExistente) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    // Verificar ownership
    if (productoExistente.seller.toString() !== sellerId) {
      throw new ForbiddenException(
        'No tienes permiso para editar este producto',
      );
    }

    // Validar precio original si se proporciona
    if (
      productoDto.originalPrice !== undefined &&
      productoDto.price !== undefined &&
      productoDto.originalPrice <= productoDto.price
    ) {
      throw new BadRequestException(
        'El precio original debe ser mayor al precio de venta',
      );
    }

    // Preparar datos de actualización
    const updateData: any = { ...productoDto };

    let imagenesAntiguasParaEliminar: string[] = [];

    // Manejo seguro de imágenes
    if (imagenes && imagenes.length > 0) {
      // Validar número de imágenes
      if (imagenes.length > 5) {
        throw new BadRequestException('Máximo 5 imágenes permitidas');
      }

      try {
        // Paso 1: Subir nuevas imágenes PRIMERO
        const uploadResult = await this.cloudinaryService.uploadImages(
          imagenes,
          {
            folder: 'product',
            maxWidth: 2000,
            quality: 85,
          },
        );

        // Verificar que se subieron correctamente
        if (uploadResult.success.length === 0) {
          throw new BadRequestException(
            'No se pudo subir ninguna imagen nueva',
          );
        }

        // Advertir si algunas fallaron
        if (uploadResult.failed.length > 0) {
          this.logger.warn(
            `${uploadResult.failed.length} imagen(es) fallaron al subir`,
            uploadResult.failed,
          );
        }

        // Paso 2: Actualizar URLs en el objeto
        updateData.imgUrl = uploadResult.success.map((img) => img.secure_url);

        // Paso 3: Marcar imágenes antiguas para eliminar DESPUÉS
        imagenesAntiguasParaEliminar = productoExistente.imgUrl || [];
      } catch (error) {
        this.logger.error('Error al subir nuevas imágenes:', error);
        throw new BadRequestException(
          `Error al subir imágenes: ${error.message}`,
        );
      }
    }

    try {
      // Paso 4: Actualizar producto en DB
      const updatedProduct = await this.productModel
        .findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true, // Ejecutar validaciones del schema
        })
        .populate({
          path: 'seller',
          select: 'name phoneNumber role province municipality',
        })
        .lean()
        .exec();

      // Paso 5: AHORA SÍ eliminar imágenes antiguas (en background)
      if (imagenesAntiguasParaEliminar.length > 0) {
        // No await - ejecutar en background
        this.eliminarImagenesEnBackground(imagenesAntiguasParaEliminar);
      }

      return updatedProduct;
    } catch (error) {
      this.logger.error(`Error al actualizar producto ${id}:`, error);

      // 🔥 Rollback: Si falla actualizar DB, eliminar imágenes nuevas
      if (updateData.imgUrl && updateData.imgUrl.length > 0) {
        this.logger.warn('Ejecutando rollback de imágenes nuevas...');
        const publicIds = updateData.imgUrl.map((url: string) =>
          this.cloudinaryService.extractPublicIdFromUrl(url),
        );
        await this.cloudinaryService.bulkDeleteImages(publicIds);
      }

      throw new BadRequestException(
        `Error al actualizar producto: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar producto
   */
  async eliminarProducto(id: string, sellerId: string): Promise<Product> {
    // Validar ObjectId
    this.validateObjectId(id, 'ID de producto');

    // Obtener producto
    const producto = await this.productModel.findById(id).lean().exec();

    if (!producto) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    // Verificar ownership
    if (producto.seller.toString() !== sellerId) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este producto',
      );
    }

    try {
      //  Paso 1: Eliminar de la base de datos primero
      await this.productModel.findByIdAndDelete(id).exec();

      //  Paso 2: Luego eliminar imágenes de Cloudinary
      if (producto.imgUrl && producto.imgUrl.length > 0) {
        const publicIds = producto.imgUrl.map((url) =>
          this.cloudinaryService.extractPublicIdFromUrl(url),
        );

        // Usar bulk delete (más rápido)
        const deleteResult =
          await this.cloudinaryService.bulkDeleteImages(publicIds);

        // Logear si hubo fallos (no crítico)
        if (deleteResult.failed.length > 0) {
          this.logger.warn(
            `No se pudieron eliminar ${deleteResult.failed.length} imagen(es) del producto ${id}`,
            deleteResult.failed,
          );
        }
      }

      return producto;
    } catch (error) {
      // Si falla eliminar de DB, no intentar eliminar de Cloudinary
      this.logger.error(`Error al eliminar producto ${id}:`, error);
      throw new HttpException(
        `Error al eliminar producto: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Obtener estadísticas principales para Admin dashboard
   */
  async getAdminDashboardStats(sellerId: string): Promise<DashboardStats> {
    // Validar el sellerId
    this.validateObjectId(sellerId, 'ID de vendedor');

    // Filtro base para todas las consultas (mantener como string)
    const sellerFilter = { seller: sellerId };

    // Ejecutar todas las consultas en paralelo
    const [
      totalProducts,
      availableProducts,
      outOfStockProducts,
      recentProducts,
      topCategoriesAgg,
    ] = await Promise.all([
      // Total de productos del vendedor
      this.productModel.countDocuments(sellerFilter),

      // Productos disponibles del vendedor (amount > 0)
      this.productModel.countDocuments({ ...sellerFilter, amount: { $gt: 0 } }),

      // Productos agotados del vendedor (amount = 0)
      this.productModel.countDocuments({ ...sellerFilter, amount: 0 }),

      // 10 productos más recientes del vendedor
      this.productModel
        .find(sellerFilter)
        .select(
          'name price currencyType amount category imgUrl createdAt seller',
        )
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
        .exec(),

      this.productModel.aggregate([
        {
          $match: { seller: sellerId },
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
        {
          $limit: 5,
        },
      ]),
    ]);

    // Calcular porcentajes para las categorías
    const topCategories: CategoryStats[] = topCategoriesAgg.map((cat) => ({
      category: cat._id,
      count: cat.count,
      percentage:
        totalProducts > 0
          ? Math.round((cat.count / totalProducts) * 100 * 100) / 100
          : 0,
    }));

    return {
      products: {
        total: totalProducts,
        available: availableProducts,
        outOfStock: outOfStockProducts,
      },
      recentProducts,
      topCategories,
    };
  }

  async bulkDeleteProducts(
    productIds: string[],
    sellerId: string,
  ): Promise<{ success: boolean; deletedCount: number }> {
    productIds.forEach((id) => this.validateObjectId(id, 'ID de producto'));

    const products = await this.productModel
      .find({ _id: { $in: productIds }, seller: sellerId })
      .select('imgUrl')
      .lean()
      .exec();

    // Extraer todos los publicIds
    const allPublicIds = products
      .flatMap((p) => p.imgUrl || [])
      .map((url) => this.cloudinaryService.extractPublicIdFromUrl(url));

    // Eliminar usando bulk API (mucho más rápido)
    await this.cloudinaryService.bulkDeleteImages(allPublicIds);

    await this.productModel.deleteMany({
      _id: { $in: productIds },
    });

    return { success: true, deletedCount: products.length };
  }

  /**
   * Obtener datos de productos para exportar a Excel
   */
  async getProductsForExport(
    sellerId: string,
    filters?: {
      category?: string;
      status?: 'all' | 'available' | 'out-of-stock' | 'hidden';
      dateFrom?: string;
      dateTo?: string;
    },
  ): Promise<ProductExportData[]> {
    this.validateObjectId(sellerId, 'ID de vendedor');

    // Construir filtro
    const filter: Record<string, any> = { seller: sellerId };

    // Filtro por estado
    if (filters?.status) {
      switch (filters.status) {
        case 'available':
          filter.amount = { $gt: 0 };
          filter.isVisible = true;
          break;
        case 'out-of-stock':
          filter.amount = 0;
          break;
        case 'hidden':
          filter.isVisible = false;
          break;
      }
    }

    // Filtro por categoría
    if (filters?.category && filters.category !== 'all') {
      filter.category = filters.category;
    }

    // Filtro por rango de fechas
    if (filters?.dateFrom || filters?.dateTo) {
      filter.createdAt = {};
      if (filters.dateFrom) {
        filter.createdAt.$gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        filter.createdAt.$lte = new Date(filters.dateTo);
      }
    }

    // Consultar solo los campos necesarios para el Excel
    const products = await this.productModel
      .find(filter)
      .select(
        'name category price originalPrice currencyType amount isVisible createdAt updatedAt',
      )
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Mapear a formato simplificado
    return products.map((product) => ({
      name: product.name,
      category: product.category,
      price: product.price,
      originalPrice: product.originalPrice,
      currencyType: product.currencyType,
      amount: product.amount,
      isVisible: product.isVisible,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    }));
  }

  /**
   * Obtener cantidad de productos huérfanos (cuyo vendedor no existe)
   */
  async getOrphanProductsCount(includeDetails: boolean = false): Promise<{
    count: number;
    details?: Array<{
      productId: string;
      productName: string;
      sellerId: string;
      category: string;
      createdAt: Date;
    }>;
  }> {
    try {
      // Paso 1: Obtener todos los IDs de usuarios existentes (como strings)
      const existingUsers = await this.userModel
        .find()
        .select('_id')
        .lean()
        .exec();

      const existingUserIds = existingUsers.map((user) => user._id.toString());

      // Paso 2: Buscar productos cuyo seller NO esté en la lista de usuarios
      const filter = { seller: { $nin: existingUserIds } };

      if (includeDetails) {
        const orphanProducts = await this.productModel
          .find(filter)
          .select('name seller category createdAt')
          .lean()
          .exec();

        return {
          count: orphanProducts.length,
          details: orphanProducts.map((p) => ({
            productId: p._id.toString(),
            productName: p.name,
            sellerId: p.seller.toString(),
            category: p.category,
            createdAt: p.createdAt,
          })),
        };
      } else {
        const count = await this.productModel.countDocuments(filter);
        return { count };
      }
    } catch (error) {
      this.logger.error('Error al obtener productos huérfanos:', error);
      throw new HttpException(
        'Error al obtener productos huérfanos',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
