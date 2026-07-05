import { useRef } from "react";

export function useBackdropHandlers(onClose) {
  const downOnBackdrop = useRef(false);
  return {
    onMouseDown: (e) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) {
        onClose?.(e);
      }
      downOnBackdrop.current = false;
    },
  };
}
