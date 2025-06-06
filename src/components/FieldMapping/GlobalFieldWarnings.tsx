
import React from 'react';

interface GlobalFieldWarningsProps {
  warnings: string[];
}

const GlobalFieldWarnings: React.FC<GlobalFieldWarningsProps> = ({ warnings }) => {
  if (warnings.length === 0) return null;

  return (
    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
      <div className="font-medium text-amber-800 mb-2">⚠️ Global Field Access Issues:</div>
      {warnings.map((warning, index) => (
        <div key={index} className="text-xs text-amber-700 mb-1">• {warning}</div>
      ))}
      <div className="text-xs text-amber-700 mt-2 p-2 bg-amber-100 rounded">
        💡 <strong>Tip:</strong> Check your API credentials and ensure the global fields exist and are accessible with your management token.
      </div>
    </div>
  );
};

export default GlobalFieldWarnings;
