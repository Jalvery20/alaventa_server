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
  GetStoreProductsQueryDto,
  ProductSearchDto,
  SellerProductsQueryDto,
  UpdateProductDto,
} from './dto/productDto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PRODUCT_CATEGORIES } from './constants/categories.constants';
import { User } from '../users/model/user.schema';

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

export interface StoreProductsResponse {
  success: boolean;
  products: Product[];
  totalPages: number;
  totalProducts: number;
  currentPage: number;
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
    return product as unknown as Product;
  }

  /**
   * Eliminar imágenes en background sin bloquear response
   */
  private async deleteImagesInBackground(urls: string[]): Promise<void> {
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
      products: products as unknown as Product[],
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
  /*
   *  Obtener productos de tienda con filtros completos
   */
  async getStoreProductsWithFilters(
    storeId: string,
    query: GetStoreProductsQueryDto,
  ): Promise<StoreProductsResponse> {
    // Validar ObjectId
    this.validateObjectId(storeId, 'ID de tienda');

    // Verificar que la tienda existe
    const store = await this.userModel
      .findById(storeId)
      .select('role name')
      .lean()
      .exec();

    if (!store) {
      throw new NotFoundException(`Tienda con ID: ${storeId} no encontrada`);
    }

    if (store.role !== 'tienda') {
      throw new BadRequestException('El usuario no es una tienda');
    }

    const {
      page = 1,
      limit = 18,
      orderBy = 'name',
      order = 'asc',
      p_category,
      category,
      search,
      minPrice,
      maxPrice,
    } = query;

    // ============================================
    // CONSTRUIR FILTRO
    // ============================================
    const filter: any = {
      seller: storeId,
      isVisible: true,
    };

    // Filtro por categoría
    if (p_category && p_category !== 'todos') {
      // Buscar la categoría padre en PRODUCT_CATEGORIES
      const parentCategory = PRODUCT_CATEGORIES.find(
        (cat) => cat.name === p_category,
      );

      if (parentCategory && parentCategory.subcategories.length > 0) {
        // Filtrar por todas las subcategorías de esa categoría padre
        filter.category = { $in: parentCategory.subcategories };
      } else {
        // Si no tiene subcategorías o no se encuentra, filtrar por el nombre exacto
        filter.category = p_category;
      }
    }

    if (category && category !== 'todos') {
      filter.category = category;
    }

    // Filtro por búsqueda en nombre y descripción
    if (search?.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [{ name: searchRegex }, { description: searchRegex }];
    }

    // Filtro por rango de precio
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) {
        filter.price.$gte = minPrice;
      }
      if (maxPrice !== undefined) {
        filter.price.$lte = maxPrice;
      }
    }

    // ============================================
    // ORDENAMIENTO
    // ============================================
    const sortDirection = order === 'desc' ? -1 : 1;
    const sortOptions: Record<string, 1 | -1> = {};

    switch (orderBy) {
      case 'price':
        sortOptions.price = sortDirection;
        sortOptions.updatedAt = -1;
        break;
      case 'createdAt':
        sortOptions.updatedAt = sortDirection;
        break;
      case 'name':
      default:
        sortOptions.name = sortDirection;
        sortOptions.updatedAt = -1;
        break;
    }

    // ============================================
    // EJECUTAR QUERIES EN PARALELO
    // ============================================
    try {
      const [products, totalProducts] = await Promise.all([
        this.productModel
          .find(filter)
          .sort(sortOptions)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean()
          .exec(),
        this.productModel.countDocuments(filter),
      ]);

      const totalPages = Math.ceil(totalProducts / limit);

      return {
        success: true,
        products: products as unknown as Product[],
        totalPages,
        totalProducts,
        currentPage: page,
      };
    } catch (error) {
      this.logger.error('Error al obtener productos de tienda:', error);
      throw new HttpException(
        'Error al obtener productos de la tienda',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
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

    // Obtener provincias y municipios de los sellers del carrito
    const cartSellers = await this.userModel
      .find({
        _id: { $in: storeIds },
        isAllowed: true,
      })
      .select('_id province municipality')
      .lean()
      .exec();

    const allowedSellerIds = cartSellers.map((s) => s._id.toString());
    const provinces = [
      ...new Set(cartSellers.map((s) => s.province).filter(Boolean)),
    ];
    const municipalities = [
      ...new Set(cartSellers.map((s) => s.municipality).filter(Boolean)),
    ];

    // Si no hay provincias, no podemos recomendar nada
    if (provinces.length === 0) {
      return [];
    }

    // Obtener TODOS los sellers de las mismas provincias (filtro obligatorio)
    const sellersInProvincias = await this.userModel
      .find({
        isAllowed: true,
        province: { $in: provinces },
      })
      .select('_id municipality')
      .lean()
      .exec();

    const allSellerIdsInProvincia = sellersInProvincias.map((s) =>
      s._id.toString(),
    );

    // Sellers del mismo municipio (para mayor prioridad)
    const sellerIdsInMunicipio = sellersInProvincias
      .filter((s) => municipalities.includes(s.municipality))
      .map((s) => s._id.toString());

    const baseFilter: any = {
      _id: { $nin: productIdsToExclude },
      amount: { $gt: 0 },
      isVisible: true,
      seller: { $in: allSellerIdsInProvincia },
    };

    const populateOptions = {
      path: 'seller',
      select:
        'name phoneNumber role storeDetails province municipality isAllowed',
      match: { isAllowed: true },
    };

    try {
      let recommendations: Product[] = [];
      let remainingLimit = limit;

      const updateExclusions = () => {
        baseFilter._id = {
          $nin: [
            ...productIdsToExclude,
            ...recommendations.map((p) => p._id.toString()),
          ],
        };
      };

      // PRIORIDAD 1: Misma categoría + mismo municipio
      if (remainingLimit > 0 && sellerIdsInMunicipio.length > 0) {
        const products = await this.productModel
          .find({
            ...baseFilter,
            category: { $in: categories },
            seller: { $in: sellerIdsInMunicipio },
          })
          .populate(populateOptions)
          .sort({ updatedAt: -1 })
          .limit(remainingLimit * 2)
          .lean()
          .exec();

        const valid = products.filter((p) => p.seller !== null);
        recommendations = valid.slice(
          0,
          remainingLimit,
        ) as unknown as Product[];
        remainingLimit = limit - recommendations.length;
        updateExclusions();
      }

      // PRIORIDAD 2: Misma categoría + misma provincia
      if (remainingLimit > 0) {
        const products = await this.productModel
          .find({
            ...baseFilter,
            category: { $in: categories },
          })
          .populate(populateOptions)
          .sort({ updatedAt: -1 })
          .limit(remainingLimit * 2)
          .lean()
          .exec();

        const valid = products.filter((p) => p.seller !== null);
        recommendations = [
          ...recommendations,
          ...valid.slice(0, remainingLimit),
        ] as unknown as Product[];
        remainingLimit = limit - recommendations.length;
        updateExclusions();
      }

      // PRIORIDAD 3: Mismas tiendas del carrito (misma provincia ya garantizada)
      if (remainingLimit > 0 && allowedSellerIds.length > 0) {
        const products = await this.productModel
          .find({
            ...baseFilter,
            seller: { $in: allowedSellerIds },
          })
          .populate(populateOptions)
          .sort({ updatedAt: -1 })
          .limit(remainingLimit * 2)
          .lean()
          .exec();

        const valid = products.filter((p) => p.seller !== null);
        recommendations = [
          ...recommendations,
          ...valid.slice(0, remainingLimit),
        ] as unknown as Product[];
        remainingLimit = limit - recommendations.length;
        updateExclusions();
      }

      // PRIORIDAD 4: Cualquier producto de la misma provincia
      if (remainingLimit > 0) {
        const products = await this.productModel
          .find(baseFilter)
          .populate(populateOptions)
          .sort({ updatedAt: -1 })
          .limit(remainingLimit * 2)
          .lean()
          .exec();

        const valid = products.filter((p) => p.seller !== null);
        recommendations = [
          ...recommendations,
          ...valid.slice(0, remainingLimit),
        ] as unknown as Product[];
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

    return { success: true, product: updatedProduct as unknown as Product };
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
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.productModel.estimatedDocumentCount(),
    ]);

    const totalPages = Math.ceil(total / limit);
    const productsTyped = products as unknown as Product[];
    return { products: productsTyped, total, totalPages };
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
      seller,
    };
  }

  /**
   * Buscar productos por vendedor
   */
  async findProductByVendedor(seller: string): Promise<Product[]> {
    // Validar ObjectId
    this.validateObjectId(seller, 'ID de vendedor');

    const products = await this.productModel
      .find({
        seller,
        isVisible: true,
      })
      .lean()
      .exec();

    if (!products || products.length === 0) {
      throw new NotFoundException(
        `No se encontraron productos del vendedor con ID ${seller}`,
      );
    }

    return products as unknown as Product[];
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
        sortObject.updatedAt = -1;
        break;
      case 'price_desc':
        sortObject.price = -1;
        sortObject.updatedAt = -1;
        break;
      case 'newest':
        sortObject.updatedAt = -1;
        break;
      case 'relevance':
      default:
        sortObject.updatedAt = -1;
        break;
    }

    try {
      const [products, total] = await Promise.all([
        this.productModel
          .find(filter)
          .populate({
            path: 'seller',
            select: 'name phoneNumber role storeDetails province municipality',
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
        products: products as unknown as Product[],
        total,
        totalPages,
        currentPage: page,
      };
    } catch (error: any) {
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
      .find({
        seller: { $in: sellerIdsAllowed },
        isVisible: true,
      })
      .populate({
        path: 'seller',
        select: 'name phoneNumber role storeDetails province municipality',
      })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean()
      .exec();

    if (!products || products.length === 0) {
      throw new NotFoundException('No se encontraron productos');
    }

    return products as unknown as Product[];
  }

  /**
   * Buscar productos por categoría
   */
  async findProductByCategory(
    p_category: string,
    page: number,
    limit: number,
    orderBy: string,
    order: string,
    province: string,
    municipality: string,
    subCategory?: string,
    minPrice?: number,
    maxPrice?: number,
  ): Promise<{
    products: Product[];
    totalPages: number;
    totalProducts: number;
  }> {
    // Decodificar la categoría (puede venir con guiones desde la URL)
    const decodedPCategory = decodeURIComponent(p_category)
      .replace(/-/g, ' ')
      .trim();

    // Obtener vendedores permitidos según ubicación
    const sellerIdsAllowed = await this.getAllowedSellerIds(
      province,
      municipality,
    );

    if (sellerIdsAllowed.length === 0) {
      return {
        products: [],
        totalPages: 0,
        totalProducts: 0,
      };
    }

    // ============================================
    // CONSTRUIR QUERY BASE
    // ============================================
    const query: Record<string, any> = {
      seller: { $in: sellerIdsAllowed },
      isVisible: true,
      amount: { $gt: 0 },
    };

    // ============================================
    // VERIFICAR SI ES "TODOS" (caso especial)
    // ============================================
    const normalizedCategory = decodedPCategory.toLowerCase();
    const isTodosCategory =
      normalizedCategory === 'todos' ||
      normalizedCategory === 'todos los productos';

    // Si NO es "todos", aplicar filtro de categoría
    if (!isTodosCategory) {
      // Buscar la categoría principal en PRODUCT_CATEGORIES
      const mainCategory = PRODUCT_CATEGORIES.find(
        (cat) => cat.name.toLowerCase() === normalizedCategory,
      );

      if (!mainCategory) {
        throw new NotFoundException(`Categoría "${p_category}" no encontrada`);
      }

      // ============================================
      // FILTRAR POR CATEGORÍA/SUBCATEGORÍA
      // ============================================

      // Si se especificó una subcategoría específica en el filtro
      if (subCategory && subCategory.toLowerCase() !== 'todos') {
        // Verificar que la subcategoría pertenece a la categoría principal
        const isValidSubcategory = mainCategory.subcategories.some(
          (sub) => sub.toLowerCase() === subCategory.toLowerCase(),
        );

        if (isValidSubcategory) {
          query.category = subCategory;
        } else {
          // Subcategoría inválida, mostrar todas las de la categoría principal
          query.category = { $in: [...mainCategory.subcategories] };
        }
      }
      // Si no hay subcategoría específica, buscar en TODAS las subcategorías
      else {
        if (mainCategory.subcategories.length > 0) {
          query.category = { $in: [...mainCategory.subcategories] };
        }
      }
    }
    // Si es "todos", NO agregamos filtro de categoría (muestra todo)

    // ============================================
    // FILTRO DE PRECIO
    // ============================================
    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) {
        query.price.$gte = minPrice;
      }
      if (maxPrice !== undefined) {
        query.price.$lte = maxPrice;
      }
    }

    // ============================================
    // CONSTRUIR ORDENAMIENTO
    // ============================================
    const sortDirection = order === 'desc' ? -1 : 1;
    const sortObject: Record<string, 1 | -1> = {};

    switch (orderBy) {
      case 'price':
        sortObject.price = sortDirection;
        sortObject.updatedAt = -1;
        break;
      case 'name':
        sortObject.name = sortDirection;
        sortObject.updatedAt = -1;
        break;
      case 'createdAt':
      default:
        sortObject.updatedAt = sortDirection;
        break;
    }

    try {
      const [products, totalProducts] = await Promise.all([
        this.productModel
          .find(query)
          .populate({
            path: 'seller',
            select: 'name phoneNumber role storeDetails province municipality',
          })
          .sort(sortObject)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean()
          .exec(),
        this.productModel.countDocuments(query),
      ]);

      const totalPages = Math.ceil(totalProducts / limit);

      return {
        products: products as unknown as Product[],
        totalPages,
        totalProducts,
      };
    } catch (error) {
      throw new HttpException(
        'Error al buscar productos por categoría',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
    } catch (error: any) {
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
   * Edit existing product with intelligent image management
   * - Keeps existing images specified in keepImages
   * - Adds new images without deleting existing ones
   * - Only deletes images that were removed by the user
   */
  async editProduct(
    id: string,
    productDto: UpdateProductDto,
    images: Express.Multer.File[],
    sellerId: string,
  ): Promise<Product> {
    // Validate ObjectId
    this.validateObjectId(id, 'Product ID');

    // Get existing product
    const existingProduct = await this.productModel.findById(id).lean().exec();

    if (!existingProduct) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // Verify ownership
    if (existingProduct.seller.toString() !== sellerId) {
      throw new ForbiddenException(
        'You do not have permission to edit this product',
      );
    }

    // Validate original price if provided
    if (
      productDto.originalPrice !== undefined &&
      productDto.price !== undefined &&
      productDto.originalPrice <= productDto.price
    ) {
      throw new BadRequestException(
        'Original price must be greater than sale price',
      );
    }

    // Prepare update data (without keepImages)
    const { keepImages, ...restDto } = productDto;
    const updateData: any = { ...restDto };

    // ============================================
    // INTELLIGENT IMAGE MANAGEMENT
    // ============================================

    const originalImages = existingProduct.imgUrl || [];
    let imagesToDelete: string[] = [];
    let newUrls: string[] = [];

    // Determine which images to keep
    // If keepImages is defined, use it; otherwise, keep all originals
    const imagesToKeep =
      keepImages !== undefined
        ? keepImages.filter((url) => originalImages.includes(url))
        : originalImages;

    // Calculate which images to delete (those that were there but are no longer in keepImages)
    if (keepImages !== undefined) {
      imagesToDelete = originalImages.filter(
        (url) => !imagesToKeep.includes(url),
      );
    }

    // ============================================
    // UPLOAD NEW IMAGES (if any)
    // ============================================

    if (images && images.length > 0) {
      const totalImages = imagesToKeep.length + images.length;

      // Validate total image limit
      if (totalImages > 5) {
        throw new BadRequestException(
          `Máximo de  5 imágenes permitidas. Tienes ${imagesToKeep.length} existentes y estás tratando de añadir ${images.length}`,
        );
      }

      try {
        const uploadResult = await this.cloudinaryService.uploadImages(images, {
          folder: 'product',
          maxWidth: 2000,
          quality: 85,
        });

        if (uploadResult.success.length === 0) {
          throw new BadRequestException(
            'No se pudieron cargar imágenes nuevas',
          );
        }

        if (uploadResult.failed.length > 0) {
          this.logger.warn(
            `${uploadResult.failed.length} imagen(es) no se pudieron cargar`,
            uploadResult.failed,
          );
        }

        newUrls = uploadResult.success.map((img) => img.secure_url);
      } catch (error: any) {
        this.logger.error('Error uploading new images:', error);
        throw new BadRequestException(
          `Error subiendo imágenes: ${error.message}`,
        );
      }
    }

    // ============================================
    // BUILD FINAL IMAGE ARRAY
    // ============================================

    // Only update imgUrl if there were changes to the images
    const hasImageChanges =
      keepImages !== undefined || // Specified what to keep
      newUrls.length > 0; // Added new ones

    if (hasImageChanges) {
      const finalImageUrls = [...imagesToKeep, ...newUrls];

      // Validate at least one image
      if (finalImageUrls.length === 0) {
        throw new BadRequestException('Product must have at least one image');
      }

      updateData.imgUrl = finalImageUrls;
    }

    // ============================================
    // UPDATE IN DATABASE
    // ============================================

    try {
      const updatedProduct = await this.productModel
        .findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true,
        })
        .populate({
          path: 'seller',
          select: 'name phoneNumber role province municipality',
        })
        .lean()
        .exec();

      // DELETE OLD IMAGES IN BACKGROUND (after success)
      if (imagesToDelete.length > 0) {
        this.logger.log(
          `Deleting ${imagesToDelete.length} old image(s) from product ${id}`,
        );
        // No await - execute in background
        this.deleteImagesInBackground(imagesToDelete);
      }

      return updatedProduct as unknown as Product;
    } catch (error: any) {
      this.logger.error(`Error updating product ${id}:`, error);

      // ROLLBACK: Delete newly uploaded images if update fails
      if (newUrls.length > 0) {
        this.logger.warn('Rolling back newly uploaded images...');
        const publicIds = newUrls.map((url) =>
          this.cloudinaryService.extractPublicIdFromUrl(url),
        );
        await this.cloudinaryService.bulkDeleteImages(publicIds);
      }

      throw new BadRequestException(`Error updating product: ${error.message}`);
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

      return producto as unknown as Product;
    } catch (error: any) {
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
    const recentProductsTyped = recentProducts as unknown as Product[];
    return {
      products: {
        total: totalProducts,
        available: availableProducts,
        outOfStock: outOfStockProducts,
      },
      recentProducts: recentProductsTyped,
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

  async bulkChangeCategory(fromCategory: string, toCategory: string) {
    const products = await this.productModel
      .find({ category: fromCategory })
      .select('name seller')
      .populate('seller', 'name province municipality')
      .lean()
      .exec();

    await this.productModel
      .updateMany(
        { category: fromCategory },
        { $set: { category: toCategory } },
      )
      .exec();

    const modifiedProducts = products.map((p) => {
      const seller = p.seller as any;
      return {
        productName: p.name,
        sellerName: seller?.name ?? null,
        province: seller?.province ?? null,
        municipality: seller?.municipality ?? null,
      };
    });

    // Actualizar la categoría en la lista de categorías de las tiendas
    const stores = await this.userModel
      .find({ 'storeDetails.categories': fromCategory })
      .select('name storeDetails.categories')
      .lean()
      .exec();

    await this.userModel
      .updateMany(
        { 'storeDetails.categories': fromCategory },
        {
          $set: {
            'storeDetails.categories.$[elem]': toCategory,
          },
        },
        { arrayFilters: [{ elem: fromCategory }] },
      )
      .exec();

    const modifiedStores = stores.map((s) => ({
      storeName: s.name,
      categories: (s as any).storeDetails?.categories ?? [],
    }));

    this.logger.log(
      `Categoría cambiada de "${fromCategory}" a "${toCategory}": ${modifiedProducts.length} productos y ${modifiedStores.length} tiendas actualizadas`,
    );

    return {
      modifiedCount: modifiedProducts.length,
      products: modifiedProducts,
      modifiedStores: modifiedStores.length,
      stores: modifiedStores,
    };
  }
}
