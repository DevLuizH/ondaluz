# O que está acontecendo na Ondaluz

Para o Ricardo. Período analisado: 6 de julho a 30 de agosto de 2026.

O aumento é real e é técnico. Nas duas primeiras semanas houve 825 chamados de lentidão, queda ou Wi-Fi. Nas duas últimas, 1.058. São 233 a mais, cerca de 28%. Wi-Fi, como categoria, não subiu. Financeiro, cadastro e cancelamento também não explicam a fila. O cancelamento do período (169 clientes) ainda está perto do churn médio de 1,1% ao mês. O caixa de cancelamento ainda não estourou. O que já estourou é o suporte: da segunda semana em diante a mesa passou da capacidade de 600 chamados, e o excedente custa R$ 27 em vez de R$ 18.

Não é uma causa só, e não começou no mesmo dia. Três problemas se sobrepõem. A comparação “duas primeiras contra duas últimas” esconde parte de um deles, porque a segunda semana já estava contaminada.

## 1. Firmware Kestrel 2.4.1 reinicia sozinho

Confiança alta.

O lote 1 foi para a versão 2.4.1 entre 20 e 24 de julho. Cerca de 2.000 equipamentos. Os outros 1.600 Kestrel ficaram na 2.3.8, o grupo de controle que a própria Ondaluz criou ao deixar o lote 2 para setembro.

Na 2.3.8 a memória livre fica em torno de 36%. Na 2.4.1 cai para cerca de 22%, e o décimo pior fica em 6%. Quase toda a frota 2.4.1 passa de 10% de memória livre ocupada demais. Reinícios: cerca de 2.500 por semana na 2.4.1, contra cerca de 300 na 2.3.8. A nota de release falava em otimização de memória. O efeito medido é o contrário.

É por isso que reiniciar “resolve” na ligação. A memória esvazia e o cliente volta por algumas horas. Não é cura.

Custo de agir: rollback pelo ACS, sem visita. A Kestrel corrige firmware em 30 a 60 dias se receber a evidência. Não dá para esperar esse prazo com a base reiniciando.

Custo de não agir: na ordem de 60 chamados técnicos a mais por semana do que a 2.3.8 produz na mesma taxa, algo como R$ 1,1 mil por semana só de atendimento, mais visita marcada à toa e o risco de churn de quem já ligou duas vezes (219 clientes dessa frota em 30 dias).

## 2. Fibra piorando em duas portas do Jardim Aurora

Confiança alta.

Não é o bairro inteiro e não é a marca Tuim. Na OLT-2, as portas 1/7 e 1/8 (116 clientes) tinham sinal mediano perto de −22 dBm no começo de julho, dentro do normal. No fim de agosto a mediana da 1/7 foi a −26,9 dBm, com 44% das amostras abaixo de −27 dBm, que é o limite da classe B+. A 1/8 foi para −26,4 dBm. O contador de erro de fibra (FEC que o equipamento não consegue corrigir) saiu de centenas por semana para dezenas de milhões, na porta inteira, não num aparelho só.

As portas 1/1 a 1/5 do mesmo bairro não fizeram esse movimento. A 1/5, que a wiki põe no mesmo alimentador da caixa CE-JA-03, continuou saudável. Então não é “o Jardim Aurora” nem “trocar todo Tuim”. É um trecho físico a partir dessas duas portas. Os chamados seguem a curva: nas duas primeiras semanas, cerca de 10 chamados técnicos nessas portas; nas duas últimas, 152. Isso sozinho explica a maior parte das 233 ligações a mais da comparação que a diretoria pediu.

Já saíram 73 visitas técnicas marcadas para clientes dessas portas, cerca de R$ 8,8 mil, para um defeito que o técnico de campo mede “o sinal do vizinho também ruim” e não resolve trocando o roteador.

Custo de agir: um acionamento de rede externa, R$ 650, talvez dois se 1/7 e 1/8 não compartilham o mesmo ponto. Custo de não agir: a curva ainda está caindo, e 61 desses clientes já têm dois ou mais chamados em 30 dias, faixa em que o churn da casa sobe para cerca de 5% ao mês.

## 3. Norvik revisão A não entrega plano acima de 100 mega

Confiança alta.

A revisão A (firmware V1.0.9, 875 aparelhos) negocia a porta de rede sempre em 100 Mbps. Todas as amostras do período. A revisão B negocia 1.000. O Turbo 500, a partir de 13 de julho, subiu 377 desses clientes para 500 mega e outros já estavam em 300. São 438 aparelhos vendendo plano que a porta não consegue entregar. No cabo, o cliente vê cerca de 90 mega. O texto do chamado repete isso: “contratei 500 e só chega 90”, “testou no notebook direto no cabo”.

O teste de velocidade do NOC dá mediana de cerca de 470 Mbps nesses mesmos equipamentos, porque o teste sai da ONT em direção à rede da Ondaluz e não passa pela porta de 100 mega. Por isso o painel fica verde e o cliente continua lento.

A segunda semana do período já inclui o começo da campanha. Por isso a comparação “duas primeiras contra duas últimas” diminui este item. Olhando a semana limpa de 6 a 12 de julho, o salto até o fim de agosto é de 364 para 577 chamados técnicos (+59%), não 28%.

Custo de agir: trocar os 438 que estão em 300 mega ou mais por Norvik revisão B. Equipamento R$ 190 mais visita R$ 120, cerca de R$ 136 mil. Os 437 que continuam no plano de 100 mega não precisam de troca até mudarem de plano. Travar upgrade de Turbo 500 em revisão A até a troca.

Custo de não agir: dezenas de chamados por semana que o NOC devolve como “Wi-Fi”, o cliente pagando R$ 129,90 por um serviço de 100 mega, e 127 desses clientes já na faixa de dois chamados em 30 dias.

## O que fazer, e em que ordem

1. Rollback da 2.4.1 para a 2.3.8, hoje, pelo ACS. É remoto, atinge cerca de 2.000 casas e para o problema que o reinício só adia. Abrir chamado na Kestrel com a lista de seriais, a memória e a taxa de reinício contra a 2.3.8.
2. Rede externa na OLT-2, portas 1/7 e 1/8, nesta semana. Não trocar o Tuim dessas casas enquanto o sinal da porta não voltar.
3. Trocar a Norvik revisão A que está em plano de 300 mega ou mais. Pausar o Turbo 500 nesse hardware até a troca. A revisão B e os outros fabricantes entregam o plano no teste e na porta.
4. Não fazer o resto agora. Wi-Fi fraco existe, é caso a caso, e o volume semanal dessa categoria ficou estável, perto de 80 chamados.

## O que fazer com o que já está na mesa

Trocar todos os Tuim por cerca de R$ 1,2 milhão. Não. Fora das portas 1/7 e 1/8, o Tuim não explica a subida. A cotação bate com a conta (2.477 aparelhos vezes R$ 410 mais a visita), e compra o equipamento errado para o lugar errado. O Jardim Aurora parece Tuim porque a expansão foi Tuim, e o defeito novo está em duas portas dessa expansão.

Reiniciar todo mundo às 4 da manhã. Não. No Kestrel 2.4.1 o reinício alivia porque zera a memória, e o vazamento volta. Na fibra e na Norvik revisão A, reiniciar não mexe no sinal nem nos 100 mega da porta. Gasta janela de manutenção para mascarar um firmware que já tem rollback.

“Está tudo verde, é Wi-Fi da casa.” O ping da OLT não vê firmware, não vê porta LAN e não vê uma fibra que ainda responde. O teste de velocidade, do jeito que é feito, também não vê a porta de 100 mega. Wi-Fi é o ruído de fundo, não a tendência.

“O Turbo 500 não tem nada a ver.” Tem, com a Norvik revisão A. Não tem com o firmware Kestrel nem com as duas portas do Aurora. A campanha foi bem executada no sistema. O aparelho antigo é que não acompanha o plano novo.

## Risco de cancelamento, sem fingir que já aconteceu

703 clientes tiveram dois ou mais chamados técnicos em 30 dias. A própria regra da casa diz que esse grupo cancela a cerca de 5% ao mês, contra 1,1% da base. Se essa taxa valer para o grupo inteiro, são cerca de R$ 10 mil por mês de aquisição para repor (3,9 pontos a mais vezes 703 vezes R$ 380). Isso é risco, não caixa realizado: o cancelamento observado no período ainda está no patamar antigo. A janela para agir é antes desse risco virar baixa.
