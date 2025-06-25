
import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Globe } from "lucide-react";

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'published';
  data?: string;
  rowIndex?: number;
}

interface ImportSummaryProps {
  logs: LogEntry[];
  totalRows: number;
  mappedFieldsCount: number;
}

const ImportSummary: React.FC<ImportSummaryProps> = ({ logs, totalRows, mappedFieldsCount }) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Ready to import data.</span>
        <span>
          Total CSV rows: {totalRows} | Mapped fields: {mappedFieldsCount}
        </span>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg border">
        <div className="flex justify-center space-x-6 text-sm">
          <span className="flex items-center">
            <CheckCircle className="h-4 w-4 text-green-600 mr-2" /> 
            Success: {logs.filter(l => l.type === 'success').length}
          </span>
          <span className="flex items-center">
            <Globe className="h-4 w-4 text-blue-600 mr-2" /> 
            Published: {logs.filter(l => l.type === 'published').length}
          </span>
          <span className="flex items-center">
            <XCircle className="h-4 w-4 text-red-600 mr-2" /> 
            Errors: {logs.filter(l => l.type === 'error').length}
          </span>
          <span className="flex items-center">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" /> 
            Warnings: {logs.filter(l => l.type === 'warning').length}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ImportSummary;
