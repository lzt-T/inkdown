import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

/** Renders application notifications with the shared theme tokens. */
function Toaster({ style, toastOptions, ...props }: ToasterProps): React.JSX.Element {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-primary" />,
        info: <InfoIcon className="size-4 text-primary" />,
        warning: <TriangleAlertIcon className="size-4 text-primary" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin text-primary" />
      }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: '!border-border !bg-popover !pr-12 !text-popover-foreground',
          description: '!text-muted-foreground',
          actionButton:
            '!bg-primary !text-primary-foreground hover:!bg-primary/90 focus-visible:!ring-2 focus-visible:!ring-ring/50',
          closeButton:
            '!top-2 !border-border !bg-popover !text-muted-foreground hover:!bg-accent hover:!text-accent-foreground focus-visible:!ring-2 focus-visible:!ring-ring/50',
          ...toastOptions?.classNames
        }
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          '--toast-close-button-start': 'auto',
          '--toast-close-button-end': '0.5rem',
          '--toast-close-button-transform': 'none',
          ...style
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
