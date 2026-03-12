import { useState, useRef, useEffect } from "react";
import type { KeyboardEvent } from "react";

export const useItemInput = ({
  initialValue,
  onSave,
  index,
  sectionId,
  alwaysEditing = false,
}: {
  initialValue: string;
  onSave: (val: string) => void;
  index?: number;
  sectionId?: string;
  alwaysEditing?: boolean;
}) => {
  const [value, setValue] = useState(initialValue);
  const [isEditing, setIsEditing] = useState(alwaysEditing);
  const [isFocused, setIsFocused] = useState(false);
  const isEditingRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>(undefined as unknown as NodeJS.Timeout);
  const prevInitialValueRef = useRef(initialValue);

  useEffect(() => {
    if (!isEditingRef.current && prevInitialValueRef.current !== initialValue) {
      setValue(initialValue || "");
      prevInitialValueRef.current = initialValue;
    }
  }, [initialValue]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const setEditing = (next: boolean) => {
    isEditingRef.current = next;
    if (!alwaysEditing) {
      setIsEditing(next);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setEditing(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setEditing(false);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (value !== prevInitialValueRef.current) {
      onSave(value);
      prevInitialValueRef.current = value;
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const newValue = e.target.value;
    setValue(newValue);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      onSave(newValue);
      prevInitialValueRef.current = newValue;
    }, 500);
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (e.nativeEvent.isComposing) return;

    const input = e.currentTarget;
    const isTextarea = input.tagName === "TEXTAREA";

    if (e.key === "Enter" && isTextarea && (e.ctrlKey || e.metaKey)) {
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
      return;
    }

    if (e.key === "Escape") {
      setValue(prevInitialValueRef.current);
      setEditing(false);
      e.preventDefault();
      input.blur();
      return;
    }

    if (index === undefined || !sectionId) return;

    if (e.key === "ArrowUp") {
      if (isTextarea) {
        const textBeforeCursor = input.value.substring(
          0,
          input.selectionStart || 0
        );
        const lines = textBeforeCursor.split("\n");
        if (lines.length > 1) return;
      } else if (input.selectionStart !== 0) {
        return;
      }

      e.preventDefault();
      const prevInput = document.getElementById(
        `${sectionId}-input-${index - 1}`
      );
      if (prevInput) (prevInput as HTMLElement).focus();
    }

    if (e.key === "ArrowDown") {
      if (isTextarea) {
        const textAfterCursor = input.value.substring(
          input.selectionStart || 0
        );
        const hasLinesAfter = textAfterCursor.includes("\n");
        if (hasLinesAfter) return;
      } else if (input.selectionStart !== input.value.length) {
        return;
      }

      e.preventDefault();
      const nextInput = document.getElementById(
        `${sectionId}-input-${index + 1}`
      );
      if (nextInput) (nextInput as HTMLElement).focus();
    }
  };

  return {
    value,
    isEditing,
    isFocused,
    setValue,
    setIsEditing: setEditing,
    handleFocus,
    handleBlur,
    handleChange,
    handleKeyDown,
    bind: {
      value,
      onChange: handleChange,
      onFocus: handleFocus,
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
      id:
        index !== undefined && sectionId
          ? `${sectionId}-input-${index}`
          : undefined,
    },
  };
};
