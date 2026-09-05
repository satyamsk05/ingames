const crypto = require('crypto');

class PaymentProviderAdapter {
  /**
   * Cryptographically verify payment webhook signature
   * Supports HMAC-SHA256 signature verification (Razorpay, Cashfree, Standard Webhooks)
   */
  static verifySignature({ rawBody, body, headers }) {
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
    
    // In production, PAYMENT_WEBHOOK_SECRET must be set and signatures strictly verified
    if (process.env.NODE_ENV === 'production' && (!webhookSecret || webhookSecret.length < 16)) {
      throw new Error('PAYMENT_WEBHOOK_SECRET must be configured in production (min 16 chars)');
    }

    const signatureHeader = headers['x-razorpay-signature'] || 
                            headers['x-cashfree-signature'] || 
                            headers['x-provider-signature'] ||
                            headers['x-webhook-signature'] ||
                            body?.signature;

    if (!signatureHeader || typeof signatureHeader !== 'string') {
      return false;
    }

    // If no secret configured in dev mode, fail safely unless explicit test secret set
    if (!webhookSecret) {
      return false;
    }

    try {
      // 1. Determine payload string to hash
      const payload = typeof rawBody === 'string' 
        ? rawBody 
        : (body?.orderId ? `${body.orderId}|${body.providerTxId || ''}` : JSON.stringify(body));

      // 2. Compute HMAC-SHA256 digest
      const expectedHmacHex = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const expectedHmacBase64 = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('base64');

      // 3. Constant-time comparison to prevent timing attacks
      const sigBuf = Buffer.from(signatureHeader);
      const hexBuf = Buffer.from(expectedHmacHex);
      const b64Buf = Buffer.from(expectedHmacBase64);

      const matchesHex = sigBuf.length === hexBuf.length && crypto.timingSafeEqual(sigBuf, hexBuf);
      const matchesB64 = sigBuf.length === b64Buf.length && crypto.timingSafeEqual(sigBuf, b64Buf);

      return matchesHex || matchesB64;
    } catch (_) {
      return false;
    }
  }
}

module.exports = PaymentProviderAdapter;
