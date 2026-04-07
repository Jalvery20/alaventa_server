import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFiles,
  Query,
  ValidationPipe,
  UseGuards,
  Req,
  BadRequestException,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  DashboardStats,
  ProductService,
  SellerProductsResponse,
  StoreProductsResponse,
} from './product.service';
import { Product } from './model/product.schema';
import {
  BulkDeleteDto,
  BulkVisibilityDto,
  CartRecommendationsDto,
  CategoryProductDto,
  CreateProductDto,
  ExportProductsDto,
  GetStoreProductsQueryDto,
  ProductSearchDto,
  SellerProductsQueryDto,
  ToggleVisibilityDto,
  UpdateProductDto,
} from './dto/productDto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UserGuard } from '../guards/user.guard';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  async obtenerTodos(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ products: Product[]; total: number; totalPages: number }> {
    return this.productService.obtenerTodos(
      parseInt(page) || 1,
      parseInt(limit) || 50,
    );
  }
  @Get('/stats')
  @UseGuards(UserGuard)
  async getSellerStats(@Req() req): Promise<DashboardStats> {
    // El UserGuard ya añadió el usuario decodificado en req.user
    const sellerId = req.user.userId;

    if (!sellerId) {
      throw new BadRequestException('No se pudo obtener el ID del vendedor');
    }

    return this.productService.getAdminDashboardStats(sellerId);
  }

  /**
   * GET /product/seller/manage
   * Obtener productos del vendedor con filtros avanzados
   */
  @Get('/seller/manage')
  @UseGuards(UserGuard)
  async getSellerProducts(
    @Req() req,
    @Query(new ValidationPipe({ transform: true }))
    query: SellerProductsQueryDto,
  ): Promise<SellerProductsResponse> {
    const sellerId = req.user.userId;
    if (!sellerId) {
      throw new BadRequestException('No se pudo obtener el ID del usuario');
    }
    return this.productService.getSellerProductsWithFilters(sellerId, query);
  }

  @Get(':id')
  async obtenerPorId(@Param('id') id: string): Promise<Product | null> {
    return this.productService.obtenerPorId(id);
  }

  @Get('/seller/:id')
  async obtenerPorVendedor(@Param('id') id: string): Promise<Product[] | null> {
    return this.productService.findProductByVendedor(id);
  }

  @Get('/store/:id')
  @HttpCode(HttpStatus.OK)
  async fetchByStore(
    @Param('id') id: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetStoreProductsQueryDto,
  ): Promise<StoreProductsResponse> {
    return this.productService.getStoreProductsWithFilters(id, query);
  }

  @Get('/search/:name')
  async obtenerPorNombre(
    @Param('name') name: string,
    @Query(new ValidationPipe({ transform: true })) query: ProductSearchDto,
  ): Promise<{
    products: Product[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    return this.productService.findProductByName(name, query);
  }

  @Get('/collection/recent')
  async obtenerColeccion(
    @Query() query: ProductSearchDto,
  ): Promise<Product[] | null> {
    const { province = 'Villa Clara', municipality = 'todos' } = query;
    return this.productService.findCollection(province, municipality);
  }

  @Get('/category/:category')
  async obtenerPorCategoria(
    @Param('category') category: string,
    @Query(new ValidationPipe({ transform: true })) query: CategoryProductDto,
  ): Promise<{
    products: Product[];
    totalPages: number;
    totalProducts: number;
    currentPage: number;
  }> {
    const {
      page = 1,
      limit = 18,
      orderBy = 'createdAt',
      order = 'desc',
      province = 'Villa Clara',
      municipality = 'todos',
      category: subCategory, // subcategoría del query param
      minPrice,
      maxPrice,
    } = query;

    const result = await this.productService.findProductByCategory(
      category, // Categoría principal de la URL
      page,
      limit,
      orderBy,
      order,
      province,
      municipality,
      subCategory, // Subcategoría opcional del filtro
      minPrice,
      maxPrice,
    );

    return {
      ...result,
      currentPage: page,
    };
  }

  /**
   * GET /product/export/data
   * Obtener datos para exportar a Excel
   */
  @Get('/export/data')
  @UseGuards(UserGuard)
  async getProductsForExport(
    @Req() req,
    @Query(new ValidationPipe({ transform: true }))
    query: ExportProductsDto,
  ) {
    const sellerId = req.user.userId;

    if (!sellerId) {
      throw new BadRequestException('No se pudo obtener el ID del vendedor');
    }

    const products = await this.productService.getProductsForExport(sellerId, {
      category: query.category,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });

    return {
      success: true,
      count: products.length,
      data: products,
    };
  }

  @Post()
  @UseGuards(UserGuard)
  @UseInterceptors(FilesInterceptor('images', 5)) // Máximo 5 imágenes
  @HttpCode(HttpStatus.CREATED)
  async crearProducto(
    @Body(new ValidationPipe({ transform: true }))
    productoDto: CreateProductDto,
    @UploadedFiles() images: Express.Multer.File[],
    @Req() req,
  ): Promise<Product> {
    // Verificar que el sellerId del DTO coincida con el usuario autenticado
    const sellerId = req.user.userId;

    if (productoDto.seller !== sellerId) {
      throw new BadRequestException(
        'No tienes permiso para crear productos para otro vendedor',
      );
    }

    // Validar que se enviaron imágenes
    if (!images || images.length === 0) {
      throw new BadRequestException('Debe enviar al menos una imagen');
    }

    // Validar número máximo de imágenes
    if (images.length > 5) {
      throw new BadRequestException('Máximo 5 imágenes permitidas');
    }

    return this.productService.crearProducto(productoDto, images);
  }

  /**
   * POST /product/recommendations/cart
   * Obtener productos recomendados basados en el carrito
   */
  @Post('/recommendations/cart')
  @HttpCode(HttpStatus.OK)
  async getCartRecommendations(
    @Body(new ValidationPipe({ transform: true }))
    dto: CartRecommendationsDto,
  ): Promise<{
    success: boolean;
    count: number;
    products: Product[];
  }> {
    const products = await this.productService.getCartRecommendations(dto);

    return {
      success: true,
      count: products.length,
      products,
    };
  }

  @Put(':id')
  @UseGuards(UserGuard)
  @UseInterceptors(FilesInterceptor('images', 5)) // 5 es el límite de archivos
  async editarProducto(
    @Param('id') id: string,
    @Body(ValidationPipe) productoDto: UpdateProductDto,
    @UploadedFiles() images: Express.Multer.File[],
    @Req() req,
  ): Promise<Product | null> {
    const sellerId = req.user.userId;

    return this.productService.editProduct(id, productoDto, images, sellerId);
  }

  /**
   * POST /product/bulk/visibility
   * Cambiar visibilidad en lote
   */
  @Post('/bulk/visibility')
  @UseGuards(UserGuard)
  @HttpCode(HttpStatus.OK)
  async bulkVisibility(
    @Body(ValidationPipe) dto: BulkVisibilityDto,
    @Req() req,
  ) {
    const sellerId = req.user.userId;
    return this.productService.bulkUpdateVisibility(
      dto.productIds,
      dto.isVisible,
      sellerId,
    );
  }

  /**
   * PATCH /product/:id/visibility
   * Toggle visibilidad
   */
  @Patch(':id/visibility')
  @UseGuards(UserGuard)
  @HttpCode(HttpStatus.OK)
  async toggleVisibility(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: ToggleVisibilityDto,
    @Req() req,
  ) {
    const sellerId = req.user.userId;
    return this.productService.toggleProductVisibility(
      id,
      dto.isVisible,
      sellerId,
    );
  }

  /**
   * POST /product/bulk/delete
   * Eliminar en lote
   */
  @Post('/bulk/delete')
  @UseGuards(UserGuard)
  @HttpCode(HttpStatus.OK)
  async bulkDelete(@Body(ValidationPipe) dto: BulkDeleteDto, @Req() req) {
    const sellerId = req.user.userId;
    return this.productService.bulkDeleteProducts(dto.productIds, sellerId);
  }

  @Delete(':id')
  @UseGuards(UserGuard)
  async eliminarProducto(
    @Param('id') id: string,
    @Req() req,
  ): Promise<Product | null> {
    const sellerId = req.user.userId;
    return this.productService.eliminarProducto(id, sellerId);
  }
}
