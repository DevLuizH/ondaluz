import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useSearchParams } from "react-router-dom";
import { fetchMeta, formatWhen, type Meta } from "./api";
import { NocPage } from "./NocPage";
import { SupportPage } from "./SupportPage";

const AUG4 = "2026-08-04T21:00:00-03:00";

export function App() {
  const [params, setParams] = useSearchParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMeta()
      .then((next) => {
        if (cancelled) return;
        setMeta(next);
        setParams((current) => {
          if (current.get("asOf") || !next.to) return current;
          const updated = new URLSearchParams(current);
          updated.set("asOf", next.to);
          return updated;
        }, { replace: true });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar");
      });
    return () => {
      cancelled = true;
    };
  }, [setParams]);

  const asOf = params.get("asOf") ?? meta?.to ?? "";
  const fromMs = meta?.from ? new Date(meta.from).getTime() : 0;
  const toMs = meta?.to ? new Date(meta.to).getTime() : 0;
  const asOfMs = asOf ? new Date(asOf).getTime() : toMs;

  function setAsOfIso(iso: string) {
    const updated = new URLSearchParams(params);
    updated.set("asOf", iso);
    setParams(updated);
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <strong>Ondaluz</strong>
          <span>o que está quebrado agora</span>
        </div>
        <nav>
          <NavLink to={`/noc?${params.toString()}`}>NOC</NavLink>
          <NavLink to={`/suporte?${params.toString()}`}>Suporte</NavLink>
        </nav>
        <div className="clock">
          <div className="clock-label">{asOf ? formatWhen(asOf) : "carregando"}</div>
          <input
            type="range"
            min={fromMs}
            max={toMs}
            step={3600000}
            value={Number.isFinite(asOfMs) ? asOfMs : 0}
            disabled={!meta}
            onChange={(event) => setAsOfIso(new Date(Number(event.target.value)).toISOString())}
          />
          <div className="clock-actions">
            <button type="button" onClick={() => meta?.to && setAsOfIso(meta.to)}>
              Fim do período
            </button>
            <button type="button" onClick={() => setAsOfIso(AUG4)}>
              4 ago, 21h
            </button>
          </div>
        </div>
      </header>
      {error ? <p className="banner error">{error}</p> : null}
      <Routes>
        <Route path="/" element={<NocPage asOf={asOf} />} />
        <Route path="/noc" element={<NocPage asOf={asOf} />} />
        <Route path="/suporte" element={<SupportPage asOf={asOf} />} />
      </Routes>
    </div>
  );
}
