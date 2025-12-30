/**
 * Modal manager hook for handling multiple modal states.
 * Replaces the pattern of having many individual useState hooks for modals.
 */

import { useCallback, useReducer, useState } from 'react';
import type { ModalType } from '../types';

/**
 * State for the modal manager
 */
interface ModalManagerState {
  isOpen: boolean;
  modalType: ModalType | null;
}

/**
 * Actions for the modal manager
 */
type ModalManagerAction =
  | { type: 'OPEN_MODAL'; payload: ModalType }
  | { type: 'CLOSE_MODAL' }
  | { type: 'CLOSE_ALL' };

/**
 * Reducer for modal state management
 */
function modalReducer(
  state: ModalManagerState,
  action: ModalManagerAction
): ModalManagerState {
  switch (action.type) {
    case 'OPEN_MODAL':
      return {
        isOpen: true,
        modalType: action.payload,
      };
    case 'CLOSE_MODAL':
      return {
        isOpen: false,
        modalType: null,
      };
    case 'CLOSE_ALL':
      return {
        isOpen: false,
        modalType: null,
      };
    default:
      return state;
  }
}

/**
 * Hook for managing multiple modal states with a single reducer.
 *
 * @example
 * const { isOpen, modalType, openModal, closeModal, isModalOpen } = useModalManager();
 *
 * // Check if a specific modal is open
 * if (isModalOpen('expense')) {
 *   // Render expense modal
 * }
 *
 * // Open a specific modal
 * openModal('income');
 *
 * // Close the current modal
 * closeModal();
 */
export function useModalManager() {
  const [state, dispatch] = useReducer(modalReducer, {
    isOpen: false,
    modalType: null,
  });

  /**
   * Opens a specific modal
   */
  const openModal = useCallback((modalType: ModalType) => {
    dispatch({ type: 'OPEN_MODAL', payload: modalType });
  }, []);

  /**
   * Closes the current modal
   */
  const closeModal = useCallback(() => {
    dispatch({ type: 'CLOSE_MODAL' });
  }, []);

  /**
   * Closes all modals
   */
  const closeAllModals = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL' });
  }, []);

  /**
   * Checks if a specific modal is open
   */
  const isModalOpen = useCallback(
    (modalType: ModalType): boolean => {
      return state.isOpen && state.modalType === modalType;
    },
    [state.isOpen, state.modalType]
  );

  return {
    isOpen: state.isOpen,
    modalType: state.modalType,
    openModal,
    closeModal,
    closeAllModals,
    isModalOpen,
  };
}

/**
 * Hook for managing a single modal state (simpler version)
 *
 * @example
 * const { isOpen, openModal, closeModal } = useSingleModal();
 */
export function useSingleModal() {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    openModal,
    closeModal,
    toggle: useCallback(() => setIsOpen((prev) => !prev), []),
  };
}
