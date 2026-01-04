/**
 * Generic Quick Modal Wrapper Component
 * Provides a consistent modal structure with shared functionality.
 */

import React, { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface QuickModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Modal title */
  title: string;
  /** Modal content */
  children: ReactNode;
  /** Error message to display */
  error?: string | null;
  /** Additional CSS classes for the modal container */
  className?: string;
  /** Maximum width of the modal */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  /** Description text for accessibility */
  description?: string;
}

/**
 * Map of max width classes
 */
const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

/**
 * Generic modal wrapper component that provides consistent styling and behavior.
 *
 * @example
 * <QuickModal
 *   isOpen={isOpen}
 *   onClose={onClose}
 *   title="Quick Expense Entry"
 *   error={error}
 * >
 *   <form onSubmit={handleSubmit}>
 *     {/* Form content *\/}
 *   </form>
 * </QuickModal>
 */
export const QuickModal: React.FC<QuickModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  error,
  className = '',
  maxWidth = 'md',
  description,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`${maxWidthClasses[maxWidth]} ${className}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* Error message */}
        {error && (
          <div className="mb-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
            {error}
          </div>
        )}

        {/* Content */}
        {children}
      </DialogContent>
    </Dialog>
  );
};

/**
 * Modal footer with action buttons
 */
export interface QuickModalFooterProps {
  /** Primary button text */
  primaryText: string;
  /** Primary button click handler */
  onPrimary: () => void;
  /** Whether primary button is disabled */
  primaryDisabled?: boolean;
  /** Whether primary button is in loading state */
  primaryLoading?: boolean;
  /** Secondary button text (default: "Cancel") */
  secondaryText?: string;
  /** Secondary button click handler (default: closes modal) */
  onSecondary?: () => void;
  /** Cancel callback for default secondary button */
  onCancel?: () => void;
}

/**
 * Standardized modal footer with Cancel and Submit buttons.
 *
 * @example
 * <QuickModalFooter
 *   primaryText="Save Expense"
 *   onPrimary={handleSubmit}
 *   primaryDisabled={!isValid}
 *   primaryLoading={isSubmitting}
 *   onCancel={onClose}
 * />
 */
export const QuickModalFooter: React.FC<QuickModalFooterProps> = ({
  primaryText,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  secondaryText = 'Cancel',
  onSecondary,
  onCancel,
}) => {
  const handleSecondary = () => {
    if (onSecondary) {
      onSecondary();
    } else if (onCancel) {
      onCancel();
    }
  };

  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={handleSecondary}>
        {secondaryText}
      </Button>
      <Button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryLoading}
      >
        {primaryLoading ? 'Saving...' : primaryText}
      </Button>
    </DialogFooter>
  );
};

/**
 * Form field wrapper with consistent styling
 */
export interface FormFieldProps {
  /** Field label */
  label: string;
  /** Field children (input, select, etc.) */
  children: ReactNode;
  /** Optional hint text */
  hint?: string;
  /** Optional error message */
  error?: string;
  /** Required field indicator */
  required?: boolean;
}

/**
 * Standardized form field wrapper.
 *
 * @example
 * <FormField label="Amount" hint="Enter the amount" error={errors.amount}>
 *   <input type="number" ... />
 * </FormField>
 */
import { Label } from '@/components/ui/label';

export const FormField: React.FC<FormFieldProps> = ({
  label,
  children,
  hint,
  error,
  required = false,
}) => {
  return (
    <div>
      <Label className={error ? 'text-destructive' : ''}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      )}
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
};

export default QuickModal;
