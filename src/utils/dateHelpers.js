// Add week calculation helper to Date prototype
/**
 * Get week number of the year for a date
 */
Date.prototype.getWeek = function() {
  const date = new Date(this.getTime());
  date.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  // January 4 is always in week 1
  const week1 = new Date(date.getFullYear(), 0, 4);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

/**
 * Format date as YYYY-MM-DD
 */
Date.prototype.toDateString = function() {
  return this.toISOString().split('T')[0];
};

/**
 * Add days to a date
 */
Date.prototype.addDays = function(days) {
  const date = new Date(this.valueOf());
  date.setDate(date.getDate() + days);
  return date;
};

/**
 * Check if date is today
 */
Date.prototype.isToday = function() {
  const today = new Date();
  return this.getDate() === today.getDate() &&
    this.getMonth() === today.getMonth() &&
    this.getFullYear() === today.getFullYear();
};

export default {};
