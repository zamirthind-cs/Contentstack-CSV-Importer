
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Trash2, Eye, EyeOff } from 'lucide-react';
import { LogEntry, secureLogger } from '@/utils/secureLogger';

const LogsViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>(secureLogger.getLogs());
  const [showDetails, setShowDetails] = useState<{ [key: string]: boolean }>({});

  const refreshLogs = () => {
    setLogs(secureLogger.getLogs());
  };

  const clearLogs = () => {
    secureLogger.clearLogs();
    setLogs([]);
    setShowDetails({});
  };

  const downloadLogs = () => {
    const logsData = secureLogger.exportLogs();
    const blob = new Blob([logsData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleDetails = (logId: string) => {
    setShowDetails(prev => ({
      ...prev,
      [logId]: !prev[logId]
    }));
  };

  const getLevelBadge = (level: LogEntry['level']) => {
    const variants = {
      info: 'default',
      success: 'default',
      warning: 'secondary',
      error: 'destructive'
    } as const;

    const colors = {
      info: 'bg-blue-600',
      success: 'bg-green-600',
      warning: 'bg-yellow-600',
      error: ''
    };

    return (
      <Badge 
        variant={variants[level]} 
        className={level !== 'error' ? colors[level] : ''}
      >
        {level.toUpperCase()}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Import Logs</span>
          <div className="flex gap-2">
            <Button onClick={refreshLogs} variant="outline" size="sm">
              Refresh
            </Button>
            <Button onClick={downloadLogs} variant="outline" size="sm" disabled={logs.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button onClick={clearLogs} variant="destructive" size="sm" disabled={logs.length === 0}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          Secure session logs - sensitive data is automatically redacted
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <Alert>
            <AlertDescription>
              No logs available. Logs will appear here during import operations.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              Total logs: {logs.length} | 
              Security: All API keys and tokens are automatically redacted
            </div>
            
            <div className="max-h-96 overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Row</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <TableRow>
                        <TableCell className="text-xs">
                          {formatTimestamp(log.timestamp)}
                        </TableCell>
                        <TableCell>
                          {getLevelBadge(log.level)}
                        </TableCell>
                        <TableCell>
                          {log.rowIndex !== undefined ? log.rowIndex + 1 : '-'}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="truncate" title={log.message}>
                            {log.message}
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.details && (
                            <Button
                              onClick={() => toggleDetails(log.id)}
                              variant="ghost"
                              size="sm"
                            >
                              {showDetails[log.id] ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {showDetails[log.id] && log.details && (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <div className="bg-gray-50 p-3 rounded text-xs">
                              <pre className="whitespace-pre-wrap">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LogsViewer;
