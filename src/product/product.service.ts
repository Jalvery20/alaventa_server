import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Product } from './model/product.schema';
import {
  CreateProductDto,
  ProductFilter,
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

@Injectable()
export class ProductService {
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
   * Buscar productos por nombre
   */
  async findProductByName(
    name: string,
    page: number,
    limit: number,
    province: string,
    municipality: string,
  ): Promise<any> {
    const cleanedName = name.trim().toLowerCase();

    if (!cleanedName) {
      throw new BadRequestException(
        'El nombre de búsqueda no puede estar vacío',
      );
    }

    // Obtener vendedores permitidos usando método reutilizable
    const sellerIdsAllowed = await this.getAllowedSellerIds(
      province,
      municipality,
    );

    const query = {
      name: { $regex: cleanedName, $options: 'i' },
      seller: { $in: sellerIdsAllowed },
    };

    // Ejecutar queries en paralelo
    const [products, totalProducts] = await Promise.all([
      this.productModel
        .find(query)
        .populate({
          path: 'seller',
          select:
            'name phoneNumber role storeDetails.storePic storeDetails.delivery province municipality',
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.productModel.countDocuments(query),
    ]);

    if (!products || products.length === 0) {
      throw new NotFoundException(
        `Producto con nombre similar a '${name}' no encontrado`,
      );
    }

    const totalPages = Math.ceil(totalProducts / limit);

    return {
      products,
      totalPages,
    };
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
        select:
          'name phoneNumber role storeDetails.storePic storeDetails.delivery province municipality',
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
   * Crear nuevo producto
   */
  async crearProducto(
    productoDto: CreateProductDto,
    imagenes: Express.Multer.File[],
  ): Promise<Product> {
    // Validar seller ID si existe en el DTO
    if (productoDto.seller) {
      this.validateObjectId(productoDto.seller.toString(), 'ID de vendedor');
    }

    if (!imagenes || imagenes.length === 0) {
      throw new BadRequestException('Debe proporcionar al menos una imagen');
    }

    // Subir imágenes a Cloudinary
    const imagenesSubidas = await this.cloudinaryService.uploadImages(imagenes);

    const nuevoProducto = new this.productModel({
      ...productoDto,
      imgUrl: imagenesSubidas.map((img) => img.secure_url),
    });

    return await nuevoProducto.save();
  }

  /**
   * Editar producto existente
   */
  async editarProducto(
    id: string,
    productoDto: UpdateProductDto,
    imagenes: Express.Multer.File[],
  ): Promise<Product> {
    // Validar ObjectId
    this.validateObjectId(id, 'ID de producto');

    const productoExistente = await this.productModel
      .findById(id)
      .lean()
      .exec();

    if (!productoExistente) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    const updateData: any = {
      ...productoDto,
      createdAt: Date.now(),
    };

    // Si hay nuevas imágenes, eliminar las antiguas y subir las nuevas
    if (imagenes && imagenes.length > 0) {
      // Ejecutar eliminación y subida en paralelo
      const [imagenesSubidas] = await Promise.all([
        this.cloudinaryService.uploadImages(imagenes),
        this.eliminarImagenesProducto(productoExistente.imgUrl),
      ]);

      updateData.imgUrl = imagenesSubidas.map((img) => img.secure_url);
    }

    const updatedProduct = await this.productModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .lean()
      .exec();

    return updatedProduct;
  }

  /**
   * Eliminar producto
   */
  async eliminarProducto(id: string): Promise<Product> {
    // Validar ObjectId
    this.validateObjectId(id, 'ID de producto');

    const producto = await this.productModel.findById(id).lean().exec();

    if (!producto) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    // Ejecutar eliminación de imágenes y producto en paralelo
    await Promise.all([
      this.eliminarImagenesProducto(producto.imgUrl),
      this.productModel.findByIdAndDelete(id).exec(),
    ]);

    return producto;
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
}
