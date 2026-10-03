# Ondaluz

Protótipo de detecção para o teste técnico. O diagnóstico, a arquitetura e o log de decisões estão em `docs/`.

## Dados

O pacote não vai no Git. Coloque a pasta ao lado deste arquivo, com os CSVs dentro de `data/`:

```
ondaluz-pack/data/inventory.csv
ondaluz-pack/data/informs.csv.gz
ondaluz-pack/data/tickets.csv
ondaluz-pack/data/diagnostics.csv
```

## Rodar

É preciso Docker.

```
docker compose up --build
```

A primeira subida carrega o dataset e percorre as oito semanas em ordem. Leva vários minutos. Quando o serviço `bootstrap` terminar, a interface fica em http://localhost:8080 e a API em http://localhost:3001.

- NOC: incidentes abertos na hora escolhida, separados em trecho de rede, coorte e cliente.
- Suporte: código do cliente. A tela diz a ação e o texto da ligação.

O relógio no topo vale para as duas telas. “4 ago, 21h” é a noite em que os chamados de sem conexão disparam juntos.

Para reprocessar do zero:

```
docker compose down -v
docker compose up --build
```

Banco local do compose: usuário `ondaluz`, senha `ondaluz`, database `ondaluz`. Não é credencial de produção.
