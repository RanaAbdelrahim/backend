import 'dotenv/config';
import { connectDB } from '../lib/db.js';
import { seedAll } from './seed.js';
import mongoose from 'mongoose';

const forceReseed = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();
    
    console.log('Forcing reseed of all data...');
    
    // Run main seed with force flag
    process.argv.push('--force'); // Add force flag
    await seedAll({ ensureConnected: false });
    
    // Import and run other seed files
    try {
      // Marketing seed
      const marketingSeed = await import('./marketingSeed.js');
      if (typeof marketingSeed.default === 'function') {
        await marketingSeed.default();
      } else {
        console.log('Marketing seed not found or not a function, skipping...');
      }
    } catch (err) {
      console.error('Error running marketing seed:', err);
    }
    
    console.log('All seeds completed successfully!');
    
    // Close the database connection
    await mongoose.connection.close();
    
    console.log('Database connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Force reseed error:', err);
    process.exit(1);
  }
};

forceReseed();
