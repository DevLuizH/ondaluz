import { useEffect, useState } from "react";
import { fetchIncident, fetchIncidents, type Incident, type IncidentList } from "./api";

export function NocPage({ asOf }: { asOf: string }) {
  const [list, setList] = useState<IncidentList | null>(null);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!asOf) return;
    let cancelled = false;
    setError(null);
    fetchIncidents(asOf)
      .then((next) => {
        if (!cancelled) setList(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao listar incidentes");
      });
    return () => {
      cancelled = true;
    };
  }, [asOf]);

  useEffect(() => {
    if (!selected || !asOf) return;
    let cancelled = false;
    fetchIncident(selected.id, asOf)
      .then((next) => {
        if (!cancelled) setSelected(next);
      })
      .catch(() => {
        if (!cancelled) setSelected(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, asOf]);

  return (
    <main className="layout">
      <section>
        <p className="lead">
          Agrupado para decidir onde agir: um trecho de rede, um grupo com a mesma causa, ou um cliente isolado.
        </p>
        {error ? <p className="banner error">{error}</p> : null}
        {!list ? <p>Carregando incidentes…</p> : null}
        {list ? (
          <>
            <Group
              title="Trecho de rede"
              count={list.totals.network}
              items={list.groups.network}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
            <Group
              title="Coorte"
              count={list.totals.cohort}
              items={list.groups.cohort}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
            <Group
              title="Cliente isolado"
              count={list.totals.customer}
              items={list.groups.customer}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          </>
        ) : null}
      </section>
      <aside className="detail">
        {selected ? <Detail incident={selected} /> : <p>Escolha um incidente para ver a evidência e a ação.</p>}
      </aside>
    </main>
  );
}

function Group({
  title,
  count,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  count: number;
  items: Incident[];
  selectedId: number | null;
  onSelect: (incident: Incident) => void;
}) {
  return (
    <section className="group">
      <h2>
        {title} <span>{count}</span>
      </h2>
      {items.length === 0 ? <p className="muted">Nada ativo neste instante.</p> : null}
      <ul>
        {items.slice(0, 12).map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === selectedId ? "card selected" : "card"}
              onClick={() => onSelect(item)}
            >
              <strong>{item.title}</strong>
              <span>
                {item.affected} {item.affected === 1 ? "afetado" : "afetados"} · {item.actionLabel}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {count > items.length ? <p className="muted">Mostrando {items.length} de {count}.</p> : null}
      {items.length > 12 ? <p className="muted">Mostrando 12 de {items.length} carregados.</p> : null}
    </section>
  );
}

function Detail({ incident }: { incident: Incident }) {
  const evidence = Object.entries(incident.evidence).filter(([key]) => key !== "global");
  return (
    <div>
      <p className={`action action-${incident.action}`}>{incident.actionLabel}</p>
      <h2>{incident.title}</h2>
      <p>{incident.reason}</p>
      <h3>O que o suporte diz ao cliente</h3>
      <p className="speech">{incident.speech}</p>
      <h3>Evidência</h3>
      <dl>
        {evidence.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
      {incident.members ? (
        <>
          <h3>Clientes ({incident.memberCount ?? incident.members.length})</h3>
          <ul className="members">
            {incident.members.map((member) => (
              <li key={member.serial}>
                {member.customerId} · {member.serial}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
