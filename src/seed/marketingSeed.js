import 'dotenv/config';
import { connectDB } from '../lib/db.js';
import User from '../models/User.js';
import Event from '../models/Event.js';
import MarketingCampaign from '../models/MarketingCampaign.js';
import EmailCampaign from '../models/EmailCampaign.js';
import SocialPost from '../models/SocialPost.js';
import MarketingStats from '../models/MarketingStats.js';

// Sample email template HTML
const sampleEmailTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Event Invitation</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .logo { max-width: 150px; }
    .button { 
      display: inline-block; 
      padding: 10px 20px; 
      background-color: #0ea5e9; 
      color: white !important; 
      text-decoration: none; 
      border-radius: 4px;
      font-weight: bold;
    }
    .footer { text-align: center; font-size: 12px; color: #666; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>You're Invited!</h1>
    </div>
    <p>Hello there,</p>
    <p>We're excited to invite you to our upcoming event:</p>
    <h2>{{event_name}}</h2>
    <p>
      <strong>Date:</strong> {{event_date}}<br>
      <strong>Time:</strong> {{event_time}}<br>
      <strong>Location:</strong> {{event_location}}
    </p>
    <p>Join us for an unforgettable experience with amazing performances, activities, and more!</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="{{booking_link}}" class="button">Book Your Tickets Now</a>
    </p>
    <p>Limited seats available, so book early to avoid disappointment.</p>
    <p>We look forward to seeing you there!</p>
    <div class="footer">
      <p>© 2023 EventX. All rights reserved.</p>
      <p>If you no longer wish to receive these emails, <a href="{{unsubscribe_link}}">unsubscribe here</a>.</p>
    </div>
  </div>
</body>
</html>
`;

const seedMarketing = async () => {
  console.log('Connecting to database...');
  await connectDB();
  
  console.log('Finding admin user...');
  const admin = await User.findOne({ email: 'admin@eventx.dev' });
  if (!admin) {
    console.error('Admin user not found! Run the main seed first.');
    process.exit(1);
  }
  
  console.log('Finding some events...');
  const events = await Event.find().limit(3);
  if (events.length === 0) {
    console.error('No events found! Run the main seed first.');
    process.exit(1);
  }
  
  console.log('Clearing existing marketing data...');
  await Promise.all([
    MarketingCampaign.deleteMany({}),
    EmailCampaign.deleteMany({}),
    SocialPost.deleteMany({}),
    MarketingStats.deleteMany({})
  ]);
  
  console.log('Creating marketing campaigns...');
  
  // Create campaigns for each event
  const campaigns = [];
  const today = new Date();
  
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    
    // Create marketing campaigns with different statuses
    let status, startAt, endAt;
    
    if (i === 0) {
      // Active campaign
      status = 'Active';
      startAt = new Date(today);
      startAt.setDate(today.getDate() - 7); // Started 7 days ago
      endAt = new Date(today);
      endAt.setDate(today.getDate() + 14); // Ends in 14 days
    } else if (i === 1) {
      // Scheduled campaign
      status = 'Scheduled';
      startAt = new Date(today);
      startAt.setDate(today.getDate() + 7); // Starts in 7 days
      endAt = new Date(today);
      endAt.setDate(today.getDate() + 30); // Ends in 30 days
    } else {
      // Completed campaign
      status = 'Completed';
      startAt = new Date(today);
      startAt.setDate(today.getDate() - 30); // Started 30 days ago
      endAt = new Date(today);
      endAt.setDate(today.getDate() - 1); // Ended yesterday
    }
    
    const campaign = await MarketingCampaign.create({
      name: `${event.title} Campaign`,
      status,
      eventId: event._id,
      startAt,
      endAt,
      budget: Math.floor(Math.random() * 5000) + 1000,
      target: {
        status: ['all', 'checked', 'not_checked'][i % 3],
        interests: ['Music', 'Tech', 'Food'][i % 3],
        locations: ['Colombo', 'Kandy', 'Galle'][i % 3]
      },
      objective: ['awareness', 'consideration', 'conversion'][i % 3],
      description: `Marketing campaign for ${event.title}`,
      createdBy: admin._id
    });
    
    campaigns.push(campaign);
    console.log(`Created campaign: ${campaign.name} (${campaign._id})`);
    
    // Create email campaigns
    if (i === 0) {
      const emailCampaign = await EmailCampaign.create({
        campaignId: campaign._id,
        subject: `Don't Miss Out: ${event.title}`,
        templateHtml: sampleEmailTemplate
          .replace('{{event_name}}', event.title)
          .replace('{{event_date}}', new Date(event.date).toLocaleDateString())
          .replace('{{event_time}}', event.time || '6:00 PM')
          .replace('{{event_location}}', event.venue)
          .replace('{{booking_link}}', `http://localhost:5173/events/${event._id}?utm_campaign=${campaign.utmCode}`)
          .replace('{{unsubscribe_link}}', '#'),
        fromEmail: 'events@eventx.dev',
        segment: campaign.target,
        status: 'Sent',
        provider: 'mock',
        stats: {
          sent: 120,
          delivered: 115,
          opens: 80,
          clicks: 42,
          bounces: 5
        },
        scheduledAt: new Date(today.setDate(today.getDate() - 5)),
        sentAt: new Date(today.setDate(today.getDate() - 5)),
        recipients: {
          count: 120,
          processed: 120
        }
      });
      
      console.log(`Created email campaign: ${emailCampaign._id}`);
    }
    
    // Create social posts
    const platforms = ['facebook', 'twitter', 'instagram'];
    
    for (const platform of platforms) {
      let status = 'Draft';
      let scheduledAt = new Date(today);
      let postedAt = null;
      
      if (i === 0) {
        // Active campaign - posts should be Posted
        status = 'Posted';
        scheduledAt.setDate(today.getDate() - 3);
        postedAt = scheduledAt;
      } else if (i === 1) {
        // Scheduled campaign - posts should be Queued
        status = 'Queued';
        scheduledAt.setDate(today.getDate() + 10);
      }
      
      const socialPost = await SocialPost.create({
        campaignId: campaign._id,
        platform,
        content: `Check out our upcoming event: ${event.title} at ${event.venue}! Book your tickets now. #EventX #${event.title.replace(/\s+/g, '')}`,
        scheduledAt,
        status,
        linkUrl: `http://localhost:5173/events/${event._id}?utm_campaign=${campaign.utmCode}&utm_source=${platform}`,
        imageUrl: 'https://source.unsplash.com/random/800x600/?event',
        postedAt,
        stats: status === 'Posted' ? {
          impressions: Math.floor(Math.random() * 1000) + 500,
          clicks: Math.floor(Math.random() * 100) + 50,
          likes: Math.floor(Math.random() * 50) + 20,
          shares: Math.floor(Math.random() * 20) + 5,
          comments: Math.floor(Math.random() * 10) + 2
        } : undefined
      });
      
      console.log(`Created ${platform} post: ${socialPost._id}`);
    }
    
    // Create marketing stats for the past 7 days
    for (let j = 0; j < 7; j++) {
      const statsDate = new Date(today);
      statsDate.setDate(today.getDate() - j);
      const dateStr = statsDate.toISOString().split('T')[0];
      
      // Randomize stats based on day, with more recent days having higher numbers
      const scaleFactor = (7 - j) / 7; // 1 for today, decreasing for older days
      
      await MarketingStats.create({
        campaignId: campaign._id,
        date: dateStr,
        reach: Math.floor((Math.random() * 500 + 200) * scaleFactor),
        conversions: Math.floor((Math.random() * 50 + 10) * scaleFactor),
        revenue: Math.floor((Math.random() * 5000 + 1000) * scaleFactor),
        email: {
          sent: Math.floor((Math.random() * 150 + 50) * scaleFactor),
          delivered: Math.floor((Math.random() * 140 + 40) * scaleFactor),
          opens: Math.floor((Math.random() * 100 + 30) * scaleFactor),
          clicks: Math.floor((Math.random() * 50 + 20) * scaleFactor),
          bounces: Math.floor((Math.random() * 10) * scaleFactor)
        },
        social: {
          impressions: Math.floor((Math.random() * 1000 + 300) * scaleFactor),
          clicks: Math.floor((Math.random() * 200 + 50) * scaleFactor),
          engagements: Math.floor((Math.random() * 100 + 30) * scaleFactor)
        }
      });
      
      console.log(`Created stats for campaign ${campaign._id} on ${dateStr}`);
    }
  }
  
  console.log('Marketing seed completed!');
  process.exit(0);
};

seedMarketing().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
