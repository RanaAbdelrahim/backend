// src/cron/marketingCron.js (ESM)
// import cron from 'node-cron';
import EmailCampaign from '../models/EmailCampaign.js';
import SocialPost from '../models/SocialPost.js';
import { getSegmentedRecipients } from './marketingHelpers.js';

/* =========================
   Provider fallbacks (safe no-ops)
   ========================= */
function createEmailProvider(providerName = 'mock') {
  // Replace with your real provider selector
  const base = {
    async getTrackingPixel(/* campaignId */) {
      // 1x1 transparent pixel; replace src with your tracking endpoint
      return `<img src="https://example.com/t.png" width="1" height="1" style="display:none" alt="">`;
    },
    getTrackingLink(campaignId, url) {
      // Replace with your tracking redirect endpoint
      const encoded = encodeURIComponent(url);
      return `https://example.com/click?cid=${campaignId}&url=${encoded}`;
    },
    async send({ from, to, subject, html /*, campaignId */ }) {
      // Simulate sending
      console.log(`[EMAIL:${providerName}] sending "${subject}" from ${from} to ${to.length} recipients`);
      return {
        sent: to.length,
        delivered: Math.floor(to.length * 0.95),
      };
    },
  };
  return base;
}

function createSocialProvider(platform = 'mock') {
  // Replace with your real provider selector (e.g., Facebook, X/Twitter, LinkedIn)
  return {
    async post({ content /*, imageUrl, linkUrl */ }) {
      console.log(`[SOCIAL:${platform}] posting: ${String(content).slice(0, 40)}…`);
      // Simulated stats
      return {
        stats: {
          impressions: Math.floor(Math.random() * 1000) + 500,
          clicks: Math.floor(Math.random() * 100) + 50,
          likes: Math.floor(Math.random() * 50) + 20,
          shares: Math.floor(Math.random() * 20) + 5,
          comments: Math.floor(Math.random() * 10) + 2,
        },
      };
    },
  };
}

/* =========================
   Utilities
   ========================= */
function ensureStats(obj) {
  if (!obj || typeof obj !== 'object') return { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0 };
  const def = { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0 };
  return { ...def, ...obj };
}

function ensurePostStats(obj) {
  if (!obj || typeof obj !== 'object') return { impressions: 0, clicks: 0, likes: 0, shares: 0, comments: 0 };
  const def = { impressions: 0, clicks: 0, likes: 0, shares: 0, comments: 0 };
  return { ...def, ...obj };
}

async function safeGetSegmentedRecipients(segment = {}) {
  if (typeof getSegmentedRecipientsHelper === 'function') {
    return await getSegmentedRecipientsHelper(segment);
  }

  // Fallback: all users (minimal fields)
  console.warn('[marketingCron] getSegmentedRecipients helper missing—falling back to all users');
  return await User.find({}).select('_id name email').lean();
}

/* =========================
   Email Campaign Processing
   ========================= */
async function processEmailCampaign(emailCampaign) {
  // Move to "Sending" under our control
  emailCampaign.status = 'Sending';
  emailCampaign.stats = ensureStats(emailCampaign.stats);
  await emailCampaign.save();

  try {
    // Resolve recipients
    const recipients = await safeGetSegmentedRecipients(emailCampaign.segment || {});
    const emailAddresses = (recipients || []).map((r) => r.email).filter(Boolean);

    // Provider
    const provider = createEmailProvider(emailCampaign.provider);

    // Build HTML (tracking if enabled)
    let htmlWithTracking = emailCampaign.templateHtml || emailCampaign.html || '';
    if (emailCampaign.trackingEnabled && htmlWithTracking) {
      // Open tracking pixel
      const trackingPixel = await provider.getTrackingPixel(emailCampaign._id);
      if (htmlWithTracking.includes('</body>')) {
        htmlWithTracking = htmlWithTracking.replace('</body>', `${trackingPixel}</body>`);
      } else {
        htmlWithTracking += trackingPixel;
      }

      // Replace <a href="..."> with tracking links (simple regex; avoid for malformed HTML)
      htmlWithTracking = htmlWithTracking.replace(
        /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/g,
        (match, url, rest) => {
          const trackingUrl = provider.getTrackingLink(emailCampaign._id, url);
          // Ensure spacing before ${rest} if present
          const space = rest?.startsWith(' ') ? '' : ' ';
          return `<a href="${trackingUrl}"${space}${rest}>`;
        }
      );
    }

    // Send
    const result = await provider.send({
      from: emailCampaign.fromEmail,
      to: emailAddresses,
      subject: emailCampaign.subject,
      html: htmlWithTracking || emailCampaign.text || '',
      campaignId: emailCampaign._id,
    });

    // Update campaign with results
    const sent = Number(result?.sent ?? emailAddresses.length);
    const delivered = Number(result?.delivered ?? emailAddresses.length);

    emailCampaign.stats.sent = (emailCampaign.stats.sent || 0) + sent;
    emailCampaign.stats.delivered = (emailCampaign.stats.delivered || 0) + delivered;
    emailCampaign.sentAt = new Date();
    emailCampaign.status = 'Sent';
    emailCampaign.recipients = {
      ...(emailCampaign.recipients || {}),
      count: emailAddresses.length,
      processed: emailAddresses.length,
    };

    await emailCampaign.save();

    // Create email events for each recipient (optional but useful for analytics)
    if (emailAddresses.length) {
      const userByEmail = new Map(recipients.map((r) => [r.email, r._id]));
      const events = emailAddresses.map((addr) => ({
        emailCampaignId: emailCampaign._id,
        attendeeId: userByEmail.get(addr) || null,
        event: 'sent',
        ts: new Date(),
      }));
      await EmailEvent.insertMany(events);
    }

    console.log(`Email campaign ${emailCampaign._id} sent to ${emailAddresses.length} recipients`);
  } catch (error) {
    console.error(`Error processing email campaign ${emailCampaign._id}:`, error);
    emailCampaign.status = 'Failed';
    emailCampaign.error = String(error?.message || error);
    await emailCampaign.save();
  }
}

/* =========================
   Social Post Processing
   ========================= */
async function processSocialPost(post) {
  try {
    const provider = createSocialProvider(post.platform);
    const result = await provider.post({
      content: post.content,
      imageUrl: post.imageUrl,
      linkUrl: post.linkUrl,
    });

    post.status = 'Posted';
    post.postedAt = new Date();
    post.stats = ensurePostStats(result?.stats);
    await post.save();

    console.log(`Social post ${post._id} published to ${post.platform}`);
  } catch (error) {
    console.error(`Error publishing social post ${post._id}:`, error);
    post.status = 'Failed';
    post.error = String(error?.message || error);
    await post.save();
  }
}

/* =========================
   Daily Stats Aggregation
   ========================= */
async function computeEmailStats(campaignId) {
  const emailCampaigns = await EmailCampaign.find({ campaignId });
  if (!emailCampaigns.length) {
    return { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0 };
  }
  const stats = { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0 };
  for (const c of emailCampaigns) {
    const s = ensureStats(c.stats);
    stats.sent += s.sent;
    stats.delivered += s.delivered;
    stats.opens += s.opens;
    stats.clicks += s.clicks;
    stats.bounces += s.bounces;
  }
  return stats;
}

async function computeSocialStats(campaignId) {
  const socialPosts = await SocialPost.find({ campaignId, status: 'Posted' });
  if (!socialPosts.length) {
    return { impressions: 0, clicks: 0, engagements: 0 };
  }
  const total = { impressions: 0, clicks: 0, engagements: 0 };
  for (const p of socialPosts) {
    const s = ensurePostStats(p.stats);
    total.impressions += s.impressions || 0;
    total.clicks += s.clicks || 0;
    total.engagements += (s.likes || 0) + (s.shares || 0) + (s.comments || 0);
  }
  return total;
}

async function updateMarketingStats() {
  try {
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const activeCampaigns = await MarketingCampaign.find({
      status: { $in: ['Active', 'Completed'] },
    });

    for (const campaign of activeCampaigns) {
      const [emailStats, socialStats] = await Promise.all([
        computeEmailStats(campaign._id),
        computeSocialStats(campaign._id),
      ]);

      const todayStart = new Date(`${todayStr}T00:00:00.000Z`);

      const [conversions, revenueAgg] = await Promise.all([
        Booking.countDocuments({
          sourceCampaign: campaign.utmCode,
          createdAt: { $gte: todayStart },
        }),
        Booking.aggregate([
          {
            $match: {
              sourceCampaign: campaign.utmCode,
              createdAt: { $gte: todayStart },
            },
          },
          { $group: { _id: null, total: { $sum: '$pricePaid' } } },
        ]),
      ]);

      const revenue =
        (Array.isArray(revenueAgg) && revenueAgg[0] && revenueAgg[0].total) || 0;

      const reach = Number(emailStats.delivered || 0) + Number(socialStats.impressions || 0);

      await MarketingStats.findOneAndUpdate(
        { campaignId: campaign._id, date: todayStr },
        {
          $set: {
            reach,
            conversions,
            revenue,
            email: emailStats,
            social: socialStats,
          },
        },
        { upsert: true, new: true }
      );

      console.log(`Updated marketing stats for campaign ${campaign._id} on ${todayStr}`);
    }
  } catch (error) {
    console.error('Error updating marketing stats:', error);
  }
}

/* =========================
   Cron Initializer
   ========================= */
export function initMarketingCron() {
  console.log('Initializing marketing scheduler (simplified version)...');

  // Instead of using node-cron, we'll use setInterval
  // Check for scheduled email campaigns every minute
  setInterval(async () => {
    try {
      const now = new Date();
      
      // Find email campaigns scheduled to be sent
      const emailCampaigns = await EmailCampaign.find({
        status: 'Queued',
        scheduledAt: { $lte: now }
      });
      
      if (emailCampaigns.length > 0) {
        console.log(`Processing ${emailCampaigns.length} scheduled email campaigns`);
        
        for (const campaign of emailCampaigns) {
          try {
            // Update status to Sending
            campaign.status = 'Sending';
            await campaign.save();
            
            // Get recipients based on segment criteria
            const recipients = await getSegmentedRecipients(campaign.segment);
            
            // For demo purposes, simulate sending
            console.log(`Sending email "${campaign.subject}" to ${recipients.length} recipients`);
            
            // Update stats
            campaign.status = 'Sent';
            campaign.sentAt = new Date();
            campaign.stats.sent = recipients.length;
            campaign.stats.delivered = Math.floor(recipients.length * 0.95); // 95% delivery rate
            campaign.recipients = {
              count: recipients.length,
              processed: recipients.length
            };
            
            await campaign.save();
            console.log(`Email campaign ${campaign._id} sent successfully`);
          } catch (err) {
            console.error(`Error processing email campaign ${campaign._id}:`, err);
            campaign.status = 'Failed';
            await campaign.save();
          }
        }
      }
    } catch (err) {
      console.error('Error in email campaign scheduler:', err);
    }
  }, 60000); // Check every minute
  
  // Check for scheduled social media posts every minute
  setInterval(async () => {
    try {
      const now = new Date();
      
      // Find social posts scheduled to be posted
      const socialPosts = await SocialPost.find({
        status: 'Queued',
        scheduledAt: { $lte: now }
      });
      
      if (socialPosts.length > 0) {
        console.log(`Processing ${socialPosts.length} scheduled social posts`);
        
        for (const post of socialPosts) {
          try {
            // For demo purposes, simulate posting to social media
            console.log(`Posting to ${post.platform}: "${post.content.substring(0, 30)}..."`);
            
            // Update post status
            post.status = 'Posted';
            post.postedAt = new Date();
            
            // Simulate engagement stats
            post.stats = {
              impressions: Math.floor(Math.random() * 1000) + 500,
              clicks: Math.floor(Math.random() * 100) + 50,
              likes: Math.floor(Math.random() * 50) + 20,
              shares: Math.floor(Math.random() * 20) + 5,
              comments: Math.floor(Math.random() * 10) + 2
            };
            
            await post.save();
            console.log(`Social post ${post._id} posted successfully`);
          } catch (err) {
            console.error(`Error processing social post ${post._id}:`, err);
            post.status = 'Failed';
            post.error = err.message;
            await post.save();
          }
        }
      }
    } catch (err) {
      console.error('Error in social post scheduler:', err);
    }
  }, 60000); // Check every minute
  
  console.log('Marketing scheduler initialized (using setInterval instead of cron)');
}

/* =========================
   (Optional) Named exports
   ========================= */
export {
  processEmailCampaign,
  processSocialPost,
  updateMarketingStats,
  computeEmailStats,
  computeSocialStats,
};
