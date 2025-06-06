export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: any;
  rowIndex?: number;
}

class SecureLogger {
  private logs: LogEntry[] = [];
  private logId = 0;

  private sanitizeData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitized = Array.isArray(data) ? [] : {};
    
    for (const [key, value] of Object.entries(data)) {
      // Remove sensitive fields
      if (this.isSensitiveField(key)) {
        (sanitized as any)[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        (sanitized as any)[key] = this.sanitizeData(value);
      } else {
        (sanitized as any)[key] = value;
      }
    }
    
    return sanitized;
  }

  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'apikey', 'api_key', 'token', 'managementtoken', 'management_token',
      'password', 'secret', 'authorization', 'auth', 'bearer',
      'apiKey', 'managementToken'
    ];
    
    return sensitiveFields.some(field => 
      fieldName.toLowerCase().includes(field.toLowerCase())
    );
  }

  log(level: LogEntry['level'], message: string, details?: any, rowIndex?: number): void {
    const sanitizedDetails = details ? this.sanitizeData(details) : undefined;
    
    this.logs.push({
      id: `log_${++this.logId}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      details: sanitizedDetails,
      rowIndex
    });

    // Keep only last 1000 logs to prevent memory issues
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }
  }

  info(message: string, details?: any, rowIndex?: number): void {
    this.log('info', message, details, rowIndex);
  }

  warning(message: string, details?: any, rowIndex?: number): void {
    this.log('warning', message, details, rowIndex);
  }

  error(message: string, details?: any, rowIndex?: number): void {
    this.log('error', message, details, rowIndex);
  }

  success(message: string, details?: any, rowIndex?: number): void {
    this.log('success', message, details, rowIndex);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
    this.logId = 0;
  }

  exportLogs(): string {
    const exportData = {
      exportTime: new Date().toISOString(),
      totalLogs: this.logs.length,
      logs: this.logs
    };
    
    return JSON.stringify(exportData, null, 2);
  }
}

// Create a singleton instance
export const secureLogger = new SecureLogger();
