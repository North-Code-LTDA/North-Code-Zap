import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'primary-soft'
  | 'secondary'
  | 'danger'
  | 'danger-solid'
  | 'ghost'
  | 'icon';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-sans transition-all duration-150 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50';

    const sizeStyles: Record<ButtonSize, string> = {
      xs: 'px-2.5 py-1 text-[11px] rounded-lg gap-1.5',
      sm: 'px-3 py-1.5 text-xs rounded-xl gap-1.5 font-medium',
      md: 'px-4 py-2 text-xs rounded-xl gap-2 font-semibold',
      lg: 'px-5 py-2.5 text-sm rounded-xl gap-2.5 font-bold',
    };

    const iconSizeStyles: Record<ButtonSize, string> = {
      xs: 'p-1 text-xs rounded-lg',
      sm: 'p-1.5 text-xs rounded-xl',
      md: 'p-2 text-sm rounded-xl',
      lg: 'p-2.5 text-base rounded-xl',
    };

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-neutral-950 shadow-md shadow-emerald-500/10 font-bold',
      'primary-soft':
        'bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-[0.98] text-emerald-400 border border-emerald-500/30 font-semibold',
      secondary:
        'bg-neutral-800 hover:bg-neutral-700 active:scale-[0.98] text-neutral-200 border border-neutral-700/80 shadow-sm font-semibold',
      danger:
        'bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] text-rose-400 border border-rose-500/20 hover:border-rose-500/40 font-semibold',
      'danger-solid':
        'bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white shadow-md shadow-rose-600/20 font-bold',
      ghost:
        'bg-transparent hover:bg-neutral-800/80 active:scale-[0.98] text-neutral-400 hover:text-neutral-200 border border-transparent font-medium',
      icon:
        'bg-neutral-800/80 hover:bg-neutral-700 active:scale-[0.98] text-neutral-400 hover:text-white border border-neutral-700/60',
    };

    const currentSize = variant === 'icon' ? iconSizeStyles[size] : sizeStyles[size];
    const currentVariant = variantStyles[variant];

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${currentSize} ${currentVariant} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children}
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
