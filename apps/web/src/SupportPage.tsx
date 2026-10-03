import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchSupport, formatWhen, type SupportView } from "./api";

const EXAMPLES = [
  { id: "C429303", label: "Fibra, Jardim Aurora" },
  { id: "C171248", label: "Norvik rev. A no 500 mega" },
  { id: "C373254", label: "Kestrel 2.4.1" },
];

export function SupportPage({ asOf }: { asOf: string }) {
  const [params] = useSearchParams();
  const [customerId, setCustomerId] = useState(params.get("cliente") ?? "");
  const [view, setView] = useState<SupportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup(id: string, at = asOf) {
    const trimmed = id.trim();
    if (!trimmed || !at) return;
    setLoading(true);
    setError(null);
    try {
      setView(await fetchSupport(trimmed, at));
    } catch (err: unknown) {
      setView(null);
      setError(err instanceof Error ? err.message : "Falha na consulta");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!customerId.trim() || !asOf) return;
    void lookup(customerId, asOf);
    // Refresh the open customer when the shared clock moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf]);

  return (
    <main className="support">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void lookup(customerId);
        }}
      >
        <label htmlFor="customer">Cliente</label>
        <div className="search">
          <input
            id="customer"
            value={customerId}
            placeholder="Código do cliente"
            onChange={(event) => setCustomerId(event.target.value)}
          />
          <button type="submit" disabled={loading || !asOf}>
            {loading ? "Buscando…" : "Abrir"}
          </button>
        </div>
        <div className="examples">
          {EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              onClick={() => {
                setCustomerId(example.id);
                void lookup(example.id);
              }}
            >
              {example.id} · {example.label}
            </button>
          ))}
        </div>
      </form>
      {error ? <p className="banner error">{error}</p> : null}
      {view ? <Result view={view} /> : <p className="lead">A ligação tem 6 minutos. O código do cliente basta.</p>}
    </main>
  );
}

function Result({ view }: { view: SupportView }) {
  const cpe = view.customer;
  const primary = view.primary;
  return (
    <section className="result">
      <p className="muted">
        {cpe.customerId} · {cpe.vendor} {cpe.model} rev. {cpe.hwRevision ?? "—"} · firmware {cpe.firmware} · plano{" "}
        {cpe.planMbps} Mbps · {cpe.neighborhood}, {cpe.olt} {cpe.ponPort}
      </p>
      {primary ? (
        <>
          <p className={`action action-${primary.action}`}>{primary.actionLabel}</p>
          <h2>O que dizer</h2>
          <p className="speech">{primary.speech}</p>
          <h3>Por quê, para você</h3>
          <p>{primary.reason}</p>
        </>
      ) : (
        <>
          <p className="action action-phone">Seguir o roteiro</p>
          <h2>O que dizer</h2>
          <p className="speech">
            Não há falha conhecida neste equipamento agora. Peça para desligar da tomada por 30 segundos. Se a luz PON
            estiver vermelha, agende visita. Se estiver normal, oriente a posição do roteador e o uso do 5 GHz.
          </p>
        </>
      )}
      {view.speedtest ? (
        <p className="muted">
          Último teste até {formatWhen(view.speedtest.ts)}: {view.speedtest.downloadMbps ?? "sem resultado"} Mbps de
          download ({view.speedtest.state}, pedido pelo {view.speedtest.requestedBy}). O teste sai do equipamento em
          direção à rede, não passa pelo cabo ou pelo Wi-Fi da casa.
        </p>
      ) : (
        <p className="muted">Sem teste de velocidade até este instante.</p>
      )}
      {view.others.length > 0 ? (
        <>
          <h3>Também ativo</h3>
          <ul>
            {view.others.map((item) => (
              <li key={item.id}>
                {item.title} — {item.actionLabel}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
