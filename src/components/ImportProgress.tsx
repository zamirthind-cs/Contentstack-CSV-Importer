
import React, { useState, useEffect } from 'react';
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import {
  ContentstackConfig,
  CsvData,
  FieldMapping,
  ImportResult
} from '@/types/contentstack';
import ImportControls from './ImportProgress/ImportControls';
import ImportSummary from './ImportProgress/ImportSummary';
import ImportLogsTable from './ImportProgress/ImportLogsTable';
import { useImportOperations } from './ImportProgress/useImportOperations';

interface ImportProgressProps {
  csvData: CsvData;
  config: ContentstackConfig;
  fieldMapping: FieldMapping[];
  onImportComplete: (results: ImportResult[]) => void;
  isImporting: boolean;
  setIsImporting: React.Dispatch<React.SetStateAction<boolean>>;
}

const ImportProgress: React.FC<ImportProgressProps> = ({
  csvData,
  config,
  fieldMapping,
  onImportComplete,
  isImporting,
  setIsImporting
}) => {
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [filterText, setFilterText] = useState('');

  const { logs, setLogs, startImport } = useImportOperations(
    csvData,
    config,
    fieldMapping,
    onImportComplete,
    setIsImporting
  );

  const totalRows = csvData.rows.length;
  const mappedFieldsCount = fieldMapping.filter(mapping => mapping.contentstackField !== 'skip').length;

  const filteredLogs = logs.filter(log =>
    log.message.toLowerCase().includes(filterText.toLowerCase()) ||
    (log.data && log.data.toLowerCase().includes(filterText.toLowerCase()))
  );

  useEffect(() => {
    if (results.length > 0 && results.every(r => r.success)) {
      const publishedCount = results.filter(r => r.published).length;
      toast({
        title: "Import Completed Successfully! ✅",
        description: `All ${results.length} entries were processed successfully${publishedCount > 0 ? ` and ${publishedCount} were published` : ''}.`,
      });
    } else if (results.length > 0 && results.some(r => !r.success)) {
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      toast({
        title: "Import Completed with Issues ⚠️",
        description: `${successCount} entries succeeded, ${errorCount} failed. Check the logs for details.`,
        variant: "destructive",
      });
    }
  }, [results]);

  return (
    <div className="space-y-4">
      <ImportControls
        isImporting={isImporting}
        isPublishing={isPublishing}
        logsLength={logs.length}
        filterText={filterText}
        onFilterChange={setFilterText}
        onClearLogs={() => setLogs([])}
        onStartImport={startImport}
      />

      <div className="space-y-2">
        <Progress value={progress} className="h-3" />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            {isImporting
              ? `Importing data... ${Math.round(progress)}%`
              : isPublishing
              ? 'Publishing entries...'
              : 'Ready to import data.'}
          </span>
          <span>
            Total CSV rows: {totalRows} | Mapped fields: {mappedFieldsCount}
          </span>
        </div>
      </div>

      <ImportSummary 
        logs={filteredLogs} 
        totalRows={totalRows} 
        mappedFieldsCount={mappedFieldsCount} 
      />

      <ImportLogsTable logs={filteredLogs} />
    </div>
  );
};

export default ImportProgress;
