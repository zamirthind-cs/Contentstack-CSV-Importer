
import { ContentstackField, FlattenedField, BlockSchema } from '@/types/contentstack';

export const flattenContentstackFields = async (
  fields: ContentstackField[], 
  parentPath = '', 
  parentField = '',
  config?: { apiKey: string; managementToken: string; host: string }
): Promise<FlattenedField[]> => {
  const flattened: FlattenedField[] = [];
  
  for (const field of fields) {
    const fieldPath = parentPath ? `${parentPath}.${field.uid}` : field.uid;
    
    // Add the field itself (except for blocks which are containers)
    if (field.data_type !== 'blocks') {
      flattened.push({
        uid: field.uid,
        display_name: field.display_name,
        data_type: field.data_type,
        mandatory: field.mandatory,
        reference_to: field.reference_to,
        fieldPath,
        parentField: parentField || undefined,
        selectOptions: field.enum || undefined
      });
    }
    
    // Handle modular blocks
    if (field.data_type === 'blocks' && field.blocks) {
      field.blocks.forEach(block => {
        block.schema.forEach(blockField => {
          const blockFieldPath = `${fieldPath}.${block.uid}.${blockField.uid}`;
          flattened.push({
            uid: blockField.uid,
            display_name: `${field.display_name} > ${block.title} > ${blockField.display_name}`,
            data_type: blockField.data_type,
            mandatory: blockField.mandatory,
            reference_to: blockField.reference_to,
            fieldPath: blockFieldPath,
            parentField: field.uid,
            blockType: block.uid,
            selectOptions: blockField.enum || undefined
          });
        });
      });
    }
    
    // Handle global fields (fetch schema if not present)
    if (field.data_type === 'global_field') {
      let globalFieldSchema: ContentstackField[] = [];
      
      if (field.schema) {
        // Schema is already included
        globalFieldSchema = field.schema;
      } else if (field.reference_to && config) {
        // Need to fetch the global field schema
        try {
          console.log(`Fetching global field schema for: ${field.reference_to}`);
          
          // For global fields, we need to use a different endpoint
          const globalFieldUid = Array.isArray(field.reference_to) ? field.reference_to[0] : field.reference_to;
          const response = await fetch(`${config.host}/v3/global_fields/${globalFieldUid}`, {
            headers: {
              'api_key': config.apiKey,
              'authorization': config.managementToken,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            globalFieldSchema = data.global_field?.schema || [];
            console.log(`Successfully fetched schema for ${globalFieldUid}, found ${globalFieldSchema.length} fields`);
          } else {
            const errorText = await response.text();
            console.warn(`Failed to fetch global field schema for: ${globalFieldUid}, status: ${response.status}, error: ${errorText}`);
            
            // Add a more descriptive error message based on status code
            let errorDescription = 'schema unavailable';
            if (response.status === 422) {
              errorDescription = 'invalid credentials or field not accessible';
            } else if (response.status === 404) {
              errorDescription = 'global field not found';
            } else if (response.status === 401) {
              errorDescription = 'unauthorized access';
            }
            
            // Still add the global field itself as a basic field
            flattened.push({
              uid: field.uid,
              display_name: `${field.display_name} (global field - ${errorDescription})`,
              data_type: 'global_field',
              mandatory: field.mandatory,
              fieldPath,
              parentField: parentField || undefined
            });
          }
        } catch (error) {
          console.warn(`Network error fetching global field schema for ${field.reference_to}:`, error);
          // Add the global field itself as a basic field so it can still be mapped
          flattened.push({
            uid: field.uid,
            display_name: `${field.display_name} (global field - network error)`,
            data_type: 'global_field',
            mandatory: field.mandatory,
            fieldPath,
            parentField: parentField || undefined
          });
        }
      } else {
        // No schema and no config to fetch - add as basic field
        flattened.push({
          uid: field.uid,
          display_name: `${field.display_name} (global field - no config)`,
          data_type: 'global_field',
          mandatory: field.mandatory,
          fieldPath,
          parentField: parentField || undefined
        });
      }
      
      if (globalFieldSchema.length > 0) {
        const nestedFields = await flattenContentstackFields(globalFieldSchema, fieldPath, field.uid, config);
        flattened.push(...nestedFields);
      }
    }
  }
  
  return flattened;
};

// Synchronous version for when we already have the complete schema
export const flattenContentstackFieldsSync = (fields: ContentstackField[], parentPath = '', parentField = ''): FlattenedField[] => {
  const flattened: FlattenedField[] = [];
  
  fields.forEach(field => {
    const fieldPath = parentPath ? `${parentPath}.${field.uid}` : field.uid;
    
    // Add the field itself (except for blocks which are containers)
    if (field.data_type !== 'blocks') {
      flattened.push({
        uid: field.uid,
        display_name: field.display_name,
        data_type: field.data_type,
        mandatory: field.mandatory,
        reference_to: field.reference_to,
        fieldPath,
        parentField: parentField || undefined
      });
    }
    
    // Handle modular blocks
    if (field.data_type === 'blocks' && field.blocks) {
      field.blocks.forEach(block => {
        block.schema.forEach(blockField => {
          const blockFieldPath = `${fieldPath}.${block.uid}.${blockField.uid}`;
          flattened.push({
            uid: blockField.uid,
            display_name: `${field.display_name} > ${block.title} > ${blockField.display_name}`,
            data_type: blockField.data_type,
            mandatory: blockField.mandatory,
            reference_to: blockField.reference_to,
            fieldPath: blockFieldPath,
            parentField: field.uid,
            blockType: block.uid
          });
        });
      });
    }
    
    // Handle global fields (they have nested schema)
    if (field.data_type === 'global_field' && field.schema) {
      const nestedFields = flattenContentstackFieldsSync(field.schema, fieldPath, field.uid);
      flattened.push(...nestedFields);
    }
  });
  
  return flattened;
};

export const getFieldType = (dataType: string): 'text' | 'number' | 'boolean' | 'date' | 'reference' | 'file' | 'blocks' | 'global_field' | 'link' | 'select' => {
  switch (dataType) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'isodate': return 'date';
    case 'reference': return 'reference';
    case 'file': return 'file';
    case 'blocks': return 'blocks';
    case 'global_field': return 'global_field';
    case 'link': return 'link';
    case 'select': return 'select';
    default: return 'text';
  }
};

export const validateSelectValue = (value: string, selectOptions?: { value: string; text: string }[]): string | null => {
  if (!selectOptions || selectOptions.length === 0) {
    return value; // Not a select field, return as-is
  }
  
  // Check if the value matches any option value or text (case-insensitive)
  const matchedOption = selectOptions.find(option => 
    option.value.toLowerCase() === value.toLowerCase() || 
    option.text.toLowerCase() === value.toLowerCase()
  );
  
  if (matchedOption) {
    return matchedOption.value; // Return the option value
  }
  
  console.warn(`Select field value "${value}" does not match any available options:`, selectOptions);
  return null; // Invalid option
};

export const transformNestedValue = async (
  value: string,
  fieldPath: string,
  fieldMapping: any,
  transformValue: (value: string, mapping: any) => Promise<any>
): Promise<any> => {
  if (!value || value.trim() === '') return null;
  
  console.log(`🔧 TRANSFORM DEBUG: Processing fieldPath: ${fieldPath}`);
  console.log(`🔧 TRANSFORM DEBUG: Value: ${value}`);
  
  const pathParts = fieldPath.split('.');
  
  // For simple fields, just transform the value
  if (pathParts.length === 1) {
    console.log(`🔧 TRANSFORM DEBUG: Simple field processing`);
    return await transformValue(value, fieldMapping);
  }
  
  // For nested fields (global fields), we need to return the transformed value
  // The merging will be handled by mergeNestedData
  console.log(`🔧 TRANSFORM DEBUG: Nested field processing`);
  return await transformValue(value, fieldMapping);
};

export const mergeNestedData = (existingData: any, newData: any, fieldPath: string): any => {
  console.log(`🔄 MERGE DEBUG: Starting merge for fieldPath: ${fieldPath}`);
  console.log(`🔄 MERGE DEBUG: New data:`, newData);
  
  const pathParts = fieldPath.split('.');
  const result = { ...existingData };
  
  if (pathParts.length === 1) {
    // Simple field
    console.log(`🔄 MERGE DEBUG: Simple field assignment`);
    result[pathParts[0]] = newData;
  } else {
    // Nested field - build the structure
    console.log(`🔄 MERGE DEBUG: Nested field processing for path: ${fieldPath}`);
    
    let current = result;
    
    // Navigate/create the nested structure
    for (let i = 0; i < pathParts.length - 1; i++) {
      const pathPart = pathParts[i];
      console.log(`🔄 MERGE DEBUG: Processing path part: ${pathPart}`);
      
      if (!current[pathPart]) {
        current[pathPart] = {};
        console.log(`🔄 MERGE DEBUG: Created new object for: ${pathPart}`);
      }
      current = current[pathPart];
    }
    
    // Set the final value
    const finalKey = pathParts[pathParts.length - 1];
    current[finalKey] = newData;
    console.log(`🔄 MERGE DEBUG: Set final value for key: ${finalKey} = ${newData}`);
  }
  
  console.log(`🔄 MERGE DEBUG: Final merged result:`, JSON.stringify(result, null, 2));
  return result;
};
