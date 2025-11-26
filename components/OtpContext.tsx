import React, { createContext, useContext, useState, ReactNode } from 'react';
import OtpInputModal from './OtpInputModal.js';

interface OtpAction {
  id: string;
  title: string;
  description?: string;
  onConfirm: (otpToken: string) => Promise<void>;
  onCancel?: () => void;
}

interface OtpContextType {
  showOtpModal: (action: OtpAction) => void;
  closeOtpModal: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const OtpContext = createContext<OtpContextType | undefined>(undefined);

interface OtpProviderProps {
  children: ReactNode;
}

export function OtpProvider({ children }: OtpProviderProps) {
  const [currentAction, setCurrentAction] = useState<OtpAction | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const showOtpModal = (action: OtpAction) => {
    setCurrentAction(action);
  };

  const closeOtpModal = () => {
    if (currentAction?.onCancel) {
      currentAction.onCancel();
    }
    setCurrentAction(null);
    setIsLoading(false);
  };

  const handleConfirm = async (otpToken: string) => {
    if (!currentAction) return;

    setIsLoading(true);
    try {
      await currentAction.onConfirm(otpToken);
      closeOtpModal();
    } catch {
      setIsLoading(false);
      // Error handling is done in the individual components
      // We don't close the modal on error so the user can try again
    }
  };

  return (
    <OtpContext.Provider value={{ showOtpModal, closeOtpModal, isLoading, setIsLoading }}>
      {children}
      {currentAction && (
        <OtpInputModal
          isOpen={!!currentAction}
          title={currentAction.title}
          description={currentAction.description}
          onConfirm={handleConfirm}
          onCancel={closeOtpModal}
          isLoading={isLoading}
        />
      )}
    </OtpContext.Provider>
  );
}

export function useOtp() {
  const context = useContext(OtpContext);
  if (context === undefined) {
    throw new Error('useOtp must be used within an OtpProvider');
  }
  return context;
}
