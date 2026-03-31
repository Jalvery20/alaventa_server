import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { GAAnalyticsService } from './ga-analytics.service';
import {
  CreateOrderDto,
  AnalyticsQueryDto,
  OrdersPaginationDto,
  RegisterContactClickDto,
} from './dto/analytics.dto';
import { AdminGuard } from '../guards/admin.guard';
import { UserGuard } from '../guards/user.guard';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly gaAnalyticsService: GAAnalyticsService,
  ) {}

  // Público: registrar un pedido (llamado desde el frontend al completar orden)
  @Post('orders')
  async createOrder(@Body() dto: CreateOrderDto) {
    const order = await this.analyticsService.createOrder(dto);
    return { success: true, transactionId: order.transactionId };
  }

  // Admin: obtener estadísticas del dashboard
  @Get('dashboard')
  @UseGuards(AdminGuard)
  async getDashboardStats(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getDashboardStats(query);
  }

  // Seller/Store: obtener estadísticas propias
  @Get('seller')
  @UseGuards(UserGuard)
  async getSellerAnalytics(@Req() req, @Query('period') period?: string) {
    const sellerPhone = req.user.phoneNumber;
    return this.analyticsService.getSellerAnalytics(sellerPhone, period);
  }

  // Admin: obtener lista de pedidos paginada
  @Get('orders')
  @UseGuards(AdminGuard)
  async getOrders(@Query() query: OrdersPaginationDto) {
    return this.analyticsService.getOrders(
      query.page || 1,
      query.limit || 20,
      query.period,
      query.sellerPhone,
    );
  }

  // Admin: obtener métricas de Google Analytics (reporte completo)
  @Get('ga/report')
  @UseGuards(AdminGuard)
  async getGAReport(@Query('period') period?: string) {
    return this.gaAnalyticsService.getFullGAReport(period);
  }

  @Post('contact-click')
  async registerContactClick(@Body() dto: RegisterContactClickDto) {
    return this.analyticsService.registerContactClick(dto);
  }
}
