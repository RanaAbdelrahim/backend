// scripts/seedDashboards.js
import 'dotenv/config';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { connectDB } from '../lib/db.js';
import Dashboard from '../models/Dashboard.js';
import User from '../models/User.js';

/**
 * Seeds default dashboards for the admin user.
 * @param {{ clear?: boolean }} opts
 */
export async function seedDashboards({ clear = true } = {}) {
  console.log('[seed:dashboards] Connecting to database…');
  await connectDB();

  try {
    console.log('[seed:dashboards] Looking up admin user (admin@eventx.dev)…');
    const admin = await User.findOne({ email: 'admin@eventx.dev' });
    if (!admin) {
      throw new Error('Admin user not found! Run the main user/event seed first.');
    }

    if (clear) {
      console.log('[seed:dashboards] Clearing existing dashboards for this user…');
      await Dashboard.deleteMany({ user: admin._id });
    }

    console.log('[seed:dashboards] Creating dashboards…');

    // Default admin dashboard
    const adminDashboard = await Dashboard.create({
      user: admin._id,
      name: 'Admin Dashboard',
      isDefault: true,
      layout: [
        {
          type: 'stats',
          title: 'Event Overview',
          dataSource: 'eventStats',
          size: { cols: 4, rows: 1 },
          position: { x: 0, y: 0 }
        },
        {
          type: 'stats',
          title: 'Booking Summary',
          dataSource: 'bookingStats',
          size: { cols: 4, rows: 1 },
          position: { x: 4, y: 0 }
        },
        {
          type: 'stats',
          title: 'User Statistics',
          dataSource: 'userStats',
          size: { cols: 4, rows: 1 },
          position: { x: 8, y: 0 }
        },
        {
          type: 'list',
          title: 'Upcoming Events',
          dataSource: 'upcomingEvents',
          size: { cols: 6, rows: 2 },
          position: { x: 0, y: 1 }
        },
        {
          type: 'chart',
          title: 'Revenue Overview',
          dataSource: 'revenueChart',
          size: { cols: 6, rows: 2 },
          position: { x: 6, y: 1 }
        }
      ]
    });

    // Secondary dashboard
    const marketingDashboard = await Dashboard.create({
      user: admin._id,
      name: 'Marketing Overview',
      isDefault: false,
      layout: [
        {
          type: 'stats',
          title: 'Campaign Performance',
          dataSource: 'campaignStats',
          size: { cols: 12, rows: 1 },
          position: { x: 0, y: 0 }
        },
        {
          type: 'chart',
          title: 'Marketing Reach',
          dataSource: 'marketingReach',
          size: { cols: 6, rows: 2 },
          position: { x: 0, y: 1 }
        },
        {
          type: 'chart',
          title: 'Conversion Rates',
          dataSource: 'conversionRates',
          size: { cols: 6, rows: 2 },
          position: { x: 6, y: 1 }
        }
      ]
    });

    console.log(`[seed:dashboards] Created: ${adminDashboard.name} (${adminDashboard._id})`);
    console.log(`[seed:dashboards] Created: ${marketingDashboard.name} (${marketingDashboard._id})`);
    console.log('[seed:dashboards] Done.');
  } catch (err) {
    console.error('[seed:dashboards] Seed error:', err);
    throw err;
  } finally {
    await mongoose.connection.close();
  }
}

// Run only if executed directly: `node scripts/seedDashboards.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDashboards()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
