import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiResult } from '../api';

export function usePoll<T>(
  fn: () => Promise<ApiResult<T>>,
  ms: number,
  deps: any[] = []
) {
  const [data, setData] = useState<ApiResult<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const isMounted = useRef(true);

  const execute = useCallback(async () => {
    try {
      const res = await fn();
      if (isMounted.current) {
        setData(res);
        setError(res.status !== 'OK' ? res.reason || res.status : null);
        setLastUpdated(new Date());
        setLoading(false);
      }
    } catch (err: any) {
      if (isMounted.current) {
        setError(err.message || 'Fetch failed');
        setLoading(false);
      }
    }
  }, [fn, ...deps]);

  useEffect(() => {
    isMounted.current = true;
    setLoading(true);
    execute();

    if (ms <= 0) return;

    const intervalId = setInterval(execute, ms);
    return () => {
      isMounted.current = false;
      clearInterval(intervalId);
    };
  }, [execute, ms]);

  return { data, error, loading, lastUpdated, refetch: execute };
}
