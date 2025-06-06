
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

export const getFieldType = (dataType: string): 'text' | 'number' | 'boolean' | 'date' | 'reference' | 'file' | 'blocks' | 'global_field' | 'link' => {
  switch (dataType) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'isodate': return 'date';
    case 'reference': return 'reference';
    case 'file': return 'file';
    case 'blocks': return 'blocks';
    case 'global_field': return 'global_field';
    case 'link': return 'link';
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
  
  // Handle modular blocks within global fields: globalField.modular_blocks.blockType.fieldName
  if (pathParts.length === 4 && pathParts[1] === 'modular_blocks' && fieldMapping.blockType) {
    const transformedValue = await transformValue(value, fieldMapping);
    
    return {
      isGlobalFieldBlock: true,
      globalFieldName: pathParts[0],
      blockType: fieldMapping.blockType,
      fieldName: pathParts[3],
      value: transformedValue
    };
  }
  
  // Handle direct modular blocks: fieldName.blockType.fieldName
  if (pathParts.length === 3 && fieldMapping.blockType) {
    const transformedValue = await transformValue(value, fieldMapping);
    
    return {
      blockType: fieldMapping.blockType,
      fieldName: pathParts[2],
      value: transformedValue
    };
  }
  
  // Handle global field nested values (non-block)
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
  console.log(`🔄 MERGE DEBUG: Starting merge for fieldPath: ${fieldPath}`);
  console.log(`🔄 MERGE DEBUG: Existing data:`, JSON.stringify(existingData, null, 2));
  console.log(`🔄 MERGE DEBUG: New data:`, JSON.stringify(newData, null, 2));
  
  const pathParts = fieldPath.split('.');
  const result = { ...existingData };
  
  if (pathParts.length === 1) {
    // Simple field
    console.log(`🔄 MERGE DEBUG: Simple field assignment`);
    result[pathParts[0]] = newData;
  } else if (newData.isGlobalFieldBlock) {
    // Global field with modular blocks: globalField.modular_blocks.blockType.fieldName
    console.log(`🔄 MERGE DEBUG: Global field block processing`);
    const globalFieldName = newData.globalFieldName;
    const blockType = newData.blockType;
    const fieldName = newData.fieldName;
    
    if (!result[globalFieldName] || typeof result[globalFieldName] === 'string') {
      result[globalFieldName] = {};
    }
    
    if (!result[globalFieldName].modular_blocks) {
      result[globalFieldName].modular_blocks = [];
    }
    
    let existingBlock = result[globalFieldName].modular_blocks.find((block: any) => block[blockType]);
    if (!existingBlock) {
      existingBlock = { [blockType]: {} };
      result[globalFieldName].modular_blocks.push(existingBlock);
    }
    
    existingBlock[blockType][fieldName] = newData.value;
  } else if (pathParts.length === 3 && newData.blockType) {
    // Direct modular block field: fieldName.blockType.fieldName
    console.log(`🔄 MERGE DEBUG: Direct modular block processing`);
    const [fieldName, blockType, blockFieldName] = pathParts;
    
    if (!result[fieldName]) {
      result[fieldName] = [];
    }
    
    let existingBlock = result[fieldName].find((block: any) => Object.keys(block)[0] === blockType);
    if (!existingBlock) {
      existingBlock = { [blockType]: {} };
      result[fieldName].push(existingBlock);
    }
    
    existingBlock[blockType][blockFieldName] = newData.value;
  } else if (pathParts.length >= 2 && newData.isGlobalField) {
    // Global field: globalFieldName.fieldName (can be deeper)
    console.log(`🔄 MERGE DEBUG: Global field nested processing`);
    const globalFieldName = newData.globalFieldName;
    const nestedPath = newData.nestedPath;
    
    console.log(`🔄 MERGE DEBUG: Global field name: ${globalFieldName}`);
    console.log(`🔄 MERGE DEBUG: Nested path:`, nestedPath);
    
    if (!result[globalFieldName] || typeof result[globalFieldName] === 'string') {
      console.log(`🔄 MERGE DEBUG: Initializing global field as object`);
      result[globalFieldName] = {};
    }
    
    // Build the nested structure
    let current = result[globalFieldName];
    console.log(`🔄 MERGE DEBUG: Starting nested path traversal`);
    
    for (let i = 0; i < nestedPath.length - 1; i++) {
      console.log(`🔄 MERGE DEBUG: Processing nested path part: ${nestedPath[i]}`);
      if (!current[nestedPath[i]]) {
        current[nestedPath[i]] = {};
      }
      current = current[nestedPath[i]];
    }
    
    // Set the final value
    const finalKey = nestedPath[nestedPath.length - 1];
    console.log(`🔄 MERGE DEBUG: Setting final value for key: ${finalKey}`);
    current[finalKey] = newData.value;
    
    console.log(`🔄 MERGE DEBUG: Final global field structure:`, JSON.stringify(result[globalFieldName], null, 2));
  }
  
  console.log(`🔄 MERGE DEBUG: Final merged result:`, JSON.stringify(result, null, 2));
  return result;
};
