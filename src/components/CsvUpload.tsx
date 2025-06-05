
import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CsvData } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';
import { FileUp } from 'lucide-react';

interface CsvUploadProps {
  onUpload: (data: CsvData) => void;
}

const CsvUpload: React.FC<CsvUploadProps> = ({ onUpload }) => {
  const { toast } = useToast();

  const parseCsv = (csvText: string): CsvData => {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(header => header.trim().replace(/"/g, ''));
    
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(value => value.trim().replace(/"/g, ''));
      const row: Record<string, string> = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      return row;
    });

    return { headers, rows };
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a CSV file",
        variant: "destructive"
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string;
        const csvData = parseCsv(csvText);
        
        if (csvData.headers.length === 0) {
          throw new Error('No headers found in CSV');
        }

        onUpload(csvData);
        toast({
          title: "CSV Uploaded Successfully",
          description: `Found ${csvData.rows.length} rows with ${csvData.headers.length} columns`
        });
      } catch (error) {
        toast({
          title: "Error Parsing CSV",
          description: "Please check your CSV format and try again",
          variant: "destructive"
        });
      }
    };

    reader.readAsText(file);
  }, [onUpload, toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
            2
          </div>
          Upload CSV File
        </CardTitle>
        <CardDescription>
          Upload your CSV file containing the data to import into Contentstack
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors">
          <FileUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-700">Upload your CSV file</h3>
              <p className="text-gray-500">
                Select a CSV file with headers in the first row
              </p>
            </div>
            <div className="relative">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button className="bg-blue-600 hover:bg-blue-700">
                Choose CSV File
              </Button>
            </div>
            <p className="text-sm text-gray-400">
              Supported format: CSV with comma-separated values
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CsvUpload;
