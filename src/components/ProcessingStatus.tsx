import { motion } from 'framer-motion';
import { Loader2, Zap } from 'lucide-react';

interface ProcessingStatusProps {
  count: number;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ count }) => {
  return (
    <motion.div
      className="glass rounded-lg p-4"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-white font-medium">
              Processing {count} screenshot{count !== 1 ? 's' : ''}...
            </span>
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="mt-2">
            <div className="w-full bg-dark-700 rounded-full h-2">
              <motion.div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProcessingStatus;
