
import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImportControlsProps {
  isImporting: boolean;
  isPublishing: boolean;
  logsLength: number;
  filterText: string;
  onFilterChange: (value: string) => void;
  onClearLogs: () => void;
  onStartImport: () => void;
}

const ImportControls: React.FC<ImportControlsProps> = ({
  isImporting,
  isPublishing,
  logsLength,
  filterText,
  onFilterChange,
  onClearLogs,
  onStartImport
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Import Progress</h2>
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            onClick={onClearLogs}
            disabled={logsLength === 0}
          >
            Clear Logs
          </Button>
          <Button
            disabled={isImporting || isPublishing}
            onClick={onStartImport}
          >
            {isImporting ? 'Importing...' : isPublishing ? 'Publishing...' : 'Start Import'}
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="log-filter">Filter Logs:</Label>
        <Input
          type="text"
          id="log-filter"
          placeholder="Filter by message or data"
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          className="w-full"
        />
      </div>
    </div>
  );
};

export default ImportControls;
