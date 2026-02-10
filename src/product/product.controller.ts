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
} from '@nestjs/common';
import { DashboardStats, ProductService } from './product.service';
import { Product } from './model/product.schema';
import {
  CategoryProductDto,
  CreateProductDto,
  ProductSearchDto,
  StoreCategoryProductDto,
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

  @Delete(':id')
  async eliminarProducto(@Param('id') id: string): Promise<Product | null> {
    return this.productService.eliminarProducto(id);
  }
}
