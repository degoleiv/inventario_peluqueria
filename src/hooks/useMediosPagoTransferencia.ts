import { useCallback, useEffect, useState } from "react";
import { fetchMediosPagoTransferencia, type MedioPagoTransferencia } from "../api";
import {
  getMediosPagoTransferenciaCached,
  MEDIOS_TRANSFERENCIA_DEFAULT,
  setMediosPagoTransferenciaCache,
} from "../lib/mediosPagoTransferencia";

export function useMediosPagoTransferencia() {
  const [medios, setMedios] = useState<MedioPagoTransferencia[]>(
    () => getMediosPagoTransferenciaCached() ?? MEDIOS_TRANSFERENCIA_DEFAULT
  );
  const [loading, setLoading] = useState(!getMediosPagoTransferenciaCached());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchMediosPagoTransferencia();
      setMediosPagoTransferenciaCache(list);
      setMedios(list);
      return list;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getMediosPagoTransferenciaCached()) return;
    void reload();
  }, [reload]);

  return { medios, loading, reload, setMedios };
}
