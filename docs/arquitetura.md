# Arquitetura

Detecção contínua dos problemas vistos no diagnóstico, desenhada para a Ondaluz e para um parque de cerca de 300 mil CPEs. O protótipo roda o mesmo miolo sobre as 8 semanas do dataset.

## Fluxo

O Inform chega, vira estado do CPE, os detectores emitem sinais, o agrupador abre ou atualiza um incidente, a API só lê.

No protótipo o Inform chega de arquivo (`ondaluz-pack/data/informs.csv.gz`), copiado para uma hypertable no TimescaleDB. Um job percorre o tempo em ordem, de hora em hora, e grava o ciclo de vida do incidente (`opened_at`, `updated_at`, `resolved_at`). A tela consulta um instante `as_of`: o que estava aberto naquela hora.

Em produção o bloco do arquivo é trocado por um adaptador do ACS. O resto permanece.

```
ACS ou arquivo
    -> IngestPort
    -> informs (hypertable em ts, chunk de 1 dia)
    -> StateStore do CPE
    -> Detector
    -> Aggregator
    -> incidents + incident_members
    -> API
    -> NOC e suporte N1
```

Fronteiras, para a troca não reescrever o miolo:

- `IngestPort`: arquivo no protótipo. Em 300 mil CPEs, fila (Redis Streams ou NATS) entre o ACS e os workers. 300 mil equipamentos a cada 2 horas são cerca de 3,6 milhões de Informs por dia.
- `StateStore`: `Map` em memória no protótipo (cerca de 8 mil CPEs). Em escala, estado fragmentado por hash do serial, em Postgres ou Redis, porque um processo só não segura 300 mil com folga de replay.
- `Detector`: função sobre o estado, os pares da mesma porta e a hora. Devolve sinal ou nada. Não fica no handler HTTP.
- `Aggregator`: sinais viram um incidente com escopo (cliente, CTO, porta PON, ou coorte).
- `AlertSink`: tabela no protótipo. Webhook ou pager fica fora da primeira versão.

O relógio interno é UTC. Chamados vêm em horário de Brasília e a correlação converte. O plano vigente na hora do Inform usa `plan_since`: antes dessa data vale `previous_plan_mbps`. Sem isso, a Norvik revisão A seria acusada de limite de 100 mega mesmo quando o cliente ainda estava no plano de 100.

## O que cada detector procura

Limiares saíram do diagnóstico, não de um modelo. Cada um pode ser desligado tirando a função de `detectHour`.

- Óptico. A unidade não é a mesma entre fabricantes: Kestrel manda dBm vezes 1.000, Norvik manda a recepção em miliwatt, Tuim já manda dBm. Tudo vira dBm antes da regra. Sinal ruim é abaixo de −27 dBm, ou abaixo de −25 com queda de 3 dB contra as primeiras 12 amostras daquele CPE. Se a porta PON passa de 8 CPEs ou de 15% da porta, o incidente é da porta e a ação é rede externa. CTO entra quando a porta não explica e três ou mais clientes da mesma caixa caíram juntos. Um CPE isolado abaixo de −27, com a porta saudável, vira visita de drop.
- Firmware. Coorte `Kestrel 2.4.1` quando pelo menos um quarto da frota (ou 200 CPEs) está com menos de 10% de memória livre ou reiniciou em 24 horas. Ação: NOC, rollback. Não é visita.
- LAN. Norvik revisão A com plano de 300 mega ou mais e porta negociada em 100 Mbps vira uma coorte só, ação de troca em campo. Nos outros fabricantes, 100 Mbps por três Informs seguidos, com plano alto, é caso de cabo: resolver no telefone.
- Wi-Fi. Kestrel com RSSI pior ou igual a −85 dBm, ou Tuim com qualidade 0–100 pior ou igual a 30, por duas amostras, com cliente conectado, e só se o óptico e a memória não explicam. Ação: telefone. A escala da Tuim não é dBm; misturar as duas geraria alarme falso em massa.
- DNS. Vinte ou mais chamados de “sem conexão” na mesma hora, em pelo menos duas cidades. O Inform da CPE não carrega DNS. O sinal está no chamado, e o incidente vale para qualquer cliente enquanto estiver aberto, porque quem liga naquela hora não é um aparelho. Ação: NOC.

Um incidente some depois de 6 horas sem o sinal voltar. A mesma causa e o mesmo escopo não abrem outro registro enquanto o anterior segue aberto.

Prioridade é clientes afetados vezes o peso do escopo (porta de rede pesa mais que um cliente) vezes a severidade. O DNS ativo recebe um piso alto de propósito: na hora em que a cidade inteira não abre site, ele fica na frente do firmware crônico. Não é um score opaco. O custo unitário usado no diagnóstico (chamado R$ 18, visita R$ 120, rede externa R$ 650, Norvik B R$ 190 mais visita) não entra na fórmula; entra na ordem de ação do documento para a diretoria.

## O que a tela faz

Sem login. O mesmo relógio vale para os dois perfis.

O NOC vê três grupos: trecho de rede, coorte e cliente isolado, ordenados pela prioridade. O detalhe traz a evidência, o texto que o suporte deve usar e uma amostra dos clientes.

O N1 informa o código do cliente e recebe uma ação (telefone, NOC, visita ou rede externa), o que falar e o porquê. Se houver teste TR-143 até aquele instante, a tela lembra que o teste não atravessa o cabo nem o Wi-Fi. Nada disso dispara RPC no equipamento.

## Banco

TimescaleDB, que é Postgres com hypertable. O Inform é série temporal: 5,5 milhões de linhas nestas 8 semanas, e cerca de 3,6 milhões por dia em 300 mil CPEs. Particionar por dia e continuar fazendo join em SQL com inventário, chamado e incidente evita um segundo banco. ClickHouse foi descartado por isso. Postgres puro também foi descartado: sem chunk e compressão, a retenção de Inform em um ano (centenas de bilhões de linhas se não houver descarte) deixa de ser operacional.

Retenção, descrita aqui e não aplicada no dataset de 8 semanas: Inform cru por 30 a 90 dias; incidente e agregado por mais tempo. O protótipo guarda o período inteiro porque o replay precisa dele.

O replay não anda linha a linha no Node. Lê um dia, aplica hora a hora, e o estado do CPE atravessa a fronteira da hora. O efeito causal é o de um fluxo ordenado. Em produção o “dia” vira o lote que sai da fila.

`docker compose up` sobe o Timescale, o job de carga e replay, a API e o nginx da interface. O job não repete a carga se `bootstrap_state` já estiver marcado. Para reprocessar, `docker compose down -v`.

## Decisões que ficaram de fora do código de propósito

- Executar reboot, teste de velocidade ou qualquer RPC TR-069. A tela recomenda. Quem aplica é o NOC, no ACS.
- Reinício em massa e fluxo de compra de equipamento.
- Ping de OLT. O Zabbix já faz, e o dataset não traz essa série. O ponto do diagnóstico é que ping verde não absolve a CPE.
- Auth, RBAC e vários provedores. Um `tenant_id` nas tabelas de inventário, Inform e incidente é a extensão. Este código é um provedor só.
- Modelo de ML. As causas são regras com grupo de controle (2.4.1 contra 2.3.8, revisão A contra B, porta contra a porta vizinha). Um modelo não explicaria melhor para o Ricardo e seria mais fácil de errar a unidade óptica.
- Contador de bytes da WAN como detector. Uso médio não separa “link lento” de “cliente dormindo”. O TR-143 cobre o teste sob demanda, e mesmo assim não vê a LAN.
- WebSocket e pager. A consulta por `as_of` basta para o turno e para rever uma hora passada.

## Escala, sem fingir que o protótipo já é ela

O job único cabe em 8 mil CPEs e em algumas horas de replay. Em 300 mil, a ingestão não pode ser um `COPY` noturno: o ACS entrega contínuo, a fila absorve pico, e os workers de detector são vários, cada um dono de uma fatia de seriais. O agrupador de porta PON precisa ver a fatia inteira da porta, então ou a fatia é por porta, ou existe um segundo estágio que só recebe o sinal já resumido (serial, causa, hora). A segunda opção escala melhor e é a que este desenho assume: o worker não abre o incidente de porta sozinho em produção; publica o sinal, e um agregador com estado pequeno por porta decide.

O que não muda com o tamanho do parque é a regra. Unidade óptica por fabricante, comparação com o próprio histórico e com a porta, e incidente que diz o escopo. Isso é o que evita repetir o mês em que cada área tinha uma teoria e o painel estava verde.
