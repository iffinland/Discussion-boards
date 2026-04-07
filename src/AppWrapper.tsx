import type { ReactNode } from 'react';
import { GlobalProvider } from 'qapp-core';

import { publicSalt } from './qapp-config';

type AppWrapperProps = {
  children: ReactNode;
};

export const AppWrapper = ({ children }: AppWrapperProps) => {
  return (
    <GlobalProvider
      config={{
        appName: 'Discussion Boards',
        publicSalt,
        auth: {
          authenticateOnMount: true,
          balanceSetting: {
            interval: 180000,
            onlyOnMount: false,
          },
        },
      }}
    >
      {children}
    </GlobalProvider>
  );
};
