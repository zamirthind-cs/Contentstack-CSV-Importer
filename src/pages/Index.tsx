
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConfigurationForm from '@/components/ConfigurationForm';
import CsvUpload from '@/components/CsvUpload';
import FieldMapping from '@/components/FieldMapping';
import ImportProgress from '@/components/ImportProgress';
import { ContentstackConfig, CsvData, FieldMapping as FieldMappingType, ImportResult } from '@/types/contentstack';

const STORAGE_KEYS = {
  CONFIG: 'contentstack-config',
  CSV_DATA: 'contentstack-csv-data',
  FIELD_MAPPING: 'contentstack-field-mapping',
  ACTIVE_TAB: 'contentstack-active-tab',
  SCHEMA_FILE: 'contentstack-schema-file'
};

const Index = () => {
  const [activeTab, setActiveTab] = useState('config');
  const [config, setConfig] = useState<ContentstackConfig | null>(null);
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMappingType[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [persistedSchemaFile, setPersistedSchemaFile] = useState<{ name: string; content: string } | null>(null);

  // Load persisted data on component mount
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
      const savedCsvData = localStorage.getItem(STORAGE_KEYS.CSV_DATA);
      const savedFieldMapping = localStorage.getItem(STORAGE_KEYS.FIELD_MAPPING);
      const savedActiveTab = localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);
      const savedSchemaFile = localStorage.getItem(STORAGE_KEYS.SCHEMA_FILE);

      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        // Clear the management token for security
        parsedConfig.managementToken = '';
        setConfig(parsedConfig);
      }

      if (savedCsvData) {
        setCsvData(JSON.parse(savedCsvData));
      }

      if (savedFieldMapping) {
        setFieldMapping(JSON.parse(savedFieldMapping));
      }

      if (savedActiveTab) {
        setActiveTab(savedActiveTab);
      }

      if (savedSchemaFile) {
        setPersistedSchemaFile(JSON.parse(savedSchemaFile));
      }
    } catch (error) {
      console.error('Error loading persisted data:', error);
    }
  }, []);

  // Persist data whenever it changes
  useEffect(() => {
    if (config) {
      const configToSave = { ...config };
      // Don't persist the management token for security
      configToSave.managementToken = '';
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(configToSave));
    }
  }, [config]);

  useEffect(() => {
    if (csvData) {
      localStorage.setItem(STORAGE_KEYS.CSV_DATA, JSON.stringify(csvData));
    }
  }, [csvData]);

  useEffect(() => {
    if (fieldMapping.length > 0) {
      localStorage.setItem(STORAGE_KEYS.FIELD_MAPPING, JSON.stringify(fieldMapping));
    }
  }, [fieldMapping]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (persistedSchemaFile) {
      localStorage.setItem(STORAGE_KEYS.SCHEMA_FILE, JSON.stringify(persistedSchemaFile));
    }
  }, [persistedSchemaFile]);

  const handleConfigSubmit = (newConfig: ContentstackConfig) => {
    setConfig(newConfig);
    setActiveTab('upload');
  };

  const handleSchemaFileChange = (schemaFile: { name: string; content: string } | null) => {
    setPersistedSchemaFile(schemaFile);
  };

  const handleCsvUpload = (data: CsvData) => {
    setCsvData(data);
    // Clear field mapping when new CSV is uploaded to force re-mapping
    setFieldMapping([]);
    localStorage.removeItem(STORAGE_KEYS.FIELD_MAPPING);
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

  const clearPersistedData = () => {
    localStorage.removeItem(STORAGE_KEYS.CONFIG);
    localStorage.removeItem(STORAGE_KEYS.CSV_DATA);
    localStorage.removeItem(STORAGE_KEYS.FIELD_MAPPING);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TAB);
    localStorage.removeItem(STORAGE_KEYS.SCHEMA_FILE);
    setConfig(null);
    setCsvData(null);
    setFieldMapping([]);
    setPersistedSchemaFile(null);
    setActiveTab('config');
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
                <ConfigurationForm 
                  onSubmit={handleConfigSubmit} 
                  initialConfig={config}
                  onClearAll={clearPersistedData}
                  persistedSchemaFile={persistedSchemaFile}
                  onSchemaFileChange={handleSchemaFileChange}
                />
              </TabsContent>

              <TabsContent value="upload" className="space-y-6">
                <CsvUpload onUpload={handleCsvUpload} initialData={csvData} />
              </TabsContent>

              <TabsContent value="mapping" className="space-y-6">
                {csvData && config && (
                  <FieldMapping
                    csvHeaders={csvData.headers}
                    config={config}
                    onMappingComplete={handleMappingComplete}
                    initialMapping={fieldMapping}
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
