"use client";

/**
 * Small data-fetching hook for REST reads with:
 *   - request cancellation on unmount / dependency change
 *   - race-condition protection (only the latest response lands)
 *   - stale-while-refetching display (previous data stays visible)
 *   - explicit loading / fetching / error / refetch states
 *
 * State transitions happen exclusively inside async callbacks, never
 * synchronously within the effect body.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";

export interface QueryResult<T> {
  readonly data: T | null;
  readonly error: ApiError | null;
  /** True when there is nothing to show yet and the first fetch is running. */
  readonly isLoading: boolean;
  /** True whenever a fetch is in flight, including background refetches. */
  readonly isFetching: boolean;
  refetch: () => void;
}

interface QueryState<T> {
  /** Identity of the last settled request. */
  readonly settledKey: string;
  readonly data: T | null;
  readonly error: ApiError | null;
}

export function useApiQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): QueryResult<T> {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<QueryState<T>>({
    settledKey: "",
    data: null,
    error: null,
  });

  // Cheap per-render key: encodes the dependency values + refetch counter.
  const requestKey = `${deps.map((dep) => String(dep)).join("|")}#${reload}`;

  const stale = state.settledKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    // The fetcher identity may change every render; capturing it here is
    // intentional — this effect only re-runs when requestKey changes, and
    // requestKey encodes exactly the inputs the fetcher reads.
    fetcher(controller.signal)
      .then((data) => {
        if (!active) return;
        setState({ settledKey: requestKey, data, error: null });
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        const error =
          cause instanceof ApiError
            ? cause.code === "cancelled"
              ? undefined
              : cause
            : new ApiError(0, "network_error", "Something went wrong.");
        if (error === undefined) return;
        setState({ settledKey: requestKey, data: null, error });
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const refetch = useCallback(() => {
    setReload((value) => value + 1);
  }, []);

  return {
    data: state.data,
    error: stale ? null : state.error,
    isLoading: stale && state.data === null,
    isFetching: stale,
    refetch,
  };
}
