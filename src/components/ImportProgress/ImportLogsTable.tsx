
import React from 'react';
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertTriangle, Info, Globe } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'published';
  data?: string;
  rowIndex?: number;
}

interface ImportLogsTableProps {
  logs: LogEntry[];
}

const ImportLogsTable: React.FC<ImportLogsTableProps> = ({ logs }) => {
  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'published':
        return <Globe className="h-4 w-4 text-blue-600" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getLogBadge = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">SUCCESS</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">ERROR</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">WARNING</Badge>;
      case 'published':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">PUBLISHED</Badge>;
      default:
        return <Badge variant="secondary">INFO</Badge>;
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableCaption>Import Logs - {logs.length} entries</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Row</TableHead>
            <TableHead className="w-[100px]">Time</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead>Message</TableHead>
            <TableHead className="w-[150px]">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log, index) => (
            <TableRow key={index} className={log.type === 'error' ? 'bg-red-50' : log.type === 'success' ? 'bg-green-50' : log.type === 'published' ? 'bg-blue-50' : log.type === 'warning' ? 'bg-yellow-50' : ''}>
              <TableCell className="font-medium">
                {log.rowIndex !== undefined ? log.rowIndex + 1 : '-'}
              </TableCell>
              <TableCell className="text-xs">{log.timestamp}</TableCell>
              <TableCell>
                <div className="flex items-center space-x-1">
                  {getLogIcon(log.type)}
                  {getLogBadge(log.type)}
                </div>
              </TableCell>
              <TableCell className="max-w-md">
                <div className="truncate" title={log.message}>
                  {log.message}
                </div>
              </TableCell>
              <TableCell>
                {log.data && (
                  <Textarea
                    value={log.data}
                    readOnly
                    className="w-full h-20 resize-none text-xs bg-gray-50"
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ImportLogsTable;
