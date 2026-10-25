import type { ReactNode } from 'react';
import { Dialog as RadixDialog } from 'radix-ui';

interface DialogProps {
  trigger: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function Dialog({ trigger, title, description, children }: DialogProps) {
  return (
    <RadixDialog.Root>
      <RadixDialog.Trigger asChild>
        <button type="button" className="osc-quiet-button">
          {trigger}
        </button>
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="osc-dialog-overlay" />
        <RadixDialog.Content className="osc-dialog-content">
          <RadixDialog.Title asChild>
            <h3>{title}</h3>
          </RadixDialog.Title>
          <RadixDialog.Description className="osc-dialog-description">
            {description}
          </RadixDialog.Description>
          <div>{children}</div>
          <div className="osc-dialog-footer">
            <RadixDialog.Close asChild>
              <button type="button">关闭</button>
            </RadixDialog.Close>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
