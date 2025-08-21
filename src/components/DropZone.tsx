import React, { useState, useCallback } from 'react';
import { Upload, FileImage, Sparkles } from 'lucide-react';

interface DropZoneProps {
  onFilesDropped: (files: FileList) => void;
}

const DropZone: React.FC<DropZoneProps> = ({ onFilesDropped }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files) {
      onFilesDropped(e.dataTransfer.files);
    }
  }, [onFilesDropped]);

  const handleClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files) {
        onFilesDropped(target.files);
      }
    };
    input.click();
  }, [onFilesDropped]);

  return (
    <div
      className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <div className="drop-icon">
        {isDragOver ? (
          <FileImage size={48} />
        ) : (
          <Upload size={48} />
        )}
      </div>
      
      <h3>
        {isDragOver ? 'Drop your screenshots here' : 'Upload Screenshots'}
      </h3>
      
      <p>
        {isDragOver 
          ? 'Release to start AI analysis' 
          : 'Drag and drop your images here, or click to browse'
        }
      </p>
      
      <button className="btn-primary">
        <Upload className="w-4 h-4" />
        Browse Files
      </button>
      
      <div className="drop-zone-meta">
        <span><FileImage className="w-4 h-4" /> PNG, JPG, WebP</span>
        <span>•</span>
        <span><Upload className="w-4 h-4" /> Max 10MB per file</span>
        <span>•</span>
        <span><Sparkles className="w-4 h-4" /> AI analysis included</span>
      </div>
    </div>
  );
};

export default DropZone;