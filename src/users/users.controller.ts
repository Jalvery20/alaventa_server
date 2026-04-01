import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  Query,
  Patch,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  CompleteUserDto,
  CreateUserDto,
  ExportUsersQueryDto,
  getStoresDto,
  GetUsersQueryDto,
  PatchStoreDto,
  PatchUserDto,
  UpdateAvailableUserDto,
  UpdatePasswordDto,
  UpdateStoreCategoriesDto,
  UpdateStoreDto,
  UpdateUserDto,
  UpdateUserExpiryDateDto,
  UpdateUserRoleDto,
} from './dto/user.dto';
import { AdminGuard } from 'src/guards/admin.guard';
import { StoreGuard } from 'src/guards/store.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { EditUserGuard } from 'src/guards/edit-user.guard';
import { UserGuard } from 'src/guards/user.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ============================================
  // GET ENDPOINTS
  // ============================================

  @Get()
  @UseGuards(AdminGuard)
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }

  /**
   * GET /users/admin/list
   * Obtener usuarios con filtros para UsersManager (solo admin)
   */
  @Get('admin/list')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async getUsersForManagement(@Req() req, @Query() query: GetUsersQueryDto) {
    const currentUserId = req.user.userId;
    return this.usersService.getUsersForManagement(query, currentUserId);
  }

  /**
   * GET /users/admin/export
   * Exportar usuarios con filtros (solo admin)
   */
  @Get('admin/export')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async exportUsers(@Query() query: ExportUsersQueryDto) {
    return this.usersService.exportUsers(query);
  }

  /**
   * PUT /users/admin/bulk/toggle-status
   * Habilitar/Deshabilitar múltiples usuarios (solo admin)
   */
  @Put('admin/bulk/toggle-status')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async bulkToggleUserStatus(
    @Body(ValidationPipe)
    bulkToggleDto: {
      userIds: string[];
      isAllowed: boolean;
    },
  ) {
    return this.usersService.bulkToggleUserStatus(
      bulkToggleDto.userIds,
      bulkToggleDto.isAllowed,
    );
  }

  /**
   * DELETE /users/admin/bulk
   * Eliminar múltiples usuarios (solo admin)
   */
  @Delete('admin/bulk')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async bulkDeleteUsers(
    @Body(ValidationPipe)
    bulkDeleteDto: {
      userIds: string[];
    },
  ) {
    return this.usersService.bulkDeleteUsers(bulkDeleteDto.userIds);
  }

  /**
   * PUT /users/admin/:id/extend-expiry
   * Extender fecha de expiración por 30 días (solo admin)
   */
  @Put('admin/:id/extend-expiry')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async extendUserExpiry(
    @Param('id') id: string,
    @Body(ValidationPipe) extendDto?: { days?: number },
  ) {
    return this.usersService.extendUserExpiry(id, extendDto?.days);
  }

  /**
   * GET /users/stats/platform
   * Obtener todas las estadísticas de la plataforma
   */
  @Get('stats/platform')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async getPlatformStats(@Req() req) {
    const currentUserId = req.user.userId;
    return this.usersService.getPlatformStats(currentUserId);
  }

  @Get(':id')
  @UseGuards(UserGuard)
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Get('phone/:phoneNumber')
  async getUserByPhoneNumber(@Param('phoneNumber') phoneNumber: string) {
    return this.usersService.getUserByPhoneNumber(phoneNumber);
  }

  @Get('/store/all')
  async getStores(@Query() query: getStoresDto) {
    const { province = 'Villa Clara', municipality = 'todos' } = query;
    return this.usersService.getStores(province, municipality);
  }

  @Get('/stores')
  async getAllStores() {
    return this.usersService.getAllStores();
  }

  @Get('/store/:name')
  async getStoreByName(@Param('name') name: string) {
    return this.usersService.getStoreByName(name);
  }

  @Get('/store/:id/categories')
  @UseGuards(StoreGuard)
  async getStoreCategories(@Param('id') id: string) {
    return this.usersService.getStoreCategories(id);
  }

  // ============================================
  // POST ENDPOINTS
  // ============================================

  @Post()
  @UseGuards(AdminGuard)
  async createUser(@Body(ValidationPipe) createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  // ============================================
  // PUT ENDPOINTS (Actualización completa)
  // ============================================

  @Put('complete/:id')
  async completeUserData(
    @Param('id') id: string,
    @Body(ValidationPipe) completeUserDto: CompleteUserDto,
  ) {
    return this.usersService.updateUser(id, completeUserDto);
  }

  @Put(':id')
  async updateUser(
    @Param('id') id: string,
    @Body(ValidationPipe) updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Put('/store/:id')
  @UseGuards(StoreGuard)
  @UseInterceptors(FileInterceptor('storePic')) // 1 es el límite de archivos
  async updateStore(
    @Param('id') id: string,
    @Body(ValidationPipe) updateStoreDto: UpdateStoreDto,
    @UploadedFile() storePic: Express.Multer.File,
  ) {
    return this.usersService.updateStore(id, updateStoreDto, storePic);
  }

  @Put('/available/:id')
  @UseGuards(AdminGuard)
  async updateAvailableUser(
    @Param('id') id: string,
    @Body(ValidationPipe) updateAvailableUserDto: UpdateAvailableUserDto,
  ) {
    return this.usersService.updateAvailableUser(id, updateAvailableUserDto);
  }

  @Put('/role/:id')
  @UseGuards(AdminGuard)
  async updateUserRole(
    @Param('id') id: string,
    @Body(ValidationPipe) updateUserRoleDto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateUserRole(id, updateUserRoleDto);
  }

  @Put('/expiryDate/:id')
  @UseGuards(AdminGuard)
  async updateUserExpiryDate(
    @Param('id') id: string,
    @Body(ValidationPipe) updateUserExpiryDateDto: UpdateUserExpiryDateDto,
  ) {
    return this.usersService.updateUserExpiryDate(id, updateUserExpiryDateDto);
  }

  @Put('/password/:id')
  @UseGuards(EditUserGuard)
  async updatePassword(
    @Param('id') id: string,
    @Body(ValidationPipe) updatePasswordDto: UpdatePasswordDto,
  ) {
    return this.usersService.updatePassword(id, updatePasswordDto);
  }

  @Put('/resetpassword/:id')
  @UseGuards(AdminGuard)
  async resetPassword(@Param('id') id: string) {
    return this.usersService.resetPassword(id);
  }

  /**
   * PATCH /users/store/:id
   * Actualización parcial general de tienda
   */

  @Patch('/store/:id')
  @UseGuards(StoreGuard)
  @UseInterceptors(FileInterceptor('storePic'))
  @HttpCode(HttpStatus.OK)
  async patchStore(
    @Param('id') id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    )
    patchStoreDto: PatchStoreDto,
    @UploadedFile() storePic?: Express.Multer.File,
  ) {
    return this.usersService.patchStore(id, patchStoreDto, storePic);
  }

  /**
   * PATCH /users/store/:id/categories
   * Actualizar categorías de una tienda
   */
  @Patch('/store/:id/categories')
  @UseGuards(StoreGuard)
  @HttpCode(HttpStatus.OK)
  async updateStoreCategories(
    @Param('id') id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    )
    updateStoreCategoriesDto: UpdateStoreCategoriesDto,
  ) {
    return this.usersService.updateStoreCategories(
      id,
      updateStoreCategoriesDto,
    );
  }

  /**
   * PATCH /users/:id
   * Actualización parcial de usuario sin storeDetails (vendedor/admin)
   */
  @Patch(':id')
  @UseGuards(EditUserGuard) // O el guard que corresponda
  @HttpCode(HttpStatus.OK)
  async patchUser(
    @Param('id') id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    )
    patchUserDto: PatchUserDto,
  ) {
    return this.usersService.patchUser(id, patchUserDto);
  }

  // ============================================
  // DELETE ENDPOINTS
  // ============================================

  @Delete(':id')
  @UseGuards(AdminGuard)
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
