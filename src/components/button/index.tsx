import type { ReactNode } from 'react';
import classNames from 'classnames';
import './index.css';

type ButtonType = 'default' | 'link';

interface BaseButtonProps {
  type?: ButtonType;
  className?: string;
  block?: boolean;
  children?: ReactNode;
  disabled?: boolean;
  [key: `data-${string}`]: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
}

type MergedHTMLAttributes = Omit<
  React.HTMLAttributes<HTMLElement> &
    React.ButtonHTMLAttributes<HTMLElement> &
    React.AnchorHTMLAttributes<HTMLElement>,
  'type' | 'color'
>;

interface ButtonProps extends BaseButtonProps, MergedHTMLAttributes {
  href?: string;
  target?: string;
}

const Button = (props: ButtonProps) => {
  const {
    type = 'default',
    children,
    className,
    disabled = false,
    block = false,
    onClick,
    ...rest
  } = props;

  const classes = classNames(
    'sb-button',
    {
      block: block,
      'inline-block': !block,
      [`sb-button-${type}`]: type,
    },
    className,
  );

  const handleClick = (
    e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement, MouseEvent>,
  ) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    (
      onClick as React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>
    )?.(e);
  };

  if (rest.href) {
    return (
      <a
        {...rest}
        className={classes}
        href={disabled ? undefined : rest.href}
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
      >
        {children}
      </a>
    );
  }

  return (
    <button {...rest} className={classes} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
};

export default Button;
