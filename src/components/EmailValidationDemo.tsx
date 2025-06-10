import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Loader2, 
  Shield,
  Clock,
  Globe,
  Trash2,
  Eye,
  RefreshCw
} from 'lucide-react';
import { validateEmailAddress, emailValidator, EmailValidationResult } from '../lib/emailValidation';
import toast from 'react-hot-toast';

export const EmailValidationDemo: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<EmailValidationResult | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const handleValidation = async () => {
    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setIsValidating(true);
    setResult(null);

    try {
      const validationResult = await validateEmailAddress(email);
      setResult(validationResult);

      if (validationResult.isValid) {
        if (validationResult.suggestion) {
          toast.success(`Valid email! Suggestion: ${validationResult.suggestion}`, {
            duration: 5000,
            icon: '💡',
          });
        } else {
          toast.success('Email is valid!');
        }
      } else {
        toast.error(validationResult.error || 'Email validation failed');
      }
    } catch (error: any) {
      toast.error('Validation error: ' + error.message);
    } finally {
      setIsValidating(false);
    }
  };

  const loadSecurityLogs = () => {
    const securityLogs = emailValidator.getSecurityLogs();
    setLogs(securityLogs);
    setShowLogs(true);
  };

  const clearLogs = () => {
    localStorage.removeItem('email_security_logs');
    setLogs([]);
    toast.success('Security logs cleared');
  };

  const testEmails = [
    'user@gmail.com',
    'test@gmail.co', // Typo
    'user+tag@domain.com', // Plus addressing
    'user@10minutemail.com', // Disposable
    'invalid-email', // Invalid format
    'user@nonexistent-domain-12345.com', // Invalid domain
    'user@subdomain.company.com', // Subdomain
    'üser@domain.com', // International characters
  ];

  const getRateLimitStatus = () => {
    return emailValidator.getRateLimitStatus('default');
  };

  const rateLimitStatus = getRateLimitStatus();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="bg-white/80 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-gray-200/50">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Email Validation System</h1>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Comprehensive email validation with security features, typo detection, 
            domain verification, and disposable email protection.
          </p>
        </div>

        {/* Rate Limit Status */}
        <div className="mb-6 p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-gray-600" />
              <span className="font-medium text-gray-900">Rate Limit Status</span>
            </div>
            <div className="text-sm text-gray-600">
              {rateLimitStatus.isBlocked ? (
                <span className="text-red-600 font-medium">
                  Blocked until {rateLimitStatus.blockExpiresAt?.toLocaleTimeString()}
                </span>
              ) : (
                <span>
                  {rateLimitStatus.remainingAttempts} attempts remaining
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Email Input */}
        <div className="mb-6">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleValidation()}
              placeholder="Enter email address to validate"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={isValidating || rateLimitStatus.isBlocked}
            />
          </div>
        </div>

        {/* Validate Button */}
        <div className="mb-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleValidation}
            disabled={isValidating || rateLimitStatus.isBlocked}
            className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isValidating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Validating...</span>
              </>
            ) : (
              <>
                <Shield className="h-5 w-5" />
                <span>Validate Email</span>
              </>
            )}
          </motion.button>
        </div>

        {/* Test Emails */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Test with sample emails:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {testEmails.map((testEmail, index) => (
              <button
                key={index}
                onClick={() => setEmail(testEmail)}
                className="text-left px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                disabled={isValidating}
              >
                {testEmail}
              </button>
            ))}
          </div>
        </div>

        {/* Validation Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mb-6 p-6 rounded-xl border-2 ${
                result.isValid 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-start space-x-3">
                {result.isValid ? (
                  <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                
                <div className="flex-1">
                  <h3 className={`font-semibold ${
                    result.isValid ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {result.isValid ? 'Email is Valid' : 'Email is Invalid'}
                  </h3>
                  
                  {result.error && (
                    <p className="text-red-700 mt-1">{result.error}</p>
                  )}
                  
                  {result.suggestion && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-blue-600" />
                        <span className="text-blue-800 font-medium">Suggestion:</span>
                      </div>
                      <p className="text-blue-700 mt-1">Did you mean: <strong>{result.suggestion}</strong>?</p>
                    </div>
                  )}
                  
                  {/* Validation Details */}
                  {result.details && (
                    <div className="mt-4">
                      <h4 className="font-medium text-gray-800 mb-2">Validation Details:</h4>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {Object.entries(result.details).map(([key, value]) => (
                          <div
                            key={key}
                            className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${
                              value 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {value ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Security Features */}
        <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Security Features</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Input sanitization & injection prevention</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Rate limiting (5 attempts per 15 minutes)</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Disposable email detection</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Domain & MX record validation</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Typo detection & suggestions</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Security event logging</span>
            </div>
          </div>
        </div>

        {/* Security Logs */}
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
              <Eye className="h-5 w-5" />
              <span>Security Monitoring</span>
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={loadSecurityLogs}
                className="flex items-center space-x-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Load Logs</span>
              </button>
              <button
                onClick={clearLogs}
                className="flex items-center space-x-1 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {showLogs && (
            <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-gray-500 text-sm">No security logs found</p>
              ) : (
                <div className="space-y-2">
                  {logs.slice(-10).reverse().map((log, index) => (
                    <div key={index} className="text-xs bg-white p-2 rounded border">
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${
                          log.event.includes('SUCCESS') ? 'text-green-600' :
                          log.event.includes('ERROR') || log.event.includes('INVALID') ? 'text-red-600' :
                          'text-orange-600'
                        }`}>
                          {log.event}
                        </span>
                        <span className="text-gray-500">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-gray-600 mt-1">
                        Email: {log.email} | IP: {log.ip}
                      </div>
                      {log.details && (
                        <div className="text-gray-500 mt-1">
                          Details: {JSON.stringify(log.details)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};