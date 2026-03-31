import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from './model/order.schema';
import {
  CreateOrderDto,
  AnalyticsQueryDto,
  RegisterContactClickDto,
} from './dto/analytics.dto';
import { SellerContact } from './model/seller-contact.schema';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(SellerContact.name)
    private readonly sellerContactModel: Model<SellerContact>,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const transactionId = `${dto.sellerPhone}_${Date.now()}`;

    const totalItems = dto.products.length;
    const totalQuantity = dto.products.reduce((sum, p) => sum + p.quantity, 0);

    const order = new this.orderModel({
      transactionId,
      sellerPhone: dto.sellerPhone,
      sellerName: dto.sellerName,
      sellerRole: dto.sellerRole,
      products: dto.products.map((p) => ({
        productId: p.productId,
        name: p.name,
        price: p.price,
        currency: p.currency,
        quantity: p.quantity,
        category: p.category || '',
      })),
      deliveryMethod: dto.deliveryMethod || '',
      deliveryZone: dto.deliveryZone || '',
      deliveryPrice: dto.deliveryPrice || 0,
      deliveryAddress: dto.deliveryAddress || '',
      subtotals: dto.subtotals,
      totals: dto.totals,
      totalItems,
      totalQuantity,
    });

    return order.save();
  }

  private getDateFilter(period?: string): { createdAt?: { $gte: Date } } {
    if (!period || period === 'all') return {};

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '12m':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        return {};
    }

    return { createdAt: { $gte: startDate } };
  }

  /**
   * Filtro de fecha para contactos (usa el campo 'date' en formato string)
   */
  private getContactDateFilter(period?: string): Record<string, any> {
    if (!period || period === 'all') return {};

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '12m':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        return {};
    }

    return { date: { $gte: startDate.toISOString().split('T')[0] } };
  }

  /**
   * Comparación de período anterior para contactos
   */
  private async getContactPeriodComparison(
    period?: string,
    sellerFilter: Record<string, any> = {},
  ) {
    const now = new Date();
    let currentStart: Date;
    let previousStart: Date;

    switch (period) {
      case '7d':
        currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        currentStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      default:
        currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        break;
    }

    const currentDateStr = currentStart.toISOString().split('T')[0];
    const previousDateStr = previousStart.toISOString().split('T')[0];

    const [currentAgg, previousAgg] = await Promise.all([
      this.sellerContactModel.aggregate([
        {
          $match: {
            ...sellerFilter,
            date: { $gte: currentDateStr },
          },
        },
        { $group: { _id: null, total: { $sum: '$clickCount' } } },
      ]),
      this.sellerContactModel.aggregate([
        {
          $match: {
            ...sellerFilter,
            date: { $gte: previousDateStr, $lt: currentDateStr },
          },
        },
        { $group: { _id: null, total: { $sum: '$clickCount' } } },
      ]),
    ]);

    const current = currentAgg[0]?.total || 0;
    const previous = previousAgg[0]?.total || 0;

    const percentage =
      previous > 0
        ? Math.round(((current - previous) / previous) * 100 * 100) / 100
        : current > 0
          ? 100
          : 0;

    return {
      currentPeriodClicks: current,
      previousPeriodClicks: previous,
      percentage,
    };
  }

  async getDashboardStats(query: AnalyticsQueryDto) {
    const dateFilter = this.getDateFilter(query.period);
    const contactDateFilter = this.getContactDateFilter(query.period);
    const sellerFilter = query.sellerPhone
      ? { sellerPhone: query.sellerPhone }
      : {};
    const matchFilter = { ...dateFilter, ...sellerFilter };
    const contactMatchFilter = { ...contactDateFilter, ...sellerFilter };

    const [
      totalOrders,
      revenueAgg,
      topProductsAgg,
      topCategoriesAgg,
      ordersByDayAgg,
      topSellersAgg,
      deliveryMethodsAgg,
      currencyDistributionAgg,
      recentOrders,
      // CONTACTOS: Solo lo que necesitas
      sellerContacts,
    ] = await Promise.all([
      // Total de pedidos
      this.orderModel.countDocuments(matchFilter),

      // Ingresos totales por moneda
      this.orderModel.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: null,
            totalCUP: { $sum: '$totals.CUP' },
            totalMLC: { $sum: '$totals.MLC' },
            totalUSD: { $sum: '$totals.USD' },
            totalDelivery: { $sum: '$deliveryPrice' },
            totalItems: { $sum: '$totalItems' },
            totalQuantity: { $sum: '$totalQuantity' },
          },
        },
      ]),

      // Productos más vendidos
      this.orderModel.aggregate([
        { $match: matchFilter },
        { $unwind: '$products' },
        {
          $group: {
            _id: '$products.productId',
            name: { $first: '$products.name' },
            category: { $first: '$products.category' },
            totalSold: { $sum: '$products.quantity' },
            totalRevenue: {
              $sum: { $multiply: ['$products.price', '$products.quantity'] },
            },
            currency: { $first: '$products.currency' },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
      ]),

      // Categorías más vendidas
      this.orderModel.aggregate([
        { $match: matchFilter },
        { $unwind: '$products' },
        {
          $group: {
            _id: '$products.category',
            totalSold: { $sum: '$products.quantity' },
            totalRevenue: {
              $sum: { $multiply: ['$products.price', '$products.quantity'] },
            },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
      ]),

      // Pedidos por día
      this.orderModel.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count: { $sum: 1 },
            totalCUP: { $sum: '$totals.CUP' },
            totalMLC: { $sum: '$totals.MLC' },
            totalUSD: { $sum: '$totals.USD' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Top vendedores
      this.orderModel.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: '$sellerPhone',
            sellerName: { $first: '$sellerName' },
            sellerRole: { $first: '$sellerRole' },
            orderCount: { $sum: 1 },
            totalCUP: { $sum: '$totals.CUP' },
            totalMLC: { $sum: '$totals.MLC' },
            totalUSD: { $sum: '$totals.USD' },
            totalItems: { $sum: '$totalQuantity' },
          },
        },
        { $sort: { orderCount: -1 } },
        { $limit: 10 },
      ]),

      // Métodos de entrega
      this.orderModel.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: '$deliveryMethod',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Distribución por moneda
      this.orderModel.aggregate([
        { $match: matchFilter },
        { $unwind: '$products' },
        {
          $group: {
            _id: '$products.currency',
            totalSold: { $sum: '$products.quantity' },
            totalRevenue: {
              $sum: { $multiply: ['$products.price', '$products.quantity'] },
            },
          },
        },
        { $sort: { totalRevenue: -1 } },
      ]),

      // Pedidos recientes
      this.orderModel
        .find(matchFilter)
        .sort({ createdAt: -1 })
        .limit(10)
        .select(
          'transactionId sellerName sellerPhone sellerRole totals totalItems totalQuantity deliveryMethod createdAt',
        )
        .lean(),

      // ==========================================
      // CONTACTOS POR TIENDA (simplificado)
      // ==========================================
      this.sellerContactModel.aggregate([
        { $match: contactMatchFilter },
        {
          $group: {
            _id: '$sellerPhone',
            sellerName: { $first: '$sellerName' },
            sellerRole: { $first: '$sellerRole' },
            totalClicks: { $sum: '$clickCount' },
            lastContactDate: { $max: '$date' },
          },
        },
        { $sort: { totalClicks: -1 } },
      ]),
    ]);

    const revenue = revenueAgg[0] || {
      totalCUP: 0,
      totalMLC: 0,
      totalUSD: 0,
      totalDelivery: 0,
      totalItems: 0,
      totalQuantity: 0,
    };

    // Calcular comparación con período anterior (solo órdenes)
    const periodComparison = await this.getPeriodComparison(
      query.period,
      sellerFilter,
    );

    return {
      overview: {
        totalOrders,
        totalItems: revenue.totalItems,
        totalQuantity: revenue.totalQuantity,
        revenue: {
          CUP: revenue.totalCUP,
          MLC: revenue.totalMLC,
          USD: revenue.totalUSD,
        },
        totalDeliveryRevenue: revenue.totalDelivery,
        growth: periodComparison,
      },
      topProducts: topProductsAgg,
      topCategories: topCategoriesAgg.map((cat) => ({
        category: cat._id || 'Sin categoría',
        totalSold: cat.totalSold,
        totalRevenue: cat.totalRevenue,
        orderCount: cat.orderCount,
      })),
      ordersByDay: ordersByDayAgg.map((day) => ({
        date: day._id,
        count: day.count,
        revenue: {
          CUP: day.totalCUP,
          MLC: day.totalMLC,
          USD: day.totalUSD,
        },
      })),
      topSellers: topSellersAgg.map((seller) => ({
        phone: seller._id,
        name: seller.sellerName,
        role: seller.sellerRole,
        orderCount: seller.orderCount,
        revenue: {
          CUP: seller.totalCUP,
          MLC: seller.totalMLC,
          USD: seller.totalUSD,
        },
        totalItems: seller.totalItems,
      })),
      deliveryMethods: deliveryMethodsAgg.map((dm) => ({
        method: dm._id || 'No especificado',
        count: dm.count,
      })),
      currencyDistribution: currencyDistributionAgg.map((cd) => ({
        currency: cd._id,
        totalSold: cd.totalSold,
        totalRevenue: cd.totalRevenue,
      })),
      recentOrders,

      // ==========================================
      // CONTACTOS POR TIENDA (simplificado)
      // ==========================================
      sellerContacts: sellerContacts.map((contact) => ({
        name: contact.sellerName,
        role: contact.sellerRole,
        clicks: contact.totalClicks,
        lastContact: contact.lastContactDate,
      })),
    };
  }

  private async getPeriodComparison(
    period?: string,
    sellerFilter: Record<string, any> = {},
  ) {
    const now = new Date();
    let currentStart: Date;
    let previousStart: Date;

    switch (period) {
      case '7d':
        currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        currentStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      default:
        // Para "all" o "12m", comparar con el mes anterior
        currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        break;
    }

    const [currentOrders, previousOrders] = await Promise.all([
      this.orderModel.countDocuments({
        ...sellerFilter,
        createdAt: { $gte: currentStart },
      }),
      this.orderModel.countDocuments({
        ...sellerFilter,
        createdAt: { $gte: previousStart, $lt: currentStart },
      }),
    ]);

    const percentage =
      previousOrders > 0
        ? Math.round(
            ((currentOrders - previousOrders) / previousOrders) * 100 * 100,
          ) / 100
        : currentOrders > 0
          ? 100
          : 0;

    return {
      currentPeriodOrders: currentOrders,
      previousPeriodOrders: previousOrders,
      percentage,
    };
  }

  async getSellerAnalytics(sellerPhone: string, period?: string) {
    return this.getDashboardStats({ period, sellerPhone });
  }

  async getOrders(page = 1, limit = 20, period?: string, sellerPhone?: string) {
    const dateFilter = this.getDateFilter(period);
    const sellerFilter = sellerPhone ? { sellerPhone } : {};
    const matchFilter = { ...dateFilter, ...sellerFilter };

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(matchFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(matchFilter),
    ]);

    return {
      orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================
  // CONTACT CLICKS
  // ==========================================

  async registerContactClick(
    dto: RegisterContactClickDto,
  ): Promise<{ success: boolean; totalClicks: number }> {
    const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

    // Upsert: incrementa el contador si ya existe, crea si no
    const result = await this.sellerContactModel.findOneAndUpdate(
      {
        sellerPhone: dto.sellerPhone,
        date: today,
      },
      {
        $inc: { clickCount: 1 },
        $setOnInsert: {
          sellerName: dto.sellerName,
          sellerRole: dto.sellerRole,
        },
      },
      {
        upsert: true,
        new: true,
      },
    );

    return {
      success: true,
      totalClicks: result.clickCount,
    };
  }
}
