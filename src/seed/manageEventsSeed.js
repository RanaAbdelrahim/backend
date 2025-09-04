import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';
import User from '../models/User.js';
import Event from '../models/Event.js';
import ManageEvent from '../models/ManageEvent.js';

const seedManageEvents = async () => {
  console.log('Connecting to database...');
  await connectDB();
  
  console.log('Finding admin user...');
  const admin = await User.findOne({ email: 'admin@eventx.dev' });
  if (!admin) {
    console.error('Admin user not found! Run the main seed first.');
    process.exit(1);
  }
  
  console.log('Finding events...');
  const events = await Event.find().limit(5);
  if (events.length === 0) {
    console.error('No events found! Run the main seed first.');
    process.exit(1);
  }
  
  console.log('Clearing existing manage events...');
  await ManageEvent.deleteMany({});
  
  console.log('Creating manage events...');
  
  // Sample tasks for checklist
  const checklistTasks = [
    { name: 'Book venue', dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), isCompleted: true },
    { name: 'Hire security', dueDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), isCompleted: true },
    { name: 'Arrange catering', dueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), isCompleted: false },
    { name: 'Send invitations', dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), isCompleted: false },
    { name: 'Set up sound system', dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), isCompleted: false },
    { name: 'Final venue inspection', dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), isCompleted: false }
  ];
  
  // Sample staff members
  const staffMembers = [
    { role: 'Event Manager', contactInfo: 'manager@eventx.dev', notes: 'Main point of contact' },
    { role: 'Security Lead', contactInfo: 'security@eventx.dev', notes: 'Handles all security personnel' },
    { role: 'Tech Support', contactInfo: 'tech@eventx.dev', notes: 'Responsible for AV equipment' }
  ];
  
  // Sample vendors
  const vendors = [
    { name: 'LuxCatering', service: 'Food & Beverage', contactPerson: 'John Smith', contactEmail: 'john@luxcatering.com', contactPhone: '123-456-7890', cost: 5000 },
    { name: 'SoundMasters', service: 'Audio Equipment', contactPerson: 'Alice Jones', contactEmail: 'alice@soundmasters.com', contactPhone: '987-654-3210', cost: 3000 },
    { name: 'CleanCrew', service: 'Cleaning Services', contactPerson: 'Bob Brown', contactEmail: 'bob@cleancrew.com', contactPhone: '555-123-4567', cost: 1000 }
  ];
  
  for (const event of events) {
    // Randomize which tasks are completed
    const eventChecklist = checklistTasks.map(task => ({
      ...task,
      isCompleted: Math.random() > 0.5 ? true : task.isCompleted
    }));
    
    // Randomize staff members
    const eventStaff = staffMembers
      .filter(() => Math.random() > 0.3) // Randomly select some staff
      .map(staff => ({
        ...staff,
        user: admin._id // Assign to admin user for demo
      }));
    
    // Randomize vendors
    const eventVendors = vendors
      .filter(() => Math.random() > 0.3) // Randomly select some vendors
      .map(vendor => ({
        ...vendor,
        cost: vendor.cost * (Math.random() + 0.5) // Randomize cost a bit
      }));
    
    const eventDate = new Date(event.date);
    
    const manageEvent = await ManageEvent.create({
      event: event._id,
      checklistItems: eventChecklist,
      staffMembers: eventStaff,
      vendors: eventVendors,
      budget: {
        allocated: 15000,
        spent: eventVendors.reduce((sum, vendor) => sum + vendor.cost, 0),
        notes: 'Budget allocation based on previous similar events'
      },
      timeline: {
        setupStart: new Date(eventDate.getTime() - 6 * 60 * 60 * 1000), // 6 hours before
        eventStart: eventDate,
        eventEnd: new Date(eventDate.getTime() + 4 * 60 * 60 * 1000), // 4 hours after
        breakdownEnd: new Date(eventDate.getTime() + 6 * 60 * 60 * 1000) // 6 hours after
      },
      notes: `Management notes for ${event.title}. Remember to coordinate with all vendors at least 48 hours before setup.`
    });
    
    console.log(`Created manage event for: ${event.title} (${manageEvent._id})`);
  }
  
  console.log('ManageEvent seed completed!');
  process.exit(0);
};

seedManageEvents().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
