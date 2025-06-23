import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContentstackConfig, ContentstackField } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';
import { Upload, RotateCcw, Trash2, CheckCircle } from 'lucide-react';

interface ConfigurationFormProps {
  onSubmit: (config: ContentstackConfig) => void;
  initialConfig?: ContentstackConfig | null;
  onClearAll?: () => void;
  persistedSchemaFile?: { name: string; content: string } | null;
  onSchemaFileChange?: (schemaFile: { name: string; content: string } | null) => void;
}

const ConfigurationForm: React.FC<ConfigurationFormProps> = ({ 
  onSubmit, 
  initialConfig, 
  onClearAll, 
  persistedSchemaFile,
  onSchemaFileChange 
}) => {
  const [config, setConfig] = useState<ContentstackConfig>({
    apiKey: '',
    managementToken: '',
    host: 'https://api.contentstack.io',
    contentType: '',
    shouldPublish: false,
    environment: 'development'
  });
  const [schemaFile, setSchemaFile] = useState<File | null>(null);
  const [hasPersistedSchema, setHasPersistedSchema] = useState(false);
  const { toast } = useToast();

  // Initialize form with persisted data
  useEffect(() => {
    if (initialConfig) {
      setConfig(prev => ({
        ...prev,
        ...initialConfig,
        managementToken: '' // Always clear the token for security
      }));
    }
  }, [initialConfig]);

  // Handle persisted schema file
  useEffect(() => {
    if (persistedSchemaFile) {
      try {
        const schema = JSON.parse(persistedSchemaFile.content);
        setConfig(prev => ({ ...prev, schema }));
        setHasPersistedSchema(true);
      } catch (error) {
        console.error('Error parsing persisted schema:', error);
      }
    }
  }, [persistedSchemaFile]);

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

    if (!config.schema) {
      toast({
        title: "Schema Required",
        description: "Please upload a content type schema JSON file",
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

  const handleReset = () => {
    // Reset all configuration data to initial state
    setConfig({
      apiKey: '',
      managementToken: '',
      host: 'https://api.contentstack.io',
      contentType: '',
      shouldPublish: false,
      environment: 'development'
    });
    setSchemaFile(null);
    setHasPersistedSchema(false);
    
    // Reset file input
    const fileInput = document.getElementById('schema') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    
    // Clear persisted schema
    if (onSchemaFileChange) {
      onSchemaFileChange(null);
    }
    
    toast({
      title: "Form Reset",
      description: "All configuration data has been cleared."
    });
  };

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
      setHasPersistedSchema(false);
      toast({
        title: "All Data Cleared",
        description: "All persisted data including config, CSV, and mappings have been cleared."
      });
    }
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
    
    // Auto-populate content type UID from filename
    const filename = file.name;
    const contentTypeUid = filename.replace('.json', '');
    setConfig(prev => ({ ...prev, contentType: contentTypeUid }));
    
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
        setHasPersistedSchema(false); // This is a new upload
        
        // Persist the schema file
        if (onSchemaFileChange) {
          onSchemaFileChange({
            name: file.name,
            content: event.target?.result as string
          });
        }
        
        toast({
          title: "Schema Uploaded",
          description: `Successfully loaded ${schema.length} fields from schema. Content type UID set to "${contentTypeUid}"`
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
          {initialConfig && (
            <span className="text-sm text-green-600 font-normal flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              Configuration restored (enter token to continue)
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Enter your Contentstack API credentials and upload your content type schema
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
              <Label htmlFor="host">API Host *</Label>
              <Select
                value={config.host}
                onValueChange={(value) => handleInputChange('host', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select API host" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="https://api.contentstack.io">US – https://api.contentstack.io</SelectItem>
                  <SelectItem value="https://eu-api.contentstack.com">EU – https://eu-api.contentstack.com</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="contentType">Content Type UID *</Label>
              <Input
                id="contentType"
                type="text"
                value={config.contentType}
                disabled
                className="bg-gray-100"
                placeholder="Auto-populated from schema filename"
                required
              />
              <p className="text-xs text-gray-500">
                This field is automatically populated from your uploaded schema filename
              </p>
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
            <Label htmlFor="schema" className="flex items-center gap-2">
              Upload Content Type Schema *
              {hasPersistedSchema && (
                <span className="text-sm text-green-600 font-normal flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Schema restored ({persistedSchemaFile?.name})
                </span>
              )}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="schema"
                type="file"
                accept=".json"
                onChange={handleSchemaUpload}
                className="cursor-pointer"
                required={!hasPersistedSchema}
              />
              <Upload className="w-4 h-4 text-gray-500" />
            </div>
            <p className="text-sm text-gray-500">
              Upload your content type JSON schema (e.g., blog_post.json) to configure field mappings and validation
            </p>
            {config.schema && (
              <p className="text-sm text-green-600">
                ✓ Schema loaded with {config.schema.length} fields. Content type: "{config.contentType}"
              </p>
            )}
            {!hasPersistedSchema && !schemaFile && (
              <p className="text-sm text-red-600">
                Schema upload is required to proceed with the import
              </p>
            )}
          </div>
          
          <div className="flex gap-3">
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
              Save Configuration & Continue
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleReset}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Form
            </Button>
            {onClearAll && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleClearAll}
                className="flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear All Data
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default ConfigurationForm;
