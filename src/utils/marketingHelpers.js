import crypto from 'crypto';
import User from '../models/User.js';
import EmailEvent from '../models/EmailEvent.js';
import MarketingStats from '../models/MarketingStats.js';
import Booking from '../models/Booking.js';

/**
 * Generate a unique UTM code for campaign tracking
 */
export function generateUTMCode() {
  // Generate a short but unique campaign code
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `cmp-${randomPart}`;
}

/**
 * Resolve segment query to find matching attendees
 */
export async function resolveSegmentQuery(segment) {
  const query = {};
  
  // Filter by interests
  if (segment.interests && segment.interests.length > 0) {
    query.interests = { $in: segment.interests };
  }
  
  // Filter by location
  if (segment.locations && segment.locations.length > 0) {
    query.location = { $in: segment.locations };
  }
  
  // Filter by age range
  if (segment.minAge || segment.maxAge) {
    query.age = {};
    if (segment.minAge) query.age.$gte = segment.minAge;
    if (segment.maxAge) query.age.$lte = segment.maxAge;
  }
  
  // Find users matching the segment
  return User.find(query).select('_id name email age gender location interests').lean();
}

/**
 * Record an email event and update stats
 */
export async function recordEmailEvent(emailCampaignId, attendeeId, eventType, url = null) {
  try {
    // Create event record
    const event = await EmailEvent.create({
      emailCampaignId,
      attendeeId,
      event: eventType,
      url,
      ts: new Date()
    });
    
    // Update email campaign stats
    const EmailCampaign = mongoose.model('EmailCampaign');
    const updateQuery = {};
    updateQuery[`stats.${eventType}s`] = 1; // Increment the appropriate counter
    
    await EmailCampaign.findByIdAndUpdate(
      emailCampaignId,
      { $inc: updateQuery }
    );
    
    // Update daily stats
    await updateDailyStats(emailCampaignId);
    
    return event;
  } catch (error) {
    console.error('Error recording email event:', error);
    throw error;
  }
}

/**
 * Update daily stats for a campaign
 */
export async function updateDailyStats(campaignId) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Get all email campaigns for this marketing campaign
    const EmailCampaign = mongoose.model('EmailCampaign');
    const emailCampaigns = await EmailCampaign.find({ campaignId });
    
    // Get all social posts for this marketing campaign
    const SocialPost = mongoose.model('SocialPost');
    const socialPosts = await SocialPost.find({ campaignId });
    
    // Calculate totals
    const emailStats = {
      sent: 0,
      delivered: 0,
      opens: 0,
      clicks: 0
    };
    
    const socialStats = {
      impressions: 0,
      clicks: 0
    };
    
    // Sum up email stats
    emailCampaigns.forEach(campaign => {
      emailStats.sent += campaign.stats.sent || 0;
      emailStats.delivered += campaign.stats.delivered || 0;
      emailStats.opens += campaign.stats.opens || 0;
      emailStats.clicks += campaign.stats.clicks || 0;
    });
    
    // Sum up social stats
    socialPosts.forEach(post => {
      socialStats.impressions += post.stats.impressions || 0;
      socialStats.clicks += post.stats.clicks || 0;
    });
    
    // Calculate reach (unique recipients)
    const reach = emailStats.delivered + socialStats.impressions;
    
    // Get conversion count (bookings with this campaign as source)
    const conversions = await Booking.countDocuments({ 
      sourceCampaign: campaignId.toString(),
      createdAt: { 
        $gte: new Date(today),
        $lt: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000)
      }
    });
    
    // Upsert the stats for today
    await MarketingStats.updateOne(
      { campaignId, date: today },
      { 
        $set: {
          reach,
          conversions,
          email: emailStats,
          social: socialStats
        }
      },
      { upsert: true }
    );
    
    return { reach, conversions, emailStats, socialStats };
  } catch (error) {
    console.error('Error updating daily stats:', error);
    throw error;
  }
}

/**
 * Email provider interface
 */
export class EmailProvider {
  static getProvider(type = 'mock') {
    switch (type) {
      case 'sendgrid':
        return new SendgridProvider();
      case 'mailgun':
        return new MailgunProvider();
      case 'mock':
      default:
        return new MockEmailProvider();
    }
  }
  
  async sendEmail(campaign, recipient) {
    throw new Error('Method not implemented');
  }
}

/**
 * Mock email provider for development
 */
export class MockEmailProvider extends EmailProvider {
  async sendEmail(campaign, recipient) {
    // Simulate successful delivery with a slight delay
    console.log(`[MOCK EMAIL] To: ${recipient.email}, Subject: ${campaign.subject}`);
    
    // Record sent event
    await recordEmailEvent(campaign._id, recipient._id, 'sent');
    
    // Simulate delivery (90% success rate)
    if (Math.random() < 0.9) {
      setTimeout(async () => {
        await recordEmailEvent(campaign._id, recipient._id, 'delivered');
        
        // Simulate opens (60% open rate)
        if (Math.random() < 0.6) {
          setTimeout(async () => {
            await recordEmailEvent(campaign._id, recipient._id, 'open');
            
            // Simulate clicks (30% click rate on opened emails)
            if (Math.random() < 0.3) {
              setTimeout(async () => {
                await recordEmailEvent(campaign._id, recipient._id, 'click');
              }, Math.random() * 5000 + 1000);
            }
          }, Math.random() * 10000 + 5000);
        }
      }, Math.random() * 3000 + 1000);
      
      return { success: true, messageId: `mock-${Date.now()}-${recipient._id}` };
    } else {
      // Simulate bounce
      setTimeout(async () => {
        await recordEmailEvent(campaign._id, recipient._id, 'bounce');
      }, Math.random() * 3000 + 1000);
      
      return { success: false, error: 'Simulated delivery failure' };
    }
  }
}

/**
 * Placeholder for Sendgrid provider
 */
export class SendgridProvider extends EmailProvider {
  async sendEmail(campaign, recipient) {
    // Placeholder for real Sendgrid implementation
    console.log('[SENDGRID] Would send email via Sendgrid API');
    throw new Error('Sendgrid provider not fully implemented');
  }
}

/**
 * Placeholder for Mailgun provider
 */
export class MailgunProvider extends EmailProvider {
  async sendEmail(campaign, recipient) {
    // Placeholder for real Mailgun implementation
    console.log('[MAILGUN] Would send email via Mailgun API');
    throw new Error('Mailgun provider not fully implemented');
  }
}

/**
 * Social media publisher interface
 */
export class SocialPublisher {
  static getPublisher(platform = 'mock') {
    switch (platform) {
      case 'facebook':
        return new FacebookPublisher();
      case 'twitter':
        return new TwitterPublisher();
      case 'instagram':
        return new InstagramPublisher();
      default:
        return new MockSocialPublisher(platform);
    }
  }
  
  async publishPost(post) {
    throw new Error('Method not implemented');
  }
}

/**
 * Mock social media publisher
 */
export class MockSocialPublisher extends SocialPublisher {
  constructor(platform) {
    super();
    this.platform = platform;
  }
  
  async publishPost(post) {
    console.log(`[MOCK ${this.platform.toUpperCase()}] Published: ${post.content.substring(0, 50)}...`);
    
    // Simulate stats based on platform
    const baseImpressions = {
      facebook: 500,
      twitter: 300,
      instagram: 800
    }[this.platform] || 100;
    
    // Add some randomness
    const impressions = Math.floor(baseImpressions * (0.8 + Math.random() * 0.4));
    const clickRate = {
      facebook: 0.02,
      twitter: 0.015,
      instagram: 0.01
    }[this.platform] || 0.01;
    
    const clicks = Math.floor(impressions * clickRate);
    
    // Update post with stats
    const SocialPost = mongoose.model('SocialPost');
    await SocialPost.findByIdAndUpdate(post._id, {
      status: 'Posted',
      'stats.impressions': impressions,
      'stats.clicks': clicks
    });
    
    return {
      success: true,
      externalId: `mock-${Date.now()}-${this.platform}`,
      stats: { impressions, clicks }
    };
  }
}

/**
 * Placeholder for real social media publishers
 */
export class FacebookPublisher extends SocialPublisher {
  async publishPost(post) {
    console.log('[FACEBOOK] Would publish to Facebook');
    throw new Error('Facebook publisher not fully implemented');
  }
}

export class TwitterPublisher extends SocialPublisher {
  async publishPost(post) {
    console.log('[TWITTER] Would publish to Twitter');
    throw new Error('Twitter publisher not fully implemented');
  }
}

export class InstagramPublisher extends SocialPublisher {
  async publishPost(post) {
    console.log('[INSTAGRAM] Would publish to Instagram');
    throw new Error('Instagram publisher not fully implemented');
  }
}

/**
 * Get segmented recipients based on targeting criteria
 * @param {Object} segment Segment criteria
 * @returns {Promise<Array>} Array of user objects
 */
export async function getSegmentedRecipients(segment) {
  try {
    const query = {};
    
    // Check-in status
    if (segment.status === 'checked') {
      // Find users who have checked-in bookings
      const bookings = await Booking.find({ status: 'checked-in' }).distinct('user');
      query._id = { $in: bookings };
    } else if (segment.status === 'not_checked') {
      // Find users who have bookings but haven't checked in
      const checkedInUsers = await Booking.find({ status: 'checked-in' }).distinct('user');
      const allBookingUsers = await Booking.find({}).distinct('user');
      const notCheckedInUsers = allBookingUsers.filter(u => !checkedInUsers.includes(u));
      query._id = { $in: notCheckedInUsers };
    }
    
    // Interests
    if (segment.interests && segment.interests.length > 0) {
      query.interests = { $in: segment.interests };
    }
    
    // Locations
    if (segment.locations && segment.locations.length > 0) {
      query.location = { $in: segment.locations };
    }
    
    // Age range
    if (segment.minAge !== undefined) {
      query.age = query.age || {};
      query.age.$gte = segment.minAge;
    }
    
    if (segment.maxAge !== undefined) {
      query.age = query.age || {};
      query.age.$lte = segment.maxAge;
    }
    
    // Fetch users matching the criteria
    return await User.find(query).select('_id name email').lean();
  } catch (error) {
    console.error('Error getting segmented recipients:', error);
    throw error;
  }
}

/**
 * Get count of segmented recipients based on targeting criteria
 * @param {Object} segment Segment criteria
 * @returns {Promise<Number>} Count of matching recipients
 */
export async function getSegmentedRecipientsCount(segment) {
  try {
    const recipients = await getSegmentedRecipients(segment);
    return recipients.length;
  } catch (error) {
    console.error('Error getting segmented recipients count:', error);
    return 0;
  }
}
