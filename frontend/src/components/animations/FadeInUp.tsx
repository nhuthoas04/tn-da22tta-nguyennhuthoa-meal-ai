'use client';

import React from 'react';
import { motion, Variants } from 'framer-motion';

interface FadeInUpProps {
  children: React.ReactNode;
  duration?: number;
  yOffset?: number;
  className?: string;
  isChildOfStagger?: boolean;
}

export default function FadeInUp({
  children,
  duration = 0.7,
  yOffset = 40,
  className = '',
  isChildOfStagger = true,
}: FadeInUpProps) {
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: yOffset },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: duration,
        ease: 'easeOut',
      },
    },
  };

  if (isChildOfStagger) {
    return (
      <motion.div variants={itemVariants} className={className}>
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: yOffset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: duration, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
