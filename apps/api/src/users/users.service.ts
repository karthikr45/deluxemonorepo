import { Injectable, NotFoundException } from '@nestjs/common';
import { LogCategory, User } from '@deluxe/db';
import { PrismaService } from '../prisma/prisma.service';
import { ZenotiService } from '../zenoti/zenoti.service';
import { ShopifyService } from '../shopify/shopify.service';
import { ActivityService } from '../activity/activity.service';

/**
 * Owns the Shopify <-> Zenoti identity mapping. Given a Shopify customer id,
 * resolves (and lazily links) the matching Zenoti guest so we can read/redeem
 * their loyalty points.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zenoti: ZenotiService,
    private readonly shopify: ShopifyService,
    private readonly activity: ActivityService,
  ) {}

  /**
   * Resolve a User for a Shopify customer, creating and linking to a Zenoti
   * guest on first sight (matched by email, then phone).
   */
  async resolveByShopifyCustomer(shopifyCustomerId: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { shopifyCustomerId } });
    if (existing?.zenotiGuestId) return existing;

    // Pull the Shopify customer to get email/phone for matching.
    const customer = await this.shopify.client.getCustomer(shopifyCustomerId);
    if (!customer) {
      throw new NotFoundException(`Shopify customer ${shopifyCustomerId} not found`);
    }

    // Find the matching Zenoti guest.
    const guest = await this.zenoti.client.findGuest({
      email: customer.email,
      phone: customer.phone,
    });

    if (!guest) {
      await this.activity.warn(
        LogCategory.ZENOTI,
        `No Zenoti guest match for Shopify customer ${shopifyCustomerId}`,
        { context: { email: customer.email, phone: customer.phone } },
      );
      // Still record the user so the dashboard sees them; unlinked balance = 0.
      return this.prisma.user.upsert({
        where: { shopifyCustomerId },
        update: {
          email: customer.email,
          phone: customer.phone,
          firstName: customer.firstName,
          lastName: customer.lastName,
        },
        create: {
          shopifyCustomerId,
          email: customer.email,
          phone: customer.phone,
          firstName: customer.firstName,
          lastName: customer.lastName,
        },
      });
    }

    const user = await this.prisma.user.upsert({
      where: { shopifyCustomerId },
      update: {
        zenotiGuestId: guest.guestId,
        email: customer.email ?? guest.email,
        phone: customer.phone ?? guest.phone,
        firstName: customer.firstName ?? guest.firstName,
        lastName: customer.lastName ?? guest.lastName,
        pointsBalance: guest.loyaltyPointsBalance,
        lastSyncedAt: new Date(),
      },
      create: {
        shopifyCustomerId,
        zenotiGuestId: guest.guestId,
        email: customer.email ?? guest.email,
        phone: customer.phone ?? guest.phone,
        firstName: customer.firstName ?? guest.firstName,
        lastName: customer.lastName ?? guest.lastName,
        pointsBalance: guest.loyaltyPointsBalance,
        lastSyncedAt: new Date(),
      },
    });

    await this.activity.info(LogCategory.SYSTEM, `Linked Shopify customer to Zenoti guest`, {
      userId: user.id,
      context: { shopifyCustomerId, zenotiGuestId: guest.guestId },
    });

    return user;
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async list(take = 50, skip = 0) {
    const takeN = Math.min(take, 200);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        orderBy: { updatedAt: 'desc' },
        take: takeN,
        skip,
      }),
      this.prisma.user.count(),
    ]);
    return { items, total, take: takeN, skip };
  }
}
