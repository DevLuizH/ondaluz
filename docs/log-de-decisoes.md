# Log de decisões

## Hipóteses

Testadas contra inventário, chamados, testes de velocidade e os 5,5 milhões de Informs. A semana é de segunda a domingo, começando em 6 de julho de 2026.

- Tuim é equipamento ruim e o Jardim Aurora puxou os chamados. Descartada como causa geral. Fora das portas 1/7 e 1/8 da OLT-2, o Tuim não acompanha a curva. Dentro dessas portas o óptico cai e o FEC explode na porta inteira. A expansão é Tuim, o defeito é a fibra. Trocar a marca não devolve o sinal.
- Reinício em massa às 4h resolveria, porque na ligação resolve. Descartada como ação. Na Kestrel 2.4.1 o reinício zera uma memória que volta a encher. Na Norvik revisão A e na fibra, reiniciar não muda o sintoma.
- A rede está verde, então é Wi-Fi da casa. Descartada como explicação do aumento. A categoria Wi-Fi ficou perto de 80 chamados por semana o período todo. O teste TR-143 passa o plano porque sai da ONT; não atravessa LAN nem Wi-Fi.
- O Turbo 500 não tem relação com os chamados. Descartada em parte. Não explica firmware nem as duas portas. Explica a lentidão da Norvik revisão A: a porta é 100 Mbps e o plano foi para 300 ou 500. A segunda semana do recorte já inclui o início da campanha, então a conta de “+30%” subestima esse item.
- Kestrel 2.4.1 piorou memória e reinício. Mantida. A 2.3.8, que não recebeu o lote, ficou estável em memória e em reinício. A divergência começa na semana da atualização (20 a 24 de julho). A release note diz o contrário do que a telemetria mostra. A wiki pode estar certa no texto e errada no efeito.
- Norvik revisão A limitada a Fast Ethernet. Mantida. Toda amostra da V1.0.9 está em 100 Mbps. A revisão B está em 1.000. Chamados descrevem cerca de 90 mega no cabo. O speedtest mediano desses seriais, no plano 500, fica perto de 470 Mbps.
- Degradação óptica nas portas 1/7 e 1/8. Mantida. Mediana e a fatia abaixo de −27 dBm pioram semana a semana a partir do fim de julho, junto com o FEC e com os chamados. As portas vizinhas 1/1 a 1/5 não repetem o padrão. A 1/6 já tinha FEC alto desde o início, sem a queda de potência, então não foi tratada como o mesmo incidente.
- Pico de 4 de agosto é queda de CPE. Descartada. 98 chamados de sem conexão no dia, 89 deles entre 19h e 23h, em várias cidades. O texto é página que não abre, WhatsApp que segue, “servidor não encontrado”. O diário só anota dns-rec-02 das 22h40 às 23h10, com ping ok. A causa é DNS, com confiança média-alta: o sintoma e a hora batem, o diário não cobre o começo às 19h. Não é o que segura o aumento das seis semanas. O 4 de agosto cai na semana de 3 de agosto, fora das duas últimas.
- Contador de bytes da WAN mostraria congestionamento. Não usada como regra. Uso médio não separa link ruim de casa vazia, e o speedtest já mostra a WAN entregando o plano nos casos acima.

## Ambiguidades, e o que foi decidido

- Unidades ópticas diferentes por fabricante. A wiki não diz isso. Decisão: normalizar antes de qualquer limiar (Kestrel dividido por 1.000, Norvik em mW convertido com log, Tuim já em dBm). Sem isso, a Norvik pareceria sinal absurdo e a Kestrel pareceria alarme permanente.
- RSSI da Tuim é qualidade de 0 a 100, não dBm. A wiki diz. Decisão: limiar separado. Não comparar com −75 dBm.
- `software_version` do inventário é o estado no fim do período. Usar isso para rotular chamado de julho atribui a 2.4.1 gente que ainda estava na 2.3.8. Decisão: o detector usa a versão que veio no Inform daquela hora. O diagnóstico da frota usa o corte depois de 27 de julho, quando o lote 1 já tinha assentado, e compara com quem terminou na 2.3.8.
- Plano no Inform. O inventário só tem o plano final. Decisão: antes de `plan_since`, vale `previous_plan_mbps`. A coorte da Norvik só abre quando o plano daquela hora é de 300 mega ou mais.
- FEC alto nas portas 1/4 e 1/6 desde a primeira semana, com potência estável. Decisão: não virar incidente de planta. O FEC entra como evidência quando a potência da porta também cai, que é o caso de 1/7 e 1/8.
- Escopo do DNS. A lista prevista era cliente, CTO, PON, OLT e coorte. Uma falha de resolver não é uma OLT. Decisão: coorte `dns`, marcada como global, para o N1 ver o texto em qualquer cliente enquanto o incidente está aberto.
- Muitos clientes com LAN em 100 Mbps por cabo ruim. Decisão: coorte só para a Norvik revisão A, que é o hardware. Nos outros, incidente de cliente, e só depois de três Informs seguidos, com ação de telefone. São centenas de casas. O quadro do NOC não lista esses casos, para não cobrir as duas portas e as duas coortes. O suporte, ao abrir o cliente, continua vendo o texto do cabo.
- Churn de 5% para quem tem dois chamados em 30 dias. É taxa da empresa, não um cancelamento observado. Decisão: citar como risco, e registrar que os 169 cancelamentos do período ainda cabem no 1,1% mensal.

## Uso de IA

Usei o assistente do Cursor (Grok) para ler o enunciado, cruzar os CSVs e escrever o protótipo. As consultas rodam em DuckDB sobre o arquivo, e os números do diagnóstico saem dessas consultas, não de uma conclusão sugerida pelo modelo. Onde a wiki e a telemetria divergem (memória da 2.4.1, unidade óptica, horário do DNS contra o diário), ficou o que o dado mede. O log e os limiares foram revisados contra essas consultas antes de entrarem no detector.
