import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ContextualHelp({ message }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-muted-foreground hover:text-primary transition-colors"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            className="absolute left-6 top-0 z-30 w-56 bg-popover text-popover-foreground border border-border rounded-xl shadow-xl p-3 text-xs leading-relaxed"
          >
            <button onClick={() => setOpen(false)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}