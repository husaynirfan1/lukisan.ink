import toast from 'react-hot-toast';

// Types for validation results
export interface EmailValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
  details?: {
    format: boolean;
    domain: boolean;
    mxRecord: boolean;
    disposable: boolean;
    rateLimit: boolean;
  };
}

// Rate limiting storage
interface RateLimitEntry {
  attempts: number;
  lastAttempt: number;
  blocked: boolean;
}

class EmailValidationService {
  private rateLimitMap = new Map<string, RateLimitEntry>();
  private readonly MAX_ATTEMPTS = 5;
  private readonly RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
  private readonly BLOCK_DURATION = 60 * 60 * 1000; // 1 hour

  // Common email typos and their corrections
  private readonly commonDomainTypos: Record<string, string> = {
    'gmail.co': 'gmail.com',
    'gmail.cm': 'gmail.com',
    'gmai.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'yahoo.co': 'yahoo.com',
    'yahoo.cm': 'yahoo.com',
    'yaho.com': 'yahoo.com',
    'hotmail.co': 'hotmail.com',
    'hotmail.cm': 'hotmail.com',
    'outlook.co': 'outlook.com',
    'outlook.cm': 'outlook.com',
    'icloud.co': 'icloud.com',
    'icloud.cm': 'icloud.com',
    'aol.co': 'aol.com',
    'aol.cm': 'aol.com',
  };

  // Known disposable email domains
  private readonly disposableDomains = new Set([
    '10minutemail.com',
    'tempmail.org',
    'guerrillamail.com',
    'mailinator.com',
    'yopmail.com',
    'temp-mail.org',
    'throwaway.email',
    'maildrop.cc',
    'sharklasers.com',
    'guerrillamailblock.com',
    'pokemail.net',
    'spam4.me',
    'bccto.me',
    'chacuo.net',
    'dispostable.com',
    'fakeinbox.com',
    'hide.biz.st',
    'mytrashmail.com',
    'nobulk.com',
    'sogetthis.com',
    'spambog.com',
    'spambog.de',
    'spambog.ru',
    'spamgourmet.com',
    'spamhole.com',
    'spamify.com',
    'spamthisplease.com',
    'superrito.com',
    'tempemail.com',
    'tempinbox.com',
    'trashmail.at',
    'trashmail.com',
    'trashmail.io',
    'trashmail.me',
    'trashmail.net',
    'wegwerfmail.de',
    'wegwerfmail.net',
    'wegwerfmail.org',
  ]);

  // Security logging
  private logSecurityEvent(event: string, email: string, ip?: string, details?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      email: this.sanitizeForLogging(email),
      ip: ip || 'unknown',
      details,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };

    // In production, send to your security monitoring service
    console.warn('[SECURITY] Email Validation Event:', logEntry);
    
    // Store in localStorage for demo purposes (in production, use proper logging service)
    try {
      const existingLogs = JSON.parse(localStorage.getItem('email_security_logs') || '[]');
      existingLogs.push(logEntry);
      
      // Keep only last 100 entries
      if (existingLogs.length > 100) {
        existingLogs.splice(0, existingLogs.length - 100);
      }
      
      localStorage.setItem('email_security_logs', JSON.stringify(existingLogs));
    } catch (error) {
      console.error('Failed to store security log:', error);
    }
  }

  // Sanitize email for logging (remove sensitive parts)
  private sanitizeForLogging(email: string): string {
    if (!email || !email.includes('@')) return '[invalid]';
    
    const [localPart, domain] = email.split('@');
    const sanitizedLocal = localPart.length > 2 
      ? localPart.substring(0, 2) + '*'.repeat(localPart.length - 2)
      : '*'.repeat(localPart.length);
    
    return `${sanitizedLocal}@${domain}`;
  }

  // Input sanitization
  private sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      throw new Error('Email must be a string');
    }

    // Remove dangerous characters and normalize
    return input
      .trim()
      .toLowerCase()
      .replace(/[<>'"&]/g, '') // Remove potential injection characters
      .replace(/\s+/g, '') // Remove all whitespace
      .substring(0, 254); // RFC 5321 limit
  }

  // Rate limiting check
  private checkRateLimit(clientId: string): { allowed: boolean; remainingAttempts: number } {
    const now = Date.now();
    const entry = this.rateLimitMap.get(clientId);

    if (!entry) {
      this.rateLimitMap.set(clientId, {
        attempts: 1,
        lastAttempt: now,
        blocked: false,
      });
      return { allowed: true, remainingAttempts: this.MAX_ATTEMPTS - 1 };
    }

    // Check if block period has expired
    if (entry.blocked && (now - entry.lastAttempt) > this.BLOCK_DURATION) {
      entry.blocked = false;
      entry.attempts = 1;
      entry.lastAttempt = now;
      return { allowed: true, remainingAttempts: this.MAX_ATTEMPTS - 1 };
    }

    // If currently blocked
    if (entry.blocked) {
      const remainingBlockTime = this.BLOCK_DURATION - (now - entry.lastAttempt);
      const remainingMinutes = Math.ceil(remainingBlockTime / (60 * 1000));
      
      this.logSecurityEvent('RATE_LIMIT_BLOCKED', '', clientId, {
        remainingMinutes,
        totalAttempts: entry.attempts,
      });
      
      return { allowed: false, remainingAttempts: 0 };
    }

    // Reset attempts if window has expired
    if ((now - entry.lastAttempt) > this.RATE_LIMIT_WINDOW) {
      entry.attempts = 1;
      entry.lastAttempt = now;
      return { allowed: true, remainingAttempts: this.MAX_ATTEMPTS - 1 };
    }

    // Increment attempts
    entry.attempts++;
    entry.lastAttempt = now;

    // Check if limit exceeded
    if (entry.attempts > this.MAX_ATTEMPTS) {
      entry.blocked = true;
      
      this.logSecurityEvent('RATE_LIMIT_EXCEEDED', '', clientId, {
        totalAttempts: entry.attempts,
        windowStart: new Date(now - this.RATE_LIMIT_WINDOW).toISOString(),
      });
      
      return { allowed: false, remainingAttempts: 0 };
    }

    return { 
      allowed: true, 
      remainingAttempts: this.MAX_ATTEMPTS - entry.attempts 
    };
  }

  // Format validation with international support
  private validateFormat(email: string): { isValid: boolean; suggestion?: string } {
    // Basic format check with international character support
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    // Extended regex for international characters (simplified)
    const internationalEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email) && !internationalEmailRegex.test(email)) {
      return { isValid: false };
    }

    // Check for common typos
    const [localPart, domain] = email.split('@');
    
    if (!localPart || !domain) {
      return { isValid: false };
    }

    // Check for typos in domain
    const suggestion = this.commonDomainTypos[domain];
    if (suggestion) {
      return {
        isValid: true,
        suggestion: `${localPart}@${suggestion}`,
      };
    }

    // Additional format validations
    if (localPart.length > 64) {
      return { isValid: false }; // RFC 5321 limit
    }

    if (domain.length > 253) {
      return { isValid: false }; // RFC 5321 limit
    }

    // Check for consecutive dots
    if (email.includes('..')) {
      return { isValid: false };
    }

    // Check for leading/trailing dots in local part
    if (localPart.startsWith('.') || localPart.endsWith('.')) {
      return { isValid: false };
    }

    return { isValid: true };
  }

  // Domain validation
  private async validateDomain(domain: string): Promise<{ isValid: boolean; hasMX: boolean }> {
    try {
      // Basic domain format check
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      
      if (!domainRegex.test(domain)) {
        return { isValid: false, hasMX: false };
      }

      // Check if domain has valid TLD
      const tldRegex = /\.[a-zA-Z]{2,}$/;
      if (!tldRegex.test(domain)) {
        return { isValid: false, hasMX: false };
      }

      // In a real implementation, you would check MX records via your backend
      // For demo purposes, we'll simulate this with known good domains
      const knownGoodDomains = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
        'icloud.com', 'aol.com', 'protonmail.com', 'zoho.com',
        'company.com', 'business.org', 'university.edu'
      ];

      const hasValidMX = knownGoodDomains.includes(domain) || 
                        domain.includes('.com') || 
                        domain.includes('.org') || 
                        domain.includes('.net') ||
                        domain.includes('.edu') ||
                        domain.includes('.gov');

      return { isValid: true, hasMX: hasValidMX };
    } catch (error) {
      console.error('Domain validation error:', error);
      return { isValid: false, hasMX: false };
    }
  }

  // Check for disposable email
  private isDisposableEmail(domain: string): boolean {
    return this.disposableDomains.has(domain.toLowerCase());
  }

  // Main validation function
  public async validateEmail(
    email: string, 
    clientId: string = 'default'
  ): Promise<EmailValidationResult> {
    const startTime = Date.now();
    
    try {
      // Input sanitization
      const sanitizedEmail = this.sanitizeInput(email);
      
      // Rate limiting check
      const rateLimitResult = this.checkRateLimit(clientId);
      if (!rateLimitResult.allowed) {
        const remainingTime = Math.ceil(this.BLOCK_DURATION / (60 * 1000));
        return {
          isValid: false,
          error: `Too many validation attempts. Please try again in ${remainingTime} minutes.`,
          details: {
            format: false,
            domain: false,
            mxRecord: false,
            disposable: false,
            rateLimit: false,
          },
        };
      }

      // Basic format validation
      const formatResult = this.validateFormat(sanitizedEmail);
      if (!formatResult.isValid) {
        this.logSecurityEvent('INVALID_FORMAT', sanitizedEmail, clientId);
        return {
          isValid: false,
          error: 'Please enter a valid email address format.',
          details: {
            format: false,
            domain: false,
            mxRecord: false,
            disposable: false,
            rateLimit: true,
          },
        };
      }

      const [localPart, domain] = sanitizedEmail.split('@');

      // Check for disposable email
      if (this.isDisposableEmail(domain)) {
        this.logSecurityEvent('DISPOSABLE_EMAIL', sanitizedEmail, clientId, { domain });
        return {
          isValid: false,
          error: 'Disposable email addresses are not allowed. Please use a permanent email address.',
          details: {
            format: true,
            domain: true,
            mxRecord: false,
            disposable: false,
            rateLimit: true,
          },
        };
      }

      // Domain validation
      const domainResult = await this.validateDomain(domain);
      if (!domainResult.isValid) {
        this.logSecurityEvent('INVALID_DOMAIN', sanitizedEmail, clientId, { domain });
        return {
          isValid: false,
          error: 'The email domain appears to be invalid.',
          details: {
            format: true,
            domain: false,
            mxRecord: false,
            disposable: true,
            rateLimit: true,
          },
        };
      }

      if (!domainResult.hasMX) {
        this.logSecurityEvent('NO_MX_RECORD', sanitizedEmail, clientId, { domain });
        return {
          isValid: false,
          error: 'The email domain does not appear to accept emails.',
          details: {
            format: true,
            domain: true,
            mxRecord: false,
            disposable: true,
            rateLimit: true,
          },
        };
      }

      // Log successful validation
      const validationTime = Date.now() - startTime;
      this.logSecurityEvent('VALIDATION_SUCCESS', sanitizedEmail, clientId, {
        validationTime,
        hasSuggestion: !!formatResult.suggestion,
      });

      // Return success with optional suggestion
      const result: EmailValidationResult = {
        isValid: true,
        details: {
          format: true,
          domain: true,
          mxRecord: true,
          disposable: true,
          rateLimit: true,
        },
      };

      if (formatResult.suggestion) {
        result.suggestion = formatResult.suggestion;
      }

      return result;

    } catch (error: any) {
      this.logSecurityEvent('VALIDATION_ERROR', email, clientId, {
        error: error.message,
        stack: error.stack,
      });

      return {
        isValid: false,
        error: 'An error occurred while validating the email address. Please try again.',
        details: {
          format: false,
          domain: false,
          mxRecord: false,
          disposable: false,
          rateLimit: true,
        },
      };
    }
  }

  // Utility method to get security logs (for admin/debugging)
  public getSecurityLogs(): any[] {
    try {
      return JSON.parse(localStorage.getItem('email_security_logs') || '[]');
    } catch {
      return [];
    }
  }

  // Clear rate limiting for a client (admin function)
  public clearRateLimit(clientId: string): void {
    this.rateLimitMap.delete(clientId);
    this.logSecurityEvent('RATE_LIMIT_CLEARED', '', clientId);
  }

  // Get rate limit status
  public getRateLimitStatus(clientId: string): {
    attempts: number;
    remainingAttempts: number;
    isBlocked: boolean;
    blockExpiresAt?: Date;
  } {
    const entry = this.rateLimitMap.get(clientId);
    
    if (!entry) {
      return {
        attempts: 0,
        remainingAttempts: this.MAX_ATTEMPTS,
        isBlocked: false,
      };
    }

    const remainingAttempts = Math.max(0, this.MAX_ATTEMPTS - entry.attempts);
    const blockExpiresAt = entry.blocked 
      ? new Date(entry.lastAttempt + this.BLOCK_DURATION)
      : undefined;

    return {
      attempts: entry.attempts,
      remainingAttempts,
      isBlocked: entry.blocked,
      blockExpiresAt,
    };
  }
}

// Export singleton instance
export const emailValidator = new EmailValidationService();

// Convenience function for React components
export const validateEmailAddress = async (
  email: string,
  clientId?: string
): Promise<EmailValidationResult> => {
  // Use IP address or session ID as client identifier in production
  const identifier = clientId || 
    (typeof window !== 'undefined' ? 
      window.localStorage.getItem('client_id') || 
      (() => {
        const id = Math.random().toString(36).substring(2, 15);
        window.localStorage.setItem('client_id', id);
        return id;
      })() 
      : 'server'
    );

  return emailValidator.validateEmail(email, identifier);
};

// React hook for email validation
export const useEmailValidation = () => {
  const [isValidating, setIsValidating] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<EmailValidationResult | null>(null);

  const validateEmail = async (email: string): Promise<EmailValidationResult> => {
    setIsValidating(true);
    
    try {
      const result = await validateEmailAddress(email);
      setLastResult(result);
      
      // Show user-friendly notifications
      if (!result.isValid && result.error) {
        toast.error(result.error);
      } else if (result.suggestion) {
        toast.success(`Did you mean: ${result.suggestion}?`, {
          duration: 5000,
          icon: '💡',
        });
      }
      
      return result;
    } finally {
      setIsValidating(false);
    }
  };

  const clearResult = () => setLastResult(null);

  return {
    validateEmail,
    isValidating,
    lastResult,
    clearResult,
    rateLimitStatus: emailValidator.getRateLimitStatus('default'),
  };
};

// Export types
export type { EmailValidationResult };