import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative w-full rounded-xl border p-4 text-sm [&>svg~*]:pl-7 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-current', { variants: { variant: { default: 'border-border bg-card text-foreground', destructive: 'border-danger-border bg-danger text-danger-foreground', success: 'border-success-border bg-success text-success-foreground', warning: 'border-warning-border bg-warning text-warning-foreground' } }, defaultVariants: { variant: 'default' } });
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}
export function Alert({ className, variant, ...props }: AlertProps) { return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />; }
export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) { return <h5 className={cn('mb-1 font-semibold leading-none tracking-tight', className)} {...props} />; }
export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) { return <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />; }
