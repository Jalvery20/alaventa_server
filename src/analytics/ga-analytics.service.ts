import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

@Injectable()
export class GAAnalyticsService implements OnModuleInit {
  private client: BetaAnalyticsDataClient;
  private propertyId: string;
  private readonly logger = new Logger(GAAnalyticsService.name);
  private isConfigured = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const propertyId = this.configService.get<string>('GA4_PROPERTY_ID');
    const clientEmail = this.configService.get<string>('GA_CLIENT_EMAIL');
    const privateKey = this.configService
      .get<string>('GA_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!propertyId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Google Analytics credentials not configured. GA metrics will be unavailable.',
      );
      return;
    }

    this.propertyId = propertyId;
    this.client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });
    this.isConfigured = true;
    this.logger.log('Google Analytics Data API client initialized');
  }

  private getDateRange(period: string): { startDate: string; endDate: string } {
    const endDate = 'today';
    const periodMap: Record<string, string> = {
      '7d': '7daysAgo',
      '30d': '30daysAgo',
      '90d': '90daysAgo',
      '12m': '365daysAgo',
      all: '2020-01-01',
    };
    return { startDate: periodMap[period] || '30daysAgo', endDate };
  }

  async getTrafficOverview(period = '30d') {
    if (!this.isConfigured) {
      return this.emptyOverview();
    }

    try {
      const dateRange = this.getDateRange(period);
      const previousDateRange = this.getPreviousDateRange(period);

      const [currentResponse] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [dateRange],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
          { name: 'newUsers' },
        ],
      });

      const [previousResponse] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [previousDateRange],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
          { name: 'newUsers' },
        ],
      });

      const current = this.extractMetrics(currentResponse);
      const previous = this.extractMetrics(previousResponse);

      return {
        activeUsers: current.activeUsers,
        sessions: current.sessions,
        pageViews: current.screenPageViews,
        avgSessionDuration: current.averageSessionDuration,
        bounceRate: current.bounceRate,
        newUsers: current.newUsers,
        growth: {
          activeUsers: this.calcGrowth(
            current.activeUsers,
            previous.activeUsers,
          ),
          sessions: this.calcGrowth(current.sessions, previous.sessions),
          pageViews: this.calcGrowth(
            current.screenPageViews,
            previous.screenPageViews,
          ),
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch GA traffic overview', error.message);
      return this.emptyOverview();
    }
  }

  async getTrafficByDay(period = '30d') {
    if (!this.isConfigured) return [];

    try {
      const dateRange = this.getDateRange(period);

      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
        ],
        orderBys: [
          { dimension: { dimensionName: 'date', orderType: 'ALPHANUMERIC' } },
        ],
      });

      return (response.rows || []).map((row) => ({
        date: this.formatGADate(row.dimensionValues[0].value),
        activeUsers: parseInt(row.metricValues[0].value) || 0,
        sessions: parseInt(row.metricValues[1].value) || 0,
        pageViews: parseInt(row.metricValues[2].value) || 0,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch GA traffic by day', error.message);
      return [];
    }
  }

  async getTrafficSources(period = '30d') {
    if (!this.isConfigured) return [];

    try {
      const dateRange = this.getDateRange(period);

      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      });

      return (response.rows || []).map((row) => ({
        source: row.dimensionValues[0].value || '(direct)',
        medium: row.dimensionValues[1].value || '(none)',
        sessions: parseInt(row.metricValues[0].value) || 0,
        users: parseInt(row.metricValues[1].value) || 0,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch GA traffic sources', error.message);
      return [];
    }
  }

  async getTopPages(period = '30d') {
    if (!this.isConfigured) return [];

    try {
      const dateRange = this.getDateRange(period);

      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'activeUsers' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      });

      return (response.rows || []).map((row) => ({
        path: row.dimensionValues[0].value,
        views: parseInt(row.metricValues[0].value) || 0,
        users: parseInt(row.metricValues[1].value) || 0,
        avgDuration: parseFloat(row.metricValues[2].value) || 0,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch GA top pages', error.message);
      return [];
    }
  }

  async getDeviceBreakdown(period = '30d') {
    if (!this.isConfigured) return [];

    try {
      const dateRange = this.getDateRange(period);

      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      });

      return (response.rows || []).map((row) => ({
        device: row.dimensionValues[0].value,
        sessions: parseInt(row.metricValues[0].value) || 0,
        users: parseInt(row.metricValues[1].value) || 0,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch GA device breakdown', error.message);
      return [];
    }
  }

  async getCountryBreakdown(period = '30d') {
    if (!this.isConfigured) return [];

    try {
      const dateRange = this.getDateRange(period);

      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [dateRange],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 10,
      });

      return (response.rows || []).map((row) => ({
        country: row.dimensionValues[0].value,
        users: parseInt(row.metricValues[0].value) || 0,
        sessions: parseInt(row.metricValues[1].value) || 0,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch GA country breakdown', error.message);
      return [];
    }
  }

  // Endpoint combinado para obtener todo de una vez
  async getFullGAReport(period = '30d') {
    const [overview, trafficByDay, sources, topPages, devices, countries] =
      await Promise.all([
        this.getTrafficOverview(period),
        this.getTrafficByDay(period),
        this.getTrafficSources(period),
        this.getTopPages(period),
        this.getDeviceBreakdown(period),
        this.getCountryBreakdown(period),
      ]);

    return {
      overview,
      trafficByDay,
      sources,
      topPages,
      devices,
      countries,
    };
  }

  // Helpers
  private extractMetrics(response: any): Record<string, number> {
    const row = response?.rows?.[0];
    if (!row) return {};

    const result: Record<string, number> = {};
    response.metricHeaders.forEach((header: any, index: number) => {
      result[header.name] = parseFloat(row.metricValues[index].value) || 0;
    });
    return result;
  }

  private calcGrowth(current: number, previous: number): number {
    if (!previous) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private getPreviousDateRange(period: string): {
    startDate: string;
    endDate: string;
  } {
    const daysMap: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '12m': 365,
      all: 1825,
    };
    const days = daysMap[period] || 30;
    return {
      startDate: `${days * 2}daysAgo`,
      endDate: `${days + 1}daysAgo`,
    };
  }

  private formatGADate(dateStr: string): string {
    // GA returns dates as "YYYYMMDD", convert to "YYYY-MM-DD"
    if (dateStr && dateStr.length === 8) {
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
    return dateStr;
  }

  private emptyOverview() {
    return {
      activeUsers: 0,
      sessions: 0,
      pageViews: 0,
      avgSessionDuration: 0,
      bounceRate: 0,
      newUsers: 0,
      growth: {
        activeUsers: 0,
        sessions: 0,
        pageViews: 0,
      },
    };
  }
}
