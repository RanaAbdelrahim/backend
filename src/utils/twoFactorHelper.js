import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Generate a new TOTP secret and QR code URL
 */
export function generateTOTP(accountName = 'EventX', issuer = 'EventX') {
  // Generate a new secret
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${issuer}:${accountName}`,
    issuer
  });
  
  return {
    tempSecret: secret.base32,
    otpauthUrl: secret.otpauth_url
  };
}

/**
 * Generate a QR code data URL from an otpauth URL
 */
export async function generateQRCode(otpauthUrl) {
  try {
    const dataUrl = await QRCode.toDataURL(otpauthUrl);
    return dataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

/**
 * Verify a TOTP token against a secret
 */
export function verifyTOTP(token, secret) {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1 // Allow 1 time step drift (30 seconds before/after)
  });
}

/**
 * Generate recovery codes
 */
export function generateRecoveryCodes(count = 10) {
  const codes = [];
  
  for (let i = 0; i < count; i++) {
    // Generate a random 10-character code with groups separated by hyphens
    const code = crypto.randomBytes(15)
      .toString('hex')
      .slice(0, 20)
      .toUpperCase()
      .replace(/(.{4})/g, '$1-')
      .slice(0, -1); // Remove trailing hyphen
    
    codes.push(code);
  }
  
  return codes;
}

/**
 * Hash recovery codes for storage
 */
export async function hashRecoveryCodes(codes) {
  const hashedCodes = [];
  
  for (const code of codes) {
    const hashedCode = await bcrypt.hash(code, 10);
    hashedCodes.push(hashedCode);
  }
  
  return hashedCodes;
}

/**
 * Verify a recovery code against the hashed codes
 */
export async function verifyRecoveryCode(code, hashedCodes) {
  for (let i = 0; i < hashedCodes.length; i++) {
    const isValid = await bcrypt.compare(code, hashedCodes[i]);
    
    if (isValid) {
      return { valid: true, index: i };
    }
  }
  
  return { valid: false };
}
