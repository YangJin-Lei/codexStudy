import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

type CodexNewWorkbenchScrollProps = {
  children: ReactNode;
};

function wheelDelta(event: WheelEvent) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * window.innerHeight;
  }
  return event.deltaY;
}

function canScrollElement(element: HTMLElement, deltaY: number) {
  if (element.scrollHeight <= element.clientHeight + 1) {
    return false;
  }
  if (deltaY < 0) {
    return element.scrollTop > 0;
  }
  return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
}

export function CodexNewWorkbenchScroll({ children }: CodexNewWorkbenchScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const syncHeight = () => {
      const nextHeight = window.innerHeight;
      const element = scrollRef.current;
      if (element) {
        element.style.height = `${nextHeight}px`;
      }
    };
    syncHeight();
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = 0;
    }
    window.addEventListener("resize", syncHeight);
    return () => window.removeEventListener("resize", syncHeight);
  }, []);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      if (!(event.target instanceof Node) || !scrollElement.contains(event.target)) {
        return;
      }

      let node = event.target instanceof Element ? event.target : null;
      while (node && node !== scrollElement) {
        if (node instanceof HTMLElement && canScrollElement(node, event.deltaY)) {
          return;
        }
        node = node.parentElement;
      }

      const delta = wheelDelta(event);
      const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
      if (maxScroll <= 0) {
        event.preventDefault();
        return;
      }
      const atTop = scrollElement.scrollTop <= 0;
      const atBottom = scrollElement.scrollTop >= maxScroll - 1;
      if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
        event.preventDefault();
        return;
      }
      const nextScrollTop = Math.min(
        maxScroll,
        Math.max(0, scrollElement.scrollTop + delta),
      );
      scrollElement.scrollTop = nextScrollTop;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, true);
  }, []);

  return (
    <div
      ref={scrollRef}
      className="codex-new-workbench-scroll"
      data-testid="codex-new-workbench-scroll"
    >
      {children}
    </div>
  );
}
