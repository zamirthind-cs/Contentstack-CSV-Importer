
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ContentstackConfig, ContentstackField } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';
import { Upload } from 'lucide-react';

interface ConfigurationFormProps {
  onSubmit: (config: ContentstackConfig) => void;
}

const ConfigurationForm: React.FC<ConfigurationFormProps> = ({ onSubmit }) => {
  const [config, setConfig] = useState<ContentstackConfig>({
    apiKey: '',
    managementToken: '',
    host: 'api.contentstack.io',
    contentType: '',
    shouldPublish: false,
    environment: 'development'
  });
  const [schemaFile, setSchemaFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!config.apiKey || !config.managementToken || !config.contentType) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    onSubmit(config);
    toast({
      title: "Configuration Saved",
      description: "Your Contentstack configuration has been saved successfully"
    });
  };

  const handleInputChange = (field: keyof ContentstackConfig, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSchemaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json') {
      toast({
        title: "Invalid File Type",
        description: "Please upload a JSON file",
        variant: "destructive"
      });
      return;
    }

    setSchemaFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target?.result as string);
        
        // Extract schema from different possible structures
        let schema: ContentstackField[] = [];
        if (jsonData.content_type?.schema) {
          schema = jsonData.content_type.schema;
        } else if (jsonData.schema) {
          schema = jsonData.schema;
        } else if (Array.isArray(jsonData)) {
          schema = jsonData;
        }

        setConfig(prev => ({ ...prev, schema }));
        
        toast({
          title: "Schema Uploaded",
          description: `Successfully loaded ${schema.length} fields from schema`
        });
      } catch (error) {
        toast({
          title: "Invalid JSON",
          description: "Could not parse the uploaded JSON file",
          variant: "destructive"
        });
      }
    };
    
    reader.readAsText(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
            1
          </div>
          Contentstack Configuration
        </CardTitle>
        <CardDescription>
          Enter your Contentstack API credentials and content type information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <Input
                id="apiKey"
                type="text"
                value={config.apiKey}
                onChange={(e) => handleInputChange('apiKey', e.target.value)}
                placeholder="Enter your API key"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="managementToken">Management Token *</Label>
              <Input
                id="managementToken"
                type="password"
                value={config.managementToken}
                onChange={(e) => handleInputChange('managementToken', e.target.value)}
                placeholder="Enter your management token"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                type="text"
                value={config.host}
                onChange={(e) => handleInputChange('host', e.target.value)}
                placeholder="api.contentstack.io"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="contentType">Content Type UID *</Label>
              <Input
                id="contentType"
                type="text"
                value={config.contentType}
                onChange={(e) => handleInputChange('contentType', e.target.value)}
                placeholder="Enter content type UID"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="environment">Environment</Label>
              <Input
                id="environment"
                type="text"
                value={config.environment}
                onChange={(e) => handleInputChange('environment', e.target.value)}
                placeholder="development"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="shouldPublish"
                checked={config.shouldPublish}
                onCheckedChange={(checked) => handleInputChange('shouldPublish', checked)}
              />
              <Label htmlFor="shouldPublish">Auto-publish entries</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schema">Upload Content Type Schema (Optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="schema"
                type="file"
                accept=".json"
                onChange={handleSchemaUpload}
                className="cursor-pointer"
              />
              <Upload className="w-4 h-4 text-gray-500" />
            </div>
            <p className="text-sm text-gray-500">
              Upload your content type JSON schema to automatically populate field mappings
            </p>
            {config.schema && (
              <p className="text-sm text-green-600">
                ✓ Schema loaded with {config.schema.length} fields
              </p>
            )}
          </div>
          
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
            Save Configuration & Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ConfigurationForm;
