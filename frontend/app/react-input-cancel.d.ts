import "react";

declare module "react" {
  interface InputHTMLAttributes<T> {
    onCancel?: ReactEventHandler<T>;
  }
}
