import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { ServicesModule } from './services/services.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { SchedulesModule } from './schedules/schedules.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { CustomersModule } from './customers/customers.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    TenantsModule,
    ServicesModule,
    ProfessionalsModule,
    SchedulesModule,
    AppointmentsModule,
    CustomersModule,
    AuthModule,
    NotificationsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Aplicar middleware de tenant a todas las rutas admin
    // Excluir POST /tenants porque es público (onboarding)
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'tenants', method: RequestMethod.POST }, // POST /tenants es público para onboarding
        { path: 'tenants/slug/:slug', method: RequestMethod.GET }, // GET /tenants/slug/:slug es público
      )
      .forRoutes('tenants', 'services', 'professionals', 'schedules', 'appointments', 'customers');
  }
}

