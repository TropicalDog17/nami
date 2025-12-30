/**
 * Generic Quick Modal Wrapper Component
 * Provides a consistent modal structure with shared functionality.
 */

import React, { ReactNode } from 'react';

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
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        className={`bg-white rounded-lg p-6 w-full ${maxWidthClasses[maxWidth]} ${className}`}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
            type="button"
          >
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}

        {/* Content */}
        {children}
      </div>
    </div>
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
    <div className="flex space-x-3">
      <button
        type="button"
        onClick={handleSecondary}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {secondaryText}
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryLoading}
        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {primaryLoading ? 'Saving...' : primaryText}
      </button>
    </div>
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
}

/**
 * Standardized form field wrapper.
 *
 * @example
 * <FormField label="Amount" hint="Enter the amount" error={errors.amount}>
 *   <input type="number" ... />
 * </FormField>
 */
export const FormField: React.FC<FormFieldProps> = ({ label, children, hint, error }) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-gray-500 mt-1">{hint}</p>
      )}
      {error && (
        <p className="text-sm text-red-600 mt-1">{error}</p>
      )}
    </div>
  );
};

export default QuickModal;
