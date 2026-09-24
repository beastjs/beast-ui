import { useEffect, useRef, useState } from "octane";
module
  type CopyStatus = "copied" | "failed" | "idle";
  const RESET_DELAY_MS = 2000;
  export const COPY_FAILED_MESSAGE = "Unable to copy. Select the text and copy it manually.";
  export function useCopy() {
    const [status, setStatus] = useState<CopyStatus>("idle");
    const timeoutRef = useRef<number | null>(null);
    useEffect(() => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    }, []);
    async function copy(text: string) {
      let next: CopyStatus = "copied";
      try {
        await navigator.clipboard.writeText(text);
      }
      catch {
        next = "failed";
      }
      setStatus(next);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setStatus("idle"), RESET_DELAY_MS);
    }
    return { copy, status };
  }
