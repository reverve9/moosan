import { createElement, type HTMLAttributes, type ReactNode } from 'react'
import styles from './Text.module.css'

type Variant = 'display' | 'title' | 'subtitle' | 'body' | 'caption' | 'label'
type Color = 'primary' | 'secondary' | 'muted' | 'inverse' | 'accent' | 'default'
type Weight = 'regular' | 'medium' | 'semibold' | 'bold'
type As = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div'

interface Props extends HTMLAttributes<HTMLElement> {
  as?: As
  variant?: Variant
  color?: Color
  weight?: Weight
  align?: 'left' | 'center' | 'right'
  children: ReactNode
}

const DEFAULT_AS: Record<Variant, As> = {
  display: 'h1',
  title: 'h2',
  subtitle: 'h3',
  body: 'p',
  caption: 'span',
  label: 'span',
}

export default function Text({
  as,
  variant = 'body',
  color = 'default',
  weight,
  align,
  className = '',
  children,
  ...rest
}: Props) {
  const element = as ?? DEFAULT_AS[variant]
  const classes = [
    styles.text,
    styles[variant],
    styles[`color_${color}`],
    weight && styles[`weight_${weight}`],
    align && styles[`align_${align}`],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return createElement(element, { className: classes, ...rest }, children)
}
