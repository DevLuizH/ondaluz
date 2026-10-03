import { dnsHits, isNorvikRevA, isStale, lowMemory, median, opticalBad, planAt, round1, bootedWithin } from "./signal.js";
import type { CpeState, Draft, Member, TicketLite } from "./types.js";
import { HOUR_MS } from "./types.js";

function draft(partial: Omit<Draft, "key">): Draft {
  return {
    ...partial,
    key: `${partial.cause}|${partial.scopeType}|${partial.scopeKey}`,
  };
}

function priority(scopeWeight: number, severity: "high" | "medium" | "low", affected: number): number {
  const sev = severity === "high" ? 3 : severity === "medium" ? 2 : 1;
  return scopeWeight * sev * Math.max(affected, 1);
}

export function detectHour(
  states: Map<string, CpeState>,
  hour: number,
  ponPopulation: Map<string, number>,
  ctoPopulation: Map<string, number>,
  tickets: TicketLite[],
  serialByCustomer: Map<string, string>,
): Draft[] {
  const fresh: CpeState[] = [];
  for (const state of states.values()) {
    if (!isStale(state, hour)) fresh.push(state);
  }

  const drafts: Draft[] = [];
  drafts.push(...opticalDrafts(fresh, ponPopulation, ctoPopulation, hour));
  const firmware = firmwareDraft(fresh, hour);
  if (firmware) drafts.push(firmware);
  drafts.push(...lanDrafts(fresh, hour));
  drafts.push(...wifiDrafts(fresh, hour));
  const dns = dnsDraft(tickets, hour, serialByCustomer);
  if (dns) drafts.push(dns);
  return drafts;
}

function opticalDrafts(
  fresh: CpeState[],
  ponPopulation: Map<string, number>,
  ctoPopulation: Map<string, number>,
  hour: number,
): Draft[] {
  const byPon = new Map<string, CpeState[]>();
  for (const state of fresh) {
    const key = `${state.inv.olt}|${state.inv.ponPort}`;
    const list = byPon.get(key);
    if (list) list.push(state);
    else byPon.set(key, [state]);
  }

  const drafts: Draft[] = [];
  const covered = new Set<string>();

  for (const [ponKey, group] of byPon) {
    const bad = group.filter((state) => opticalBad(state, hour));
    const population = ponPopulation.get(ponKey) ?? group.length;
    const fraction = population > 0 ? bad.length / population : 0;
    const threshold = Math.max(8, Math.ceil(population * 0.15));
    if (bad.length < threshold && fraction < 0.15) continue;

    const [olt, ponPort] = ponKey.split("|");
    const rx = group.map((state) => state.rxDbm).filter((value): value is number => value != null);
    const med = median(rx);
    const below27 = group.filter((state) => state.rxDbm != null && state.rxDbm <= -27).length;
    const fec = Math.round(group.reduce((sum, state) => sum + state.fecDelta, 0));
    const sample = group[0];
    for (const state of group) covered.add(state.inv.serial);

    drafts.push(
      draft({
        cause: "optical",
        scopeType: "pon",
        scopeKey: ponKey,
        severity: "high",
        action: "external_plant",
        priority: priority(100, "high", bad.length),
        affected: bad.length,
        title: `Sinal de fibra caindo na ${olt} porta ${ponPort}`,
        speech:
          "O sinal da fibra no seu trecho está fraco e piorando. Reiniciar o aparelho não resolve. A equipe de rede externa já precisa olhar essa porta. Não é troca de roteador.",
        reason: `${bad.length} de ${population} clientes da ${olt} porta ${ponPort} (${sample.inv.neighborhood}) estão com sinal ruim ou caíram 3 dB ou mais. Mediana agora ${med == null ? "s/d" : round1(med)} dBm. ${below27} abaixo de -27 dBm.`,
        evidence: {
          metric: "optical_rx_dbm",
          olt,
          ponPort,
          neighborhood: sample.inv.neighborhood,
          city: sample.inv.city,
          population,
          affected: bad.length,
          fraction: round1(fraction * 100),
          medianRxDbm: med == null ? null : round1(med),
          belowMinus27: below27,
          fecIncreaseThisHour: fec,
          comparison: "Rx normal da Ondaluz fica perto de -20 dBm. Abaixo de -27 dBm está fora da faixa da classe B+.",
        },
        members: group.map(toMember),
      }),
    );
  }

  const byCto = new Map<string, CpeState[]>();
  for (const state of fresh) {
    if (covered.has(state.inv.serial) || !opticalBad(state, hour)) continue;
    const list = byCto.get(state.inv.cto);
    if (list) list.push(state);
    else byCto.set(state.inv.cto, [state]);
  }

  for (const [cto, bad] of byCto) {
    const population = ctoPopulation.get(cto) ?? bad.length;
    if (bad.length >= 3 && bad.length / population >= 0.3) {
      for (const state of bad) covered.add(state.inv.serial);
      const sample = bad[0];
      drafts.push(
        draft({
          cause: "optical",
          scopeType: "cto",
          scopeKey: cto,
          severity: "high",
          action: "external_plant",
          priority: priority(80, "high", bad.length),
          affected: bad.length,
          title: `Sinal ruim na ${cto}`,
          speech:
            "O sinal da fibra na caixa que atende a sua rua está fraco. Reiniciar não corrige. A equipe de rede externa precisa ver essa caixa, não só o aparelho da sua casa.",
          reason: `${bad.length} de ${population} clientes da ${cto} (${sample.inv.neighborhood}) com Rx degradado.`,
          evidence: {
            metric: "optical_rx_dbm",
            cto,
            olt: sample.inv.olt,
            ponPort: sample.inv.ponPort,
            neighborhood: sample.inv.neighborhood,
            population,
            affected: bad.length,
          },
          members: bad.map(toMember),
        }),
      );
    }
  }

  for (const state of fresh) {
    if (covered.has(state.inv.serial) || !opticalBad(state, hour) || state.rxDbm == null || state.rxDbm > -27) continue;
    drafts.push(
      draft({
        cause: "optical",
        scopeType: "customer",
        scopeKey: state.inv.customerId,
        severity: "medium",
        action: "field_visit",
        priority: priority(10, "medium", 1),
        affected: 1,
        title: `Sinal de fibra baixo no cliente ${state.inv.customerId}`,
        speech:
          "O sinal de fibra que chega na sua casa está abaixo do aceitável. Reiniciar não melhora potência. Vamos agendar uma visita para medir o cabo de drop.",
        reason: `Rx ${round1(state.rxDbm)} dBm no ${state.inv.serial}. A vizinhança da mesma porta não está no mesmo problema, então o defeito parece ser o drop deste cliente.`,
        evidence: {
          metric: "optical_rx_dbm",
          rxDbm: round1(state.rxDbm),
          baselineRxDbm: state.baselineRx == null ? null : round1(state.baselineRx),
          olt: state.inv.olt,
          ponPort: state.inv.ponPort,
          cto: state.inv.cto,
          neighborhood: state.inv.neighborhood,
        },
        members: [toMember(state)],
      }),
    );
  }

  return drafts;
}

function firmwareDraft(fresh: CpeState[], hour: number): Draft | null {
  const fleet = fresh.filter((state) => state.softwareVersion === "2.4.1" && state.inv.vendor === "Kestrel");
  if (fleet.length < 100) return null;
  const sick = fleet.filter((state) => lowMemory(state) || bootedWithin(state, hour, 24 * HOUR_MS));
  if (sick.length / fleet.length < 0.25 && sick.length < 200) return null;
  const low = fleet.filter((state) => lowMemory(state)).length;
  const rebooted = fleet.filter((state) => bootedWithin(state, hour, 24 * HOUR_MS)).length;
  return draft({
    cause: "firmware_memory",
    scopeType: "cohort",
    scopeKey: "Kestrel|KX-3000|2.4.1",
    severity: "high",
    action: "noc",
    priority: priority(40, "high", sick.length),
    affected: sick.length,
    title: "Firmware Kestrel 2.4.1 estoura memória e reinicia",
    speech:
      "O seu equipamento está reiniciando por uma falha da versão 2.4.1. Reiniciar agora pode voltar por algumas horas, e o problema retorna. Vou passar para o NOC aplicar a versão anterior, sem visita.",
    reason: `${sick.length} de ${fleet.length} Kestrel na 2.4.1 estão com menos de 10% de memória livre ou reiniciaram nas últimas 24 h. A 2.3.8 não faz isso. Rollback pelo ACS, não troca de aparelho.`,
    evidence: {
      metric: "mem_free_ratio",
      firmware: "2.4.1",
      fleet: fleet.length,
      lowMemory: low,
      rebooted24h: rebooted,
      affected: sick.length,
      comparison: "A 2.3.8 fica perto de 36% de memória livre. A 2.4.1 cai para cerca de 22% e o pior décimo fica em 6%.",
    },
    members: sick.map(toMember),
  });
}

function lanDrafts(fresh: CpeState[], hour: number): Draft[] {
  const revA: CpeState[] = [];
  const others: CpeState[] = [];
  for (const state of fresh) {
    if (state.lanMbps !== 100) continue;
    if (planAt(state.inv, hour) < 300) continue;
    if (isNorvikRevA(state)) revA.push(state);
    else if (state.lan100Streak >= 3) others.push(state);
  }

  const drafts: Draft[] = [];
  if (revA.length >= 10) {
    drafts.push(
      draft({
        cause: "lan_fast_ethernet",
        scopeType: "cohort",
        scopeKey: "Norvik|NV-G1|A",
        severity: "high",
        action: "field_visit",
        priority: priority(40, "medium", revA.length),
        affected: revA.length,
        title: "Norvik revisão A só entrega 100 mega na porta LAN",
        speech:
          "Este equipamento só consegue entregar cerca de 90 a 100 mega no cabo, e o plano é maior que isso. É limite do aparelho, não do Wi-Fi. O teste de velocidade que a gente dispara daqui mede a fibra e por isso aparece normal. Vamos trocar o equipamento. Reiniciar não muda esse limite.",
        reason: `${revA.length} Norvik NV-G1 revisão A (firmware V1.x) com plano de 300 mega ou mais negociam a LAN sempre em 100 Mbps. A revisão B negocia 1000. O teste TR-143 sai da ONT e fura o plano.`,
        evidence: {
          metric: "lan1_bit_rate",
          valueMbps: 100,
          affected: revA.length,
          hardware: "Norvik NV-G1 rev A",
          comparison: "Toda amostra da revisão A no período está em 100 Mbps. A revisão B está em 1000.",
        },
        members: revA.map(toMember),
      }),
    );
  }

  for (const state of others) {
    drafts.push(
      draft({
        cause: "lan_fast_ethernet",
        scopeType: "customer",
        scopeKey: state.inv.customerId,
        severity: "medium",
        action: "phone",
        priority: priority(10, "medium", 1),
        affected: 1,
        title: `Porta LAN em 100 mega no cliente ${state.inv.customerId}`,
        speech:
          "A porta de rede do equipamento negociou 100 mega, e o plano é maior que isso. Peça para testar outro cabo, de preferência direto no computador. Se continuar em 100, agendamos visita. Não parece ser a fibra.",
        reason: `LAN em 100 Mbps por ${state.lan100Streak} informes seguidos no ${state.inv.vendor} ${state.inv.serial}, plano ${planAt(state.inv, hour)} Mbps. Não é o defeito de fábrica da Norvik rev A.`,
        evidence: {
          metric: "lan1_bit_rate",
          valueMbps: 100,
          streak: state.lan100Streak,
          planMbps: planAt(state.inv, hour),
          vendor: state.inv.vendor,
          serial: state.inv.serial,
        },
        members: [toMember(state)],
      }),
    );
  }
  return drafts;
}

function wifiDrafts(fresh: CpeState[], hour: number): Draft[] {
  const drafts: Draft[] = [];
  for (const state of fresh) {
    if (state.inv.vendor === "Norvik" || state.wifiClients < 1 || state.wifiRaw == null) continue;
    if (opticalBad(state, hour) || lowMemory(state)) continue;
    const poor =
      state.poorWifiStreak >= 2 &&
      (state.inv.vendor === "Tuim" ? state.wifiRaw <= 30 : state.inv.vendor === "Kestrel" ? state.wifiRaw <= -85 : false);
    if (!poor) continue;
    const unit = state.inv.vendor === "Tuim" ? "qualidade 0-100" : "dBm";
    drafts.push(
      draft({
        cause: "wifi",
        scopeType: "customer",
        scopeKey: state.inv.customerId,
        severity: "low",
        action: "phone",
        priority: priority(10, "low", 1),
        affected: 1,
        title: `Wi-Fi fraco no cliente ${state.inv.customerId}`,
        speech:
          "A fibra está boa. O sinal sem fio até os aparelhos da casa está fraco. Aproxime o equipamento do cômodo de uso e prefira a rede 5 GHz. Se no cabo a velocidade vier boa, não precisa de técnico.",
        reason: `RSSI ${state.wifiRaw} (${unit}) com ${state.wifiClients} cliente(s) no ${state.inv.vendor}. Óptico e memória não explicam a lentidão.`,
        evidence: {
          metric: "wifi_rssi",
          value: state.wifiRaw,
          unit,
          clients: state.wifiClients,
          vendor: state.inv.vendor,
        },
        members: [toMember(state)],
      }),
    );
  }
  return drafts;
}

function dnsDraft(tickets: TicketLite[], hour: number, serialByCustomer: Map<string, string>): Draft | null {
  const hit = dnsHits(tickets, hour, hour + HOUR_MS, serialByCustomer);
  if (hit.tickets < 20 || hit.cities < 2) return null;
  return draft({
    cause: "upstream_dns",
    scopeType: "cohort",
    scopeKey: "dns",
    severity: "high",
    action: "noc",
    priority: 500000 + hit.tickets,
    affected: hit.tickets,
    title: "Falha de DNS: site não abre e o Wi-Fi continua conectado",
    speech:
      "Há uma falha nossa na tradução de nomes: o Wi-Fi conecta, mas os sites não abrem. Não é o seu equipamento. Já estamos tratando. O WhatsApp pode continuar funcionando. Não precisa reiniciar nem agendar visita.",
    reason: `${hit.tickets} chamados de sem conexão nesta hora, em ${hit.cities} cidades. Ping de OLT continua verde nesse tipo de falha. O diário só registrou o dns-rec-02 mais tarde, com ping ok.`,
    evidence: {
      metric: "tickets_sem_conexao",
      ticketsThisHour: hit.tickets,
      cities: hit.cities,
      global: true,
      comparison: "Um dia típico tem cerca de 15 chamados de sem conexão no dia inteiro. Dezenas numa hora, espalhados, não é CPE.",
    },
    members: hit.members,
  });
}

function toMember(state: CpeState): Member {
  return { serial: state.inv.serial, customerId: state.inv.customerId };
}
