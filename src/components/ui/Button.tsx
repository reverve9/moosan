import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg' | 'form'

interface BaseProps {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  children: ReactNode
  className?: string
}

interface ButtonAsButton extends BaseProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> {
  to?: undefined
}

interface ButtonAsLink extends BaseProps {
  to: string
  type?: undefined
  onClick?: undefined
  disabled?: undefined
}

type Props = ButtonAsButton | ButtonAsLink

const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, Props>(
  ({ variant = 'primary', size = 'md', fullWidth = false, className = '', children, ...rest }, ref) => {
    const classes = [
      styles.button,
      styles[variant],
      styles[size],
      fullWidth && styles.fullWidth,
      className,
    ]
      .filter(Boolean)
      .join(' ')

    if ('to' in rest && rest.to !== undefined) {
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          to={rest.to}
          className={classes}
        >
          {children}
        </Link>
      )
    }

    const { to: _to, ...buttonProps } = rest as ButtonAsButton
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={buttonProps.type ?? 'button'}
        className={classes}
        {...buttonProps}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
