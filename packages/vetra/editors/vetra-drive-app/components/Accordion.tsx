import type React from 'react';
import { useState, useRef, useEffect } from 'react';

interface AccordionProps {
  isOpen: boolean;
  onToggle: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Accordion: React.FC<AccordionProps> = ({
  isOpen,
  onToggle,
  header,
  children,
  className = ''
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  useEffect(() => {
    const updateHeight = () => {
      if (contentRef.current) {
        if (isOpen) {
          // Temporarily set to auto to get the real height
          const scrollHeight = contentRef.current.scrollHeight;
          setHeight(scrollHeight);
        }
      }
    };

    updateHeight();
    
    // Use ResizeObserver to detect content changes
    const resizeObserver = new ResizeObserver(updateHeight);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [children, isOpen]);

  return (
    <div className={className}>
      <div
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
        className="w-full text-left focus:outline-none cursor-pointer"
      >
        {header}
      </div>
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isOpen ? (height === 'auto' ? 'none' : `${height}px`) : '0px',
          opacity: isOpen ? 1 : 0
        }}
      >
        <div ref={contentRef}>
          {children}
        </div>
      </div>
    </div>
  );
};