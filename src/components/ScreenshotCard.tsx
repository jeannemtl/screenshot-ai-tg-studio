import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Clock, Copy, FileText } from 'lucide-react';

interface Screenshot {
  id: string;
  name: string;
  size: number;
  type: string;
  timestamp: string;
  status: 'processing' | 'completed' | 'error';
  analysis?: string;
}

interface ScreenshotCardProps {
  screenshot: Screenshot;
}

const ScreenshotCard: React.FC<ScreenshotCardProps> = ({ screenshot }) => {
  const getStatusIcon = () => {
    switch (screenshot.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Clock className="w-5 h-5 text-blue-400 animate-pulse" />;
    }
  };

  const getStatusColor = () => {
    switch (screenshot.status) {
      case 'completed':
        return 'border-green-500/20 bg-green-500/5';
      case 'error':
        return 'border-red-500/20 bg-red-500/5';
      default:
        return 'border-blue-500/20 bg-blue-500/5';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCopyAnalysis = () => {
    if (screenshot.analysis) {
      navigator.clipboard.writeText(screenshot.analysis);
    }
  };

  return (
    <motion.div
      className={`glass rounded-lg p-4 border ${getStatusColor()}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-1">
          {getStatusIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-medium truncate">
              {screenshot.name}
            </h3>
            <span className="text-xs text-gray-400">
              {new Date(screenshot.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
            <span>{formatFileSize(screenshot.size)}</span>
            <span>{screenshot.type}</span>
            <span className="capitalize">{screenshot.status}</span>
          </div>

          {screenshot.analysis && (
            <div className="bg-dark-800/50 rounded p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Analysis
                </span>
                <button
                  onClick={handleCopyAnalysis}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Copy analysis"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <p className="text-sm text-gray-300">
                {screenshot.analysis}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ScreenshotCard;
