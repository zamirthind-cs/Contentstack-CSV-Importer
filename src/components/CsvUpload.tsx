
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

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Handle escaped quotes
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    // Add the last field
    result.push(current.trim());
    return result;
  };

  const parseCsv = (csvText: string): CsvData => {
    console.log('🔍 Starting CSV parsing...');
    console.log('Raw CSV text length:', csvText.length);
    
    // Split by lines but be careful about quoted content
    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;
    
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
        currentLine += char;
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (currentLine.trim()) {
          lines.push(currentLine.trim());
        }
        currentLine = '';
        // Skip \r\n combinations
        if (char === '\r' && csvText[i + 1] === '\n') {
          i++;
        }
      } else {
        currentLine += char;
      }
    }
    
    // Add the last line if it exists
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    
    console.log(`📋 Found ${lines.length} lines after parsing`);
    lines.forEach((line, index) => {
      console.log(`Line ${index + 1}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
    });
    
    if (lines.length === 0) {
      throw new Error('No valid lines found in CSV');
    }
    
    // Parse headers
    const headers = parseCsvLine(lines[0]);
    console.log('📊 Headers:', headers);
    
    // Parse data rows
    const rows = lines.slice(1).map((line, index) => {
      console.log(`🔄 Parsing row ${index + 1}:`, line.substring(0, 100) + (line.length > 100 ? '...' : ''));
      
      const values = parseCsvLine(line);
      console.log(`   Values count: ${values.length}, Expected: ${headers.length}`);
      
      const row: Record<string, string> = {};
      
      headers.forEach((header, headerIndex) => {
        row[header] = values[headerIndex] || '';
      });
      
      console.log(`   Row data:`, Object.keys(row).reduce((acc, key) => {
        acc[key] = row[key].substring(0, 50) + (row[key].length > 50 ? '...' : '');
        return acc;
      }, {} as Record<string, string>));
      
      return row;
    });

    console.log(`✅ CSV parsing complete: ${rows.length} data rows found`);
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
        console.error('CSV parsing error:', error);
        toast({
          title: "Error Parsing CSV",
          description: "Please check your CSV format and try again. Make sure text fields with commas or line breaks are properly quoted.",
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
          Upload your CSV file containing the data to import into Contentstack. Make sure text fields with commas or line breaks are properly quoted.
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
              Supported format: CSV with comma-separated values. Text fields containing commas or line breaks should be enclosed in quotes.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CsvUpload;
