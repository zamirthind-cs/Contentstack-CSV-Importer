
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
          const response = await fetch(`${config.host}/v3/global_fields/${field.reference_to}`, {
            headers: {
              'api_key': config.apiKey,
              'authorization': config.managementToken,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            globalFieldSchema = data.global_field?.schema || [];
            console.log(`Successfully fetched schema for ${field.reference_to}, found ${globalFieldSchema.length} fields`);
          } else {
            const errorText = await response.text();
            console.warn(`Failed to fetch global field schema for: ${field.reference_to}, status: ${response.status}, error: ${errorText}`);
            
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

export const getFieldType = (dataType: string): 'text' | 'number' | 'boolean' | 'date' | 'reference' | 'file' | 'blocks' | 'global_field' => {
  switch (dataType) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'isodate': return 'date';
    case 'reference': return 'reference';
    case 'file': return 'file';
    case 'blocks': return 'blocks';
    case 'global_field': return 'global_field';
    default: return 'text';
  }
};

export const transformNestedValue = async (
  value: string,
  fieldPath: string,
  fieldMapping: any,
  transformValue: (value: string, mapping: any) => Promise<any>
): Promise<any> => {
  if (!value || value.trim() === '') return null;
  
  const pathParts = fieldPath.split('.');
  
  // Handle simple fields
  if (pathParts.length === 1) {
    return await transformValue(value, fieldMapping);
  }
  
  // Handle nested fields (blocks or global fields)
  if (pathParts.length === 3 && fieldMapping.blockType) {
    // This is a modular block field: fieldName.blockType.fieldName
    const transformedValue = await transformValue(value, fieldMapping);
    return {
      blockType: fieldMapping.blockType,
      fieldName: pathParts[2],
      value: transformedValue
    };
  }
  
  // Handle global field nested values
  if (pathParts.length >= 2 && !fieldMapping.blockType) {
    const transformedValue = await transformValue(value, fieldMapping);
    return {
      fieldName: pathParts[pathParts.length - 1],
      value: transformedValue,
      isGlobalField: true,
      globalFieldName: pathParts[0],
      nestedPath: pathParts.slice(1)
    };
  }
  
  return await transformValue(value, fieldMapping);
};

export const mergeNestedData = (existingData: any, newData: any, fieldPath: string): any => {
  const pathParts = fieldPath.split('.');
  const result = { ...existingData };
  
  if (pathParts.length === 1) {
    // Simple field
    result[pathParts[0]] = newData;
  } else if (pathParts.length === 3 && newData.blockType) {
    // Modular block field: fieldName.blockType.fieldName
    const [fieldName, blockType, blockFieldName] = pathParts;
    
    if (!result[fieldName]) {
      result[fieldName] = [];
    }
    
    // Find existing block or create new one
    let existingBlock = result[fieldName].find((block: any) => Object.keys(block)[0] === blockType);
    if (!existingBlock) {
      existingBlock = { [blockType]: {} };
      result[fieldName].push(existingBlock);
    }
    
    // Set the field value directly (not nested)
    existingBlock[blockType][blockFieldName] = newData.value;
  } else if (pathParts.length >= 2 && newData.isGlobalField) {
    // Global field: globalFieldName.fieldName (can be deeper)
    const globalFieldName = newData.globalFieldName;
    const nestedPath = newData.nestedPath;
    
    if (!result[globalFieldName]) {
      result[globalFieldName] = {};
    }
    
    // Build the nested structure
    let current = result[globalFieldName];
    for (let i = 0; i < nestedPath.length - 1; i++) {
      if (!current[nestedPath[i]]) {
        current[nestedPath[i]] = {};
      }
      current = current[nestedPath[i]];
    }
    
    // Set the final value
    current[nestedPath[nestedPath.length - 1]] = newData.value;
  }
  
  return result;
};
