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
} from './product.service';
import { Product } from './model/product.schema';
import {
  BulkDeleteDto,
  BulkVisibilityDto,
  CategoryProductDto,
  CreateProductDto,
  ProductSearchDto,
  SellerProductsQueryDto,
  StoreCategoryProductDto,
  ToggleVisibilityDto,
  UpdateProductDto,
} from './dto/productDto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UserGuard } from 'src/guards/user.guard';

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
  async getAdminStats(@Req() req): Promise<DashboardStats> {
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
  async obtenerPorTienda(
    @Param('id') id: string,
    @Query() query: StoreCategoryProductDto,
  ): Promise<any> {
    const {
      page = 1,
      limit = 10,
      orderBy = 'createdAt',
      category = 'todos los productos',
    } = query;
    return this.productService.findProductByStore(
      id,
      page,
      limit,
      orderBy,
      category,
    );
  }

  @Get('/search/:name')
  async obtenerPorNombre(
    @Param('name') name: string,
    @Query() query: ProductSearchDto,
  ): Promise<any> {
    const {
      province = 'Villa Clara',
      municipality = 'todos',
      page = 1,
      limit = 10,
    } = query;
    return this.productService.findProductByName(
      name,
      page,
      limit,
      province,
      municipality,
    );
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
    @Query() query: CategoryProductDto,
  ): Promise<any> {
    const {
      page = 1,
      limit = 10,
      orderBy = 'createdAt',
      province = 'Villa Clara',
      municipality = 'todos',
    } = query;
    return this.productService.findProductByCategory(
      category,
      page,
      limit,
      orderBy,
      province,
      municipality,
    );
  }

  @Post()
  @UseInterceptors(FilesInterceptor('images', 5)) // 5 es el límite de archivos
  async crearProducto(
    @Body(ValidationPipe) productoDto: CreateProductDto,
    @UploadedFiles() images: Express.Multer.File[],
  ): Promise<Product> {
    return this.productService.crearProducto(productoDto, images);
  }

  @Put(':id')
  @UseInterceptors(FilesInterceptor('images', 5)) // 5 es el límite de archivos
  async editarProducto(
    @Param('id') id: string,
    @Body(ValidationPipe) productoDto: UpdateProductDto,
    @UploadedFiles() images: Express.Multer.File[],
  ): Promise<Product | null> {
    return this.productService.editarProducto(id, productoDto, images);
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
