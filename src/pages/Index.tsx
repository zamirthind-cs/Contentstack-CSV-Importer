
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConfigurationForm from '@/components/ConfigurationForm';
import CsvUpload from '@/components/CsvUpload';
import FieldMapping from '@/components/FieldMapping';
import ImportProgress from '@/components/ImportProgress';
import { ContentstackConfig, CsvData, FieldMapping as FieldMappingType, ImportResult } from '@/types/contentstack';

const Index = () => {
  const [activeTab, setActiveTab] = useState('config');
  const [config, setConfig] = useState<ContentstackConfig | null>(null);
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMappingType[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const handleConfigSubmit = (newConfig: ContentstackConfig) => {
    setConfig(newConfig);
    setActiveTab('upload');
  };

  const handleCsvUpload = (data: CsvData) => {
    setCsvData(data);
    setActiveTab('mapping');
  };

  const handleMappingComplete = (mapping: FieldMappingType[]) => {
    setFieldMapping(mapping);
    setActiveTab('import');
  };

  const handleImportComplete = (results: ImportResult[]) => {
    setImportResults(results);
    setIsImporting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">
            Contentstack CSV Importer
          </h1>
          <p className="text-lg text-slate-600">
            Bulk import data from CSV files to Contentstack with field mapping and reference support
          </p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
            <CardTitle className="text-2xl">Import Wizard</CardTitle>
            <CardDescription className="text-blue-100">
              Follow the steps below to configure and execute your CSV import
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-8">
                <TabsTrigger value="config" className="text-sm">Configuration</TabsTrigger>
                <TabsTrigger value="upload" disabled={!config} className="text-sm">Upload CSV</TabsTrigger>
                <TabsTrigger value="mapping" disabled={!csvData} className="text-sm">Field Mapping</TabsTrigger>
                <TabsTrigger value="import" disabled={fieldMapping.length === 0} className="text-sm">Import</TabsTrigger>
              </TabsList>

              <TabsContent value="config" className="space-y-6">
                <ConfigurationForm onSubmit={handleConfigSubmit} />
              </TabsContent>

              <TabsContent value="upload" className="space-y-6">
                <CsvUpload onUpload={handleCsvUpload} />
              </TabsContent>

              <TabsContent value="mapping" className="space-y-6">
                {csvData && config && (
                  <FieldMapping
                    csvHeaders={csvData.headers}
                    config={config}
                    onMappingComplete={handleMappingComplete}
                  />
                )}
              </TabsContent>

              <TabsContent value="import" className="space-y-6">
                {csvData && config && fieldMapping.length > 0 && (
                  <ImportProgress
                    csvData={csvData}
                    config={config}
                    fieldMapping={fieldMapping}
                    onImportComplete={handleImportComplete}
                    isImporting={isImporting}
                    setIsImporting={setIsImporting}
                  />
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
